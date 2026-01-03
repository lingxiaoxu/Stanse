#!/bin/bash
# 设置 Cloud Scheduler 定时任务
# 运行方式: bash scripts/company-ranking/setup-schedulers.sh
#
# 项目说明:
# - Google Cloud Project (Cloud Run/Scheduler/Secrets): gen-lang-client-0960644135
# - Firebase Project (Firestore): stanseproject

set -e  # 遇到错误立即退出

# Google Cloud Project (用于 Cloud Run, Cloud Scheduler等)
GCLOUD_PROJECT_ID="gen-lang-client-0960644135"
# Firebase Project (用于 Firestore 数据库)
FIREBASE_PROJECT_ID="stanseproject"

REGION="us-central1"

echo "======================================================================"
echo "⏰ Setting up Cloud Scheduler for Data Collection Jobs"
echo "======================================================================"
echo "Google Cloud Project: ${GCLOUD_PROJECT_ID}"
echo "Firebase Project: ${FIREBASE_PROJECT_ID}"
echo ""

# 确保 Cloud Scheduler API 已启用
echo "📝 Enabling Cloud Scheduler API..."
gcloud services enable cloudscheduler.googleapis.com --project=${GCLOUD_PROJECT_ID}
echo ""

# 创建 Service Account（如果不存在）用于调用 Cloud Run Jobs
echo "📝 Creating service account for scheduler..."
SA_NAME="cloud-scheduler-invoker"
SA_EMAIL="${SA_NAME}@${GCLOUD_PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create ${SA_NAME} \
    --display-name="Cloud Scheduler Invoker" \
    --project=${GCLOUD_PROJECT_ID} \
    2>/dev/null || echo "⚠️  Service account already exists, continuing..."

# 授予 Service Account 调用 Cloud Run Jobs 的权限
echo "📝 Granting Cloud Run Invoker role to service account..."

# 等待服务账户创建完成
sleep 5

gcloud projects add-iam-policy-binding ${GCLOUD_PROJECT_ID} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/run.invoker"

echo ""
echo "======================================================================"
echo "📅 Creating Cloud Scheduler Jobs"
echo "======================================================================"
echo ""

# Scheduler 1: FEC Donations (每周一次，周一上午8点)
# 因为 FEC 数据更新不频繁，每周检查一次即可
echo "📝 Creating scheduler: fec-donations-weekly..."
gcloud scheduler jobs create http fec-donations-weekly \
    --location=${REGION} \
    --schedule="0 8 * * 1" \
    --time-zone="America/Los_Angeles" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/fec-donations-collector:run" \
    --http-method=POST \
    --oauth-service-account-email=${SA_EMAIL} \
    --project=${GCLOUD_PROJECT_ID} \
    2>/dev/null || echo "⚠️  Scheduler already exists, updating instead..." && \
    gcloud scheduler jobs update http fec-donations-weekly \
        --location=${REGION} \
        --schedule="0 8 * * 1" \
        --time-zone="America/Los_Angeles" \
        --project=${GCLOUD_PROJECT_ID}

echo "✅ FEC scheduler created (runs every Monday at 8:00 AM PST)"
echo ""

# Scheduler 2: ESG Scores (每周一次，周二上午8点)
# ESG 数据通常季度更新，每周检查一次确保及时获取
echo "📝 Creating scheduler: esg-scores-weekly..."
gcloud scheduler jobs create http esg-scores-weekly \
    --location=${REGION} \
    --schedule="0 8 * * 2" \
    --time-zone="America/Los_Angeles" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/esg-scores-collector:run" \
    --http-method=POST \
    --oauth-service-account-email=${SA_EMAIL} \
    --project=${GCLOUD_PROJECT_ID} \
    2>/dev/null || echo "⚠️  Scheduler already exists, updating instead..." && \
    gcloud scheduler jobs update http esg-scores-weekly \
        --location=${REGION} \
        --schedule="0 8 * * 2" \
        --time-zone="America/Los_Angeles" \
        --project=${GCLOUD_PROJECT_ID}

echo "✅ ESG scheduler created (runs every Tuesday at 8:00 AM PST)"
echo ""

# Scheduler 3: Polygon News (每天一次，每天上午9点)
# 新闻数据每天更新，所以每天采集
echo "📝 Creating scheduler: polygon-news-daily..."
gcloud scheduler jobs create http polygon-news-daily \
    --location=${REGION} \
    --schedule="0 9 * * *" \
    --time-zone="America/Los_Angeles" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/polygon-news-collector:run" \
    --http-method=POST \
    --oauth-service-account-email=${SA_EMAIL} \
    --project=${GCLOUD_PROJECT_ID} \
    2>/dev/null || echo "⚠️  Scheduler already exists, updating instead..." && \
    gcloud scheduler jobs update http polygon-news-daily \
        --location=${REGION} \
        --schedule="0 9 * * *" \
        --time-zone="America/Los_Angeles" \
        --project=${GCLOUD_PROJECT_ID}

echo "✅ Polygon News scheduler created (runs daily at 9:00 AM PST)"
echo ""

# Scheduler 4: Executive Statements Analysis (每周一次，周日晚上8点PST = 11PM EST)
# 在新闻采集后进行分析，每周一次足够
echo "📝 Creating scheduler: executive-statements-weekly..."
gcloud scheduler jobs create http executive-statements-weekly \
    --location=${REGION} \
    --schedule="0 20 * * 0" \
    --time-zone="America/Los_Angeles" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/executive-statements-analyzer:run" \
    --http-method=POST \
    --oauth-service-account-email=${SA_EMAIL} \
    --project=${GCLOUD_PROJECT_ID} \
    2>/dev/null || echo "⚠️  Scheduler already exists, updating instead..." && \
    gcloud scheduler jobs update http executive-statements-weekly \
        --location=${REGION} \
        --schedule="0 20 * * 0" \
        --time-zone="America/Los_Angeles" \
        --project=${GCLOUD_PROJECT_ID}

echo "✅ Executive Statements scheduler created (runs every Sunday at 8:00 PM PST / 11:00 PM EST)"
echo ""

echo "======================================================================"
echo "✅ All Cloud Scheduler jobs created successfully!"
echo "======================================================================"
echo ""
echo "📅 Schedule Summary:"
echo "  • FEC Donations: Every Monday at 8:00 AM PST"
echo "  • ESG Scores: Every Tuesday at 8:00 AM PST"
echo "  • Polygon News: Every day at 9:00 AM PST"
echo "  • Executive Statements: Every Sunday at 8:00 PM PST (11:00 PM EST)"
echo ""
echo "🔍 View schedulers:"
echo "  gcloud scheduler jobs list --location=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo ""
echo "🧪 Manually trigger a scheduler job:"
echo "  gcloud scheduler jobs run fec-donations-weekly --location=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo "  gcloud scheduler jobs run esg-scores-weekly --location=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo "  gcloud scheduler jobs run polygon-news-daily --location=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo "  gcloud scheduler jobs run executive-statements-weekly --location=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo ""
echo "📊 View execution logs:"
echo "  gcloud logging read 'resource.type=cloud_run_job' --limit=50 --project=${GCLOUD_PROJECT_ID}"
echo ""
echo "💾 Data is saved to Firebase Project: ${FIREBASE_PROJECT_ID}"
echo ""
