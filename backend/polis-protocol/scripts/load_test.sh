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
        if curl -sf "$url" > /dev/null 2>&1; then
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

# 运行所有测试
echo -e "${GREEN}开始测试...${NC}\n"

test_endpoint "Health Check" "/api/v1/health" 200
test_endpoint "Global Stats" "/api/v1/stats/global" 150
test_endpoint "Blockchain Stats" "/api/v1/blockchain/stats" 150
test_endpoint "Shards Info" "/api/v1/shards" 100
test_endpoint "Campaigns List" "/api/v1/campaigns" 100
test_endpoint "User Impact (Firebase)" "/api/v1/user/did:polis:firebase:lx82_yahoo_com/impact" 100
test_endpoint "Metrics (Prometheus)" "/metrics" 50

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
