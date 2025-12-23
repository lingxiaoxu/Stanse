#!/bin/bash
#
# 自动重启的 FEC 数据上传脚本
# 每次运行限制在 45 分钟内，之后自动重启以避免 token 过期
#
# 用法:
#   ./09-run-with-restart.sh              # 上传所有表
#   ./09-run-with-restart.sh transfers    # 只上传transfers表

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 确定要上传的表
if [ -z "$1" ]; then
    TABLE_ARG=""
    TABLE_NAME="all"
else
    TABLE_ARG="--only $1"
    TABLE_NAME=$(echo "$1" | tr ',' '-')
fi

# 生成日志文件名（格式：02-upload-{表名}-yyyymmdd-hhmmss.log）
LOG_FILE="/Users/xuling/code/Stanse/logs/fec-data/02-upload-${TABLE_NAME}-$(date +%Y%m%d-%H%M%S).log"

# 重定向所有输出到日志文件和终端
exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "========================================"
echo "🔄 FEC 数据自动上传（带自动重启）"
echo "========================================"
echo "📊 上传表: ${1:-所有表}"
echo "📁 日志文件: $LOG_FILE"
echo ""

# 检查进度
if [ -f "upload_progress.json" ]; then
    UPLOADED=$(python3 -c "import json; d=json.load(open('upload_progress.json')); print(d.get('contributions_uploaded', 0))")
    echo "📊 当前进度: $UPLOADED 条 contributions 已上传"
    echo ""
fi

RUN_COUNT=0

while true; do
    RUN_COUNT=$((RUN_COUNT + 1))
    echo "🚀 第 $RUN_COUNT 轮上传开始 (限时 45 分钟)"
    echo "⏰ 开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # 运行上传脚本，限时 45 分钟 (2700 秒)
    timeout 2700 python3 -u 02-upload-incremental.py $TABLE_ARG
    EXIT_CODE=$?

    echo ""
    echo "⏰ 结束时间: $(date '+%Y-%m-%d %H:%M:%S')"

    # 检查退出状态
    if [ $EXIT_CODE -eq 124 ]; then
        echo "⏱️  达到 45 分钟时间限制，准备重启..."
    elif [ $EXIT_CODE -eq 0 ]; then
        echo "✅ 上传完成！"

        # 检查是否真的完成了
        if [ -f "upload_progress.json" ]; then
            COMPLETED=$(python3 -c "import json; d=json.load(open('upload_progress.json')); print(d.get('contributions_completed', False))")
            if [ "$COMPLETED" = "True" ]; then
                echo "🎉 所有数据上传完成！"
                exit 0
            fi
        fi

        echo "⚠️  脚本正常退出但上传未完成，继续..."
    else
        echo "❌ 上传失败 (退出码: $EXIT_CODE)"
        echo "⏸️  等待 30 秒后重试..."
        sleep 30
    fi

    echo ""
    echo "---"
    echo ""
    sleep 2
done
