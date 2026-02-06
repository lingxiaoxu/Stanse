#!/bin/bash
# 部署 Enhanced Company Rankings Generator 到 Cloud Run Job
# 设置每12小时自动运行
# 运行方式: bash scripts/company-ranking/deploy-ranking-generator.sh

set -e

PROJECT_ID="gen-lang-client-0960644135"
REGION="us-central1"
JOB_NAME="enhanced-rankings-generator"
SCHEDULER_NAME="enhanced-rankings-every-12h"
IMAGE_NAME="gcr.io/${PROJECT_ID}/company-ranking-scripts"
EMAIL="lxu912@gmail.com"

echo "======================================================================"
echo "🚀 Deploying Enhanced Company Rankings Generator"
echo "======================================================================"
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Job Name: ${JOB_NAME}"
echo "Schedule: Every 12 hours"
echo "Email Notifications: ${EMAIL}"
echo ""

# Step 1: Build and push Docker image
echo "📦 Step 1: Building and pushing Docker image..."
echo "----------------------------------------------------------------------"

cd /Users/xuling/code/Stanse

# 备份原.gcloudignore
if [ -f .gcloudignore ]; then
    cp .gcloudignore .gcloudignore.backup
fi

# 创建临时的 .gcloudignore (使用白名单方式，只包含需要的)
cat > .gcloudignore <<'IGNORE_EOF'
# 排除一切
*

