#!/bin/bash
#
# 完整运行四个数据收集脚本
# 日志保存到 /Users/xuling/code/Stanse/logs/fec-data/
#

set -e  # Exit on error

# 设置日志目录和文件
LOG_DIR="/Users/xuling/code/Stanse/logs/fec-data"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/full_collection_$TIMESTAMP.log"

echo "================================================================" | tee "$LOG_FILE"
echo "🚀 完整数据收集流程" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
echo "开始时间: $(date)" | tee -a "$LOG_FILE"
echo "日志文件: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

cd /Users/xuling/code/Stanse/scripts/company-ranking

# 获取所有 API keys
echo "🔑 Loading API keys from Secret Manager..." | tee -a "$LOG_FILE"
export SENDGRID_API_KEY=$(gcloud secrets versions access latest --secret=SENDGRID_API_KEY --project=gen-lang-client-0960644135)
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)
export FMP_API_KEY=$(gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135)
export POLYGON_API_KEY=$(gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135)
echo "✅ API keys loaded" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 运行 orchestrator
echo "🎯 Running orchestrator in FULL mode..." | tee -a "$LOG_FILE"
python3 -u 00-orchestrator.py --mode full 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
echo "✅ 数据收集完成" | tee -a "$LOG_FILE"
echo "结束时间: $(date)" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
