#!/bin/bash

# Polis Protocol - 负载测试脚本 (使用 curl)
# 简单可靠的负载测试工具

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:8080}"
TOTAL_REQUESTS=100

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Polis Protocol 负载测试${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "API URL: ${GREEN}$API_URL${NC}"
echo -e "每个端点请求数: ${GREEN}$TOTAL_REQUESTS${NC}"
echo ""

# 检查服务器
echo -e "${YELLOW}检查服务器状态...${NC}"
if curl -sf "$API_URL/api/v1/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 服务器在线${NC}\n"
else
    echo -e "${RED}✗ 服务器离线${NC}"
    exit 1
fi

# 创建结果目录 (项目根目录下的logs/load-tests)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESULTS_DIR="$PROJECT_ROOT/logs/load-tests/load_test_results_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}测试结果将保存到: $RESULTS_DIR${NC}\n"

# 初始化CSV
echo "测试名称,请求/秒,平均响应时间(ms),失败请求数,成功率(%)" > "$RESULTS_DIR/summary.csv"

# 测试函数
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local requests="$3"

    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}测试: $name${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    local url="$API_URL$endpoint"
    local success=0
    local total_time=0
    local response_times=()

    local start_time=$(date +%s)

    for ((i=1; i<=$requests; i++)); do
        local req_start=$(date +%s%N)
        if curl -sf --max-time 30 "$url" > /dev/null 2>&1; then
            ((success++))
            local req_end=$(date +%s%N)
            local elapsed=$(( (req_end - req_start) / 1000000 ))
            response_times+=($elapsed)
            total_time=$((total_time + elapsed))
        fi

        # 显示进度 (每10个请求)
        if [ $((i % 10)) -eq 0 ]; then
            echo -ne "\r进度: $i/$requests [$(( i * 100 / requests ))%]"
        fi
    done

    local end_time=$(date +%s)
    echo "" # 换行

    local failed=$((requests - success))
    local success_rate=$(awk "BEGIN {printf \"%.2f\", ($success / $requests) * 100}")
    local avg_time=$(awk "BEGIN {printf \"%.2f\", $total_time / $success}")
    local duration=$((end_time - start_time))
    local rps=$(awk "BEGIN {printf \"%.2f\", $requests / $duration}")

    echo -e "请求总数: ${GREEN}$requests${NC}"
    echo -e "成功: ${GREEN}$success${NC} | 失败: ${RED}$failed${NC}"
    echo -e "成功率: ${GREEN}${success_rate}%${NC}"
    echo -e "总时间: ${GREEN}${duration}s${NC}"
    echo -e "平均响应时间: ${GREEN}${avg_time}ms${NC}"
    echo -e "请求/秒: ${GREEN}${rps}${NC}"
    echo ""

    # 保存到CSV
    echo "$name,$rps,$avg_time,$failed,$success_rate" >> "$RESULTS_DIR/summary.csv"
}

# 动态获取真实在线用户
echo -e "${YELLOW}准备测试数据...${NC}"
REAL_USER_DID=""

# 尝试从/api/v1/users/online端点获取在线用户
ONLINE_RESPONSE=$(curl -sf "$API_URL/api/v1/users/online" 2>/dev/null || echo "")
if [ -n "$ONLINE_RESPONSE" ]; then
    # 从JSON响应中提取第一个用户的polis_did
    # 响应格式: {"success":true,"data":[{"firebase_uid":"...","polis_did":"did:polis:firebase:...","is_online":true}],...}
    REAL_USER_DID=$(echo "$ONLINE_RESPONSE" | grep -o '"polis_did":"[^"]*"' | head -1 | sed 's/"polis_did":"//;s/"$//')
fi

if [ -z "$REAL_USER_DID" ]; then
    echo -e "${YELLOW}⚠️  未找到在线用户，将跳过用户影响力测试${NC}"
else
    echo -e "${GREEN}✓ 找到真实在线用户: $REAL_USER_DID${NC}"
fi
echo ""

# 运行所有测试
echo -e "${GREEN}开始测试...${NC}\n"

# 核心健康检查
test_endpoint "Health Check" "/api/v1/health" 200

# 统计和区块链端点（读取Firestore真实数据）
test_endpoint "Global Stats (Firestore)" "/api/v1/stats/global" 150
test_endpoint "Blockchain Stats" "/api/v1/blockchain/stats" 150
test_endpoint "Shards Info" "/api/v1/shards" 100

# 活动数据（Firestore查询）
test_endpoint "Campaigns List (Firestore)" "/api/v1/campaigns" 100

# 用户影响力（仅当有真实用户时测试）
if [ -n "$REAL_USER_DID" ]; then
    test_endpoint "User Impact (Firebase Real User)" "/api/v1/user/$REAL_USER_DID/impact" 100
fi

# 系统监控
test_endpoint "Metrics (Prometheus)" "/metrics" 50

# TODO: 添加FEC数据端点测试（当实现后）
# 这些端点尚未在backend实现，需要在api_server.rs中添加：
# test_endpoint "Company FEC Politics" "/api/v1/company/hallmark/fec-politics" 50
# test_endpoint "Company Party Donations" "/api/v1/company/walmart/party-donations" 50
# test_endpoint "FEC Company Search" "/api/v1/fec/companies?search=microsoft" 50

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}测试完成!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}测试汇总:${NC}\n"
column -t -s',' "$RESULTS_DIR/summary.csv"
echo ""

# 生成简单的文本报告
cat > "$RESULTS_DIR/report.txt" << EOF
Polis Protocol 负载测试报告
==========================================

测试时间: $(date '+%Y-%m-%d %H:%M:%S')
API URL: $API_URL

测试结果:
$(cat "$RESULTS_DIR/summary.csv")

详细结果已保存到: $RESULTS_DIR
EOF

echo -e "${GREEN}✓ 结果已保存到: $RESULTS_DIR${NC}"
echo -e "${GREEN}✓ 报告: $RESULTS_DIR/report.txt${NC}"
echo -e "${GREEN}✓ CSV: $RESULTS_DIR/summary.csv${NC}"