# 明确包含需要的文件和目录
!requirements.txt
!data/
!data/sp500Data.json
!data/sp500Companies.py
!scripts/
scripts/*
!scripts/company-ranking/
!scripts/company-ranking/*.py
!scripts/company-ranking/verification/
!scripts/company-ranking/verification/*.py
!scripts/company-ranking/maintenance/
!scripts/company-ranking/maintenance/*.py
IGNORE_EOF

# 创建临时的 cloudbuild.yaml (指定使用Python Dockerfile)
cat > /tmp/enhanced-rankings-build.yaml <<'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/company-ranking-scripts:latest'
      - '-f'
      - 'scripts/company-ranking/Dockerfile'
      - '.'

images:
  - 'gcr.io/$PROJECT_ID/company-ranking-scripts:latest'
EOF

# 使用 Cloud Build 构建镜像
gcloud builds submit \
    --config=/tmp/enhanced-rankings-build.yaml \
    --project=${PROJECT_ID} \
    .

# 清理临时文件
rm -f /tmp/enhanced-rankings-build.yaml

echo "✅ Docker image built and pushed: ${IMAGE_NAME}"
echo ""

# Step 2: Create or update Cloud Run Job
echo "☁️  Step 2: Creating Cloud Run Job..."
echo "----------------------------------------------------------------------"

# 检查 job 是否已存在
if gcloud run jobs describe ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} &>/dev/null; then
    echo "ℹ️  Job ${JOB_NAME} already exists, updating..."
    ACTION="update"
else
    echo "🆕 Creating new job ${JOB_NAME}..."
    ACTION="create"
fi

# Create or update the Cloud Run Job
gcloud run jobs ${ACTION} ${JOB_NAME} \
    --image=${IMAGE_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --max-retries=1 \
    --task-timeout=3600s \
    --memory=2Gi \
    --cpu=2 \
    --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest \
    --set-env-vars=PYTHONUNBUFFERED=1 \
    --command=python3 \
    --args=05-generate-enhanced-rankings.py

echo "✅ Cloud Run Job configured: ${JOB_NAME}"
echo ""

# Step 3: Create or update Cloud Scheduler
echo "⏰ Step 3: Setting up Cloud Scheduler (every 12 hours)..."
echo "----------------------------------------------------------------------"

# Schedule: 每12小时运行一次 (每天 6:00 AM 和 6:00 PM Pacific Time)
# Cron: "0 6,18 * * *"

# 检查 scheduler job 是否已存在
if gcloud scheduler jobs describe ${SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID} &>/dev/null; then
    echo "ℹ️  Scheduler ${SCHEDULER_NAME} already exists, updating..."

    gcloud scheduler jobs update http ${SCHEDULER_NAME} \
        --location=${REGION} \
        --project=${PROJECT_ID} \
        --schedule="0 6,18 * * *" \
        --time-zone="America/Los_Angeles" \
        --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
        --http-method=POST \
        --oauth-service-account-email=cloud-scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com \
        --attempt-deadline=1800s
else
    echo "🆕 Creating new scheduler ${SCHEDULER_NAME}..."

    gcloud scheduler jobs create http ${SCHEDULER_NAME} \
        --location=${REGION} \
        --project=${PROJECT_ID} \
        --schedule="0 6,18 * * *" \
        --time-zone="America/Los_Angeles" \
        --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
        --http-method=POST \
        --oauth-service-account-email=cloud-scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com \
        --attempt-deadline=1800s \
        --description="Generate enhanced company rankings for all 8 personas every 12 hours"
fi

echo "✅ Cloud Scheduler configured: ${SCHEDULER_NAME}"
echo "   Schedule: Every 12 hours (6:00 AM & 6:00 PM Pacific Time)"
echo ""

# Step 4: Configure failure alerts
echo "🚨 Step 4: Configuring failure alerts..."
echo "----------------------------------------------------------------------"

# 创建告警策略配置文件
cat > /tmp/ranking-generator-alert-policy.yaml <<EOF
displayName: "Cloud Run Job Failed: enhanced-rankings-generator"
documentation:
  content: |
    ## Enhanced Company Rankings Generator 任务失败

    **任务**: enhanced-rankings-generator
    **项目**: ${PROJECT_ID}
    **区域**: ${REGION}

    ### 任务说明:
    - 为所有8个persona生成enhanced company rankings
    - 处理125个 S&P 500 公司
    - 使用 AI-Data Based (FEC + ESG + Executive + News) + LLM 方法
    - 每12小时运行一次 (6:00 AM & 6:00 PM Pacific Time)

    ### 可能原因:
    1. Gemini API 配额耗尽或访问失败
    2. Firebase Firestore 写入权限问题
    3. Secret Manager 密钥失效 (gemini-api-key, sendgrid-api-key)
    4. 内存不足 (处理125公司 x 8 personas = 1000 LLM调用)
    5. 超时 (task-timeout 设置为 3600s = 1小时)

    ### 排查步骤:
    1. 查看执行日志:
       \`\`\`
       gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=enhanced-rankings-generator" --limit=200 --project=${PROJECT_ID}
       \`\`\`

    2. 检查最近一次执行状态:
       \`\`\`
       gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --limit=5
       \`\`\`

    3. 手动触发测试 (单个persona):
       \`\`\`
       gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --wait --args=05-generate-enhanced-rankings.py,--persona,progressive-globalist
       \`\`\`

    4. 检查 Gemini API 配额:
       - 访问: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas?project=${PROJECT_ID}
       - 预估: 125 companies x 8 personas = 1000 LLM 调用

    5. 检查 Secret Manager 密钥:
       \`\`\`
       gcloud secrets versions access latest --secret=gemini-api-key --project=${PROJECT_ID} | wc -c
       \`\`\`

    ### 联系信息:
    - Email: ${EMAIL}
    - 项目: Stanse Enhanced Company Ranking System
  mimeType: text/markdown
conditions:
  - displayName: "Job Execution Failed"
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "${JOB_NAME}"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
combiner: OR
alertStrategy:
  autoClose: 604800s
enabled: true
EOF

# 获取或创建通知渠道
CHANNEL_NAME=$(gcloud alpha monitoring channels list \
    --project=${PROJECT_ID} \
    --filter='type="email"' \
    --format="value(name)" \
    --limit=1 2>/dev/null || echo "")

if [ -z "$CHANNEL_NAME" ]; then
    echo "📧 Creating email notification channel..."
    gcloud alpha monitoring channels create \
        --display-name="Cloud Run Jobs Alert Email" \
        --type=email \
        --channel-labels=email_address=${EMAIL} \
        --project=${PROJECT_ID}

    CHANNEL_NAME=$(gcloud alpha monitoring channels list \
        --project=${PROJECT_ID} \
        --filter='type="email"' \
        --format="value(name)" \
        --limit=1)
    echo "✅ Email notification channel created for ${EMAIL}"
else
    echo "ℹ️  Using existing email notification channel"
fi

# 添加通知渠道到策略
echo "notificationChannels:" >> /tmp/ranking-generator-alert-policy.yaml
echo "  - ${CHANNEL_NAME}" >> /tmp/ranking-generator-alert-policy.yaml

# 创建或更新告警策略
gcloud alpha monitoring policies create --policy-from-file=/tmp/ranking-generator-alert-policy.yaml --project=${PROJECT_ID} 2>/dev/null \
    || gcloud alpha monitoring policies update $(gcloud alpha monitoring policies list --project=${PROJECT_ID} --filter='displayName="Cloud Run Job Failed: enhanced-rankings-generator"' --format='value(name)') \
    --policy-from-file=/tmp/ranking-generator-alert-policy.yaml --project=${PROJECT_ID}

echo "✅ Alert policy configured"
echo ""

# 清理临时文件
rm -f /tmp/ranking-generator-alert-policy.yaml

# 恢复原.gcloudignore
if [ -f .gcloudignore.backup ]; then
    mv .gcloudignore.backup .gcloudignore
    echo "✅ Restored original .gcloudignore"
fi

echo ""
echo "======================================================================"
echo "✅ Deployment Complete!"
echo "======================================================================"
echo ""
echo "📊 Summary:"
echo "  - Cloud Run Job: ${JOB_NAME}"
echo "  - Schedule: Every 12 hours (6:00 AM & 6:00 PM Pacific Time)"
echo "  - Image: ${IMAGE_NAME}"
echo "  - Email Notifications: ${EMAIL}"
echo "  - Failure Alerts: Configured"
echo ""
echo "🔍 Useful Commands:"
echo ""
echo "  1. List scheduled jobs:"
echo "     gcloud scheduler jobs list --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "  2. Trigger manual execution:"
echo "     gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --wait"
echo ""
echo "  3. View recent executions:"
echo "     gcloud run jobs executions list --job=${JOB_NAME} --region=${REGION} --project=${PROJECT_ID} --limit=10"
echo ""
echo "  4. View logs:"
echo "     gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=100 --project=${PROJECT_ID}"
echo ""
echo "  5. Pause scheduler:"
echo "     gcloud scheduler jobs pause ${SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "  6. Resume scheduler:"
echo "     gcloud scheduler jobs resume ${SCHEDULER_NAME} --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "======================================================================"
