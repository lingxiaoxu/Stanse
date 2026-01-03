#!/bin/bash
# 设置 Cloud Run Jobs 失败告警
# 运行方式: bash scripts/company-ranking/setup-alerts.sh

set -e

PROJECT_ID="gen-lang-client-0960644135"
REGION="us-central1"
EMAIL="lxu912@gmail.com"

echo "======================================================================"
echo "🔔 Setting up Email Alerts for Cloud Run Jobs"
echo "======================================================================"
echo ""

# 0. 启用 Cloud Monitoring API
echo "⚙️  Step 0: Enabling Cloud Monitoring API..."
gcloud services enable monitoring.googleapis.com --project=${PROJECT_ID}
echo "✅ Cloud Monitoring API enabled"
echo ""

# 等待 API 激活
echo "⏳ Waiting for API to be fully activated..."
sleep 10
echo ""

# 1. 创建通知渠道 (Email)
echo "📧 Step 1: Creating email notification channel..."

# 获取或创建通知渠道
CHANNEL_NAME=$(gcloud alpha monitoring channels list \
    --project=${PROJECT_ID} \
    --filter='type="email"' \
    --format="value(name)" \
    --limit=1 2>/dev/null || echo "")

if [ -z "$CHANNEL_NAME" ]; then
    # 创建新的邮件通知渠道
    gcloud alpha monitoring channels create \
        --display-name="Cloud Run Jobs Alert Email" \
        --type=email \
        --channel-labels=email_address=${EMAIL} \
        --project=${PROJECT_ID}

    echo "✅ Email notification channel created for ${EMAIL}"

    # 获取新创建的通知渠道 ID
    CHANNEL_NAME=$(gcloud alpha monitoring channels list \
        --project=${PROJECT_ID} \
        --filter='type="email"' \
        --format="value(name)" \
        --limit=1)
else
    echo "ℹ️  Email notification channel already exists: ${EMAIL}"
fi

echo "   Notification Channel: ${CHANNEL_NAME}"
echo ""

# 2. 创建告警策略
echo "🚨 Step 2: Creating alert policies..."
echo ""

# 告警策略 1: FEC Donations Collector 失败告警
echo "📝 Creating alert for: fec-donations-collector..."

