#!/bin/bash
#
# 运行 Enhanced Company Rankings 生成脚本
# 每12小时定时运行，生成所有8种persona的排名
#
# 使用方法：
#   # 生成所有8种persona的排名
#   bash run-enhanced-rankings.sh
#
#   # 只生成特定persona
#   bash run-enhanced-rankings.sh --persona capitalist-globalist
#
#   # 测试模式（只处理前10个公司）
#   bash run-enhanced-rankings.sh --test
#

set -e  # Exit on error

# 设置日志目录
LOG_DIR="/Users/xuling/code/Stanse/logs/company-ranking"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/enhanced_rankings_$TIMESTAMP.log"

echo "================================================================" | tee "$LOG_FILE"
echo "🎯 Enhanced Company Rankings Generation" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

cd /Users/xuling/code/Stanse/scripts/company-ranking

# 获取 GEMINI API key
echo "🔑 Loading GEMINI_API_KEY from Secret Manager..." | tee -a "$LOG_FILE"
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)
echo "✅ API key loaded" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 运行脚本（传递所有参数）
echo "🚀 Starting enhanced rankings generation..." | tee -a "$LOG_FILE"
python3 -u 05-generate-enhanced-rankings.py "$@" 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
echo "✅ Enhanced Rankings Generation Complete" | tee -a "$LOG_FILE"
echo "Finished at: $(date)" | tee -a "$LOG_FILE"
echo "================================================================" | tee -a "$LOG_FILE"
