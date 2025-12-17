#!/bin/bash
# 运行FEC索引和汇总构建脚本
# 日志文件将保存到 /Users/xuling/code/Stanse/logs/fec-data/

cd "$(dirname "$0")"

# 生成日志文件名（格式：yyyymmdd-hhmmss）
LOG_FILE="/Users/xuling/code/Stanse/logs/fec-data/06-build-indexes-$(date +%Y%m%d-%H%M%S).log"

echo "🚀 启动FEC索引构建..."
echo "📁 日志文件: $LOG_FILE"
echo ""

# 运行Python脚本，同时输出到终端和日志文件
python3 -u 06-build-indexes.py 2>&1 | tee "$LOG_FILE"
