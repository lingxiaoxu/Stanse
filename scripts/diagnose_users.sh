#!/bin/bash

# Stanse用户诊断脚本
# 用于调查为什么3个登录用户只显示2个在线

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:8080}"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Stanse 用户在线状态诊断${NC}"
echo -e "${BLUE}================================${NC}\n"

# 1. 检查后端全局统计
echo -e "${YELLOW}1. 后端全局统计:${NC}"
curl -s "$API_URL/api/v1/stats/global" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    print(f\"  在线盟友: {data['data']['active_allies_online']}\")
    print(f\"  总分片数: {data['data']['total_shards']}\")
    print(f\"  活动campaigns: {data['data']['total_active_campaigns']}\")
else:
    print(f\"  错误: {data.get('error', 'Unknown')}\")
"
echo ""

# 2. 检查每个shard的节点分布
echo -e "${YELLOW}2. 各Shard节点分布:${NC}"
curl -s "$API_URL/api/v1/shards" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    total_nodes = 0
    for shard in data['data']:
        nodes = shard['active_nodes']
        if nodes > 0:
            print(f\"  ✓ {shard['shard_id']}: {nodes} 节点在线\")
            total_nodes += nodes
        else:
            print(f\"  - {shard['shard_id']}: 0 节点\")
    print(f\"\n  总计: {total_nodes} 个节点分布在所有shards中\")
else:
    print(f\"  错误: {data.get('error', 'Unknown')}\")
"
echo ""

# 3. 检查blockchain统计
echo -e "${YELLOW}3. Blockchain状态:${NC}"
curl -s "$API_URL/api/v1/blockchain/stats" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['success']:
    print(f\"  区块总数: {data['data']['total_blocks']}\")
    print(f\"  交易总数: {data['data']['total_transactions']}\")
    print(f\"  TPS: {data['data']['transactions_per_second']}\")
else:
    print(f\"  错误: {data.get('error', 'Unknown')}\")
"
echo ""

# 4. 测试heartbeat端点（模拟请求）
echo -e "${YELLOW}4. Heartbeat端点测试:${NC}"
echo "  测试发送heartbeat请求..."
TEST_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/users/heartbeat" \
  -H "Content-Type: application/json" \
  -d '{"firebase_uid":"test_diagnostic_user","is_online":true}')

echo "$TEST_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('success'):
    print('  ✓ Heartbeat端点正常工作')
else:
    print(f\"  ✗ Heartbeat失败: {data.get('error', 'Unknown')}\")
"
echo ""

# 5. 建议检查步骤
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}诊断建议${NC}"
echo -e "${BLUE}================================${NC}\n"

echo "请在3个浏览器中分别打开开发者工具Console，检查:"
echo ""
echo "1. 查找 '🚀 Starting Polis Protocol heartbeat' 消息"
echo "   - 如果看到此消息：用户已完成onboarding并开始发送heartbeat"
echo "   - 如果没有：用户还没完成onboarding问卷"
echo ""
echo "2. 查找 '✅ User registered with Polis DID' 消息"
echo "   - 显示用户成功注册到Polis Protocol"
echo ""
echo "3. 查找 '⚠️ Heartbeat failed' 或 '❌ Error' 消息"
echo "   - 表示heartbeat发送失败"
echo ""
echo "4. 检查Network标签中的请求:"
echo "   - POST ${API_URL}/api/v1/users/register"
echo "   - POST ${API_URL}/api/v1/users/heartbeat"
echo ""
echo -e "${GREEN}提示：${NC}只有完成onboarding的用户才会被计入\"Active Allies Online\""