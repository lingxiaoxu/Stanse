#!/bin/bash

# 快速检查在线用户脚本

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}当前在线用户状态${NC}"
echo -e "${BLUE}================================${NC}\n"

# 1. 全局统计
echo -e "${YELLOW}在线用户总数:${NC}"
curl -s http://localhost:8080/api/v1/stats/global | python3 -c "
import sys, json
data = json.load(sys.stdin)
count = data['data']['active_allies_online'] if data.get('success') else 0
print(f'  {count} 个用户在线')
" 2>/dev/null || echo "  无法获取数据"

echo ""

# 2. 各shard分布
echo -e "${YELLOW}用户分布详情:${NC}"
curl -s http://localhost:8080/api/v1/shards | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('success'):
    total = 0
    for shard in data['data']:
        nodes = shard['active_nodes']
        if nodes > 0:
            print(f\"  • {shard['shard_id']}: {nodes} 个用户\")
            total += nodes
    if total == 0:
        print('  (暂无在线用户)')
" 2>/dev/null || echo "  无法获取数据"

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${YELLOW}检查步骤:${NC}\n"

echo "请在3个浏览器中分别操作："
echo ""
echo "1️⃣  打开开发者工具:"
echo "   Mac: Cmd + Option + J"
echo "   Windows: Ctrl + Shift + J"
echo ""
echo "2️⃣  在 Console 标签搜索框中输入:"
echo "   \"heartbeat\""
echo ""
echo "3️⃣  查看结果:"
echo "   ✅ 看到 '🚀 Starting Polis Protocol heartbeat' → 已注册"
echo "   ❌ 什么都没有 → 未完成onboarding"
echo ""
echo -e "${GREEN}提示：${NC}只有完成政治立场问卷的用户才会被计入在线统计"