cat > /tmp/fec-alert-policy.yaml <<EOF
displayName: "Cloud Run Job Failed: fec-donations-collector"
documentation:
  content: |
    ## FEC 政治捐款数据采集任务失败

    **任务**: fec-donations-collector
    **项目**: ${PROJECT_ID}
    **区域**: ${REGION}

    ### 可能原因:
    1. FEC API 无法访问或超时
    2. API 密钥失效 (FMP_API_KEY)
    3. Firestore 写入权限问题
    4. 数据解析错误

    ### 排查步骤:
    1. 查看执行日志:
       \`\`\`
       gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=fec-donations-collector" --limit=100 --project=${PROJECT_ID}
       \`\`\`

    2. 手动触发测试:
       \`\`\`
       gcloud run jobs execute fec-donations-collector --region=${REGION} --project=${PROJECT_ID} --wait
       \`\`\`

    3. 检查 Secret Manager 密钥是否有效

    ### 联系信息:
    - Email: ${EMAIL}
    - 项目: Stanse Company Ranking System
  mimeType: text/markdown
conditions:
  - displayName: "Job Execution Failed"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "fec-donations-collector"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
combiner: OR
notificationChannels:
  - ${CHANNEL_NAME}
alertStrategy:
  autoClose: 604800s
enabled: true
EOF

# 创建或更新告警策略
gcloud alpha monitoring policies create --policy-from-file=/tmp/fec-alert-policy.yaml --project=${PROJECT_ID} 2>/dev/null \
    || gcloud alpha monitoring policies update $(gcloud alpha monitoring policies list --project=${PROJECT_ID} --filter='displayName="Cloud Run Job Failed: fec-donations-collector"' --format='value(name)') --policy-from-file=/tmp/fec-alert-policy.yaml --project=${PROJECT_ID}

echo "✅ Alert policy created for fec-donations-collector"
echo ""

# 告警策略 2: ESG Scores Collector 失败告警
echo "📝 Creating alert for: esg-scores-collector..."

cat > /tmp/esg-alert-policy.yaml <<EOF
displayName: "Cloud Run Job Failed: esg-scores-collector"
documentation:
  content: |
    ## ESG 评分数据采集任务失败

    **任务**: esg-scores-collector
    **项目**: ${PROJECT_ID}
    **区域**: ${REGION}

    ### 可能原因:
    1. FMP API 无法访问或超时
    2. API 密钥失效 (FMP_API_KEY)
    3. Firestore 写入权限问题
    4. ESG 数据格式变更

    ### 排查步骤:
    1. 查看执行日志:
       \`\`\`
       gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=esg-scores-collector" --limit=100 --project=${PROJECT_ID}
       \`\`\`

    2. 手动触发测试:
       \`\`\`
       gcloud run jobs execute esg-scores-collector --region=${REGION} --project=${PROJECT_ID} --wait
       \`\`\`

    3. 验证 FMP API 配额和访问权限

    ### 联系信息:
    - Email: ${EMAIL}
    - 项目: Stanse Company Ranking System
  mimeType: text/markdown
conditions:
  - displayName: "Job Execution Failed"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "esg-scores-collector"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
combiner: OR
notificationChannels:
  - ${CHANNEL_NAME}
alertStrategy:
  autoClose: 604800s
enabled: true
EOF

gcloud alpha monitoring policies create --policy-from-file=/tmp/esg-alert-policy.yaml --project=${PROJECT_ID} 2>/dev/null \
    || gcloud alpha monitoring policies update $(gcloud alpha monitoring policies list --project=${PROJECT_ID} --filter='displayName="Cloud Run Job Failed: esg-scores-collector"' --format='value(name)') --policy-from-file=/tmp/esg-alert-policy.yaml --project=${PROJECT_ID}

echo "✅ Alert policy created for esg-scores-collector"
echo ""

# 告警策略 3: Polygon News Collector 失败告警
echo "📝 Creating alert for: polygon-news-collector..."

cat > /tmp/polygon-alert-policy.yaml <<EOF
displayName: "Cloud Run Job Failed: polygon-news-collector"
documentation:
  content: |
    ## Polygon 新闻数据采集任务失败

    **任务**: polygon-news-collector
    **项目**: ${PROJECT_ID}
    **区域**: ${REGION}

    ### 可能原因:
    1. Polygon API 无法访问或超时
    2. API 密钥失效 (polygon-api-key)
    3. Firestore 写入权限问题
    4. 新闻数据格式变更

    ### 排查步骤:
    1. 查看执行日志:
       \`\`\`
       gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=polygon-news-collector" --limit=100 --project=${PROJECT_ID}
       \`\`\`

    2. 手动触发测试:
       \`\`\`
       gcloud run jobs execute polygon-news-collector --region=${REGION} --project=${PROJECT_ID} --wait
       \`\`\`

    3. 验证 Polygon API 配额和访问权限

    ### 联系信息:
    - Email: ${EMAIL}
    - 项目: Stanse Company Ranking System
  mimeType: text/markdown
conditions:
  - displayName: "Job Execution Failed"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "polygon-news-collector"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
combiner: OR
notificationChannels:
  - ${CHANNEL_NAME}
alertStrategy:
  autoClose: 604800s
enabled: true
EOF

gcloud alpha monitoring policies create --policy-from-file=/tmp/polygon-alert-policy.yaml --project=${PROJECT_ID} 2>/dev/null \
    || gcloud alpha monitoring policies update $(gcloud alpha monitoring policies list --project=${PROJECT_ID} --filter='displayName="Cloud Run Job Failed: polygon-news-collector"' --format='value(name)') --policy-from-file=/tmp/polygon-alert-policy.yaml --project=${PROJECT_ID}

echo "✅ Alert policy created for polygon-news-collector"
echo ""

# 3. 清理临时文件
rm -f /tmp/fec-alert-policy.yaml /tmp/esg-alert-policy.yaml /tmp/polygon-alert-policy.yaml

echo "======================================================================"
echo "✅ All alert policies configured successfully!"
echo "======================================================================"
echo ""
echo "📧 Alert notifications will be sent to: ${EMAIL}"
echo ""
echo "Alert policies created:"
echo "  1. Cloud Run Job Failed: fec-donations-collector"
echo "  2. Cloud Run Job Failed: esg-scores-collector"
echo "  3. Cloud Run Job Failed: polygon-news-collector"
echo ""
echo "Next steps:"
echo "  1. Check your email (${EMAIL}) and verify the notification channel"
echo "  2. You may need to confirm the email subscription"
echo "  3. Test an alert by manually failing a job (optional)"
echo ""
echo "To view all alert policies:"
echo "  gcloud alpha monitoring policies list --project=${PROJECT_ID}"
echo ""
echo "To test alert (trigger a manual job execution):"
echo "  gcloud run jobs execute esg-scores-collector --region=${REGION} --project=${PROJECT_ID}"
echo ""
