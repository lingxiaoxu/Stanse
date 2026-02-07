#!/bin/bash
# Portfolio Return Tracker - 部署和Scheduler设置
#
# 功能：
# - 构建并推送Docker镜像（如果需要）
# - 创建Cloud Run Job: portfolio-return-tracker
# - 设置7个Cloud Scheduler Jobs（weekday 10am-4pm EST每小时运行）
#
# 项目配置:
# - Google Cloud Project (Cloud Run/Scheduler/Secrets): gen-lang-client-0960644135
# - Firebase Project (Firestore数据): stanseproject
#
# 运行方式:
#   cd /Users/xuling/code/Stanse
#   bash scripts/company-ranking/setup-portfolio-tracker.sh
#
# 时间说明 (使用America/New_York时区自动处理EST/EDT):
# - 10:00 AM EST = 15:00 UTC (winter) / 14:00 UTC (summer DST)
# - 4:00 PM EST = 21:00 UTC (winter) / 20:00 UTC (summer DST)

set -e  # 遇到错误立即退出

# ====================================================================
# 配置
# ====================================================================
GCLOUD_PROJECT_ID="gen-lang-client-0960644135"
FIREBASE_PROJECT_ID="stanseproject"
REGION="us-central1"
JOB_NAME="portfolio-return-tracker"
IMAGE_NAME="company-ranking-collector"

echo "======================================================================"
echo "📊 Portfolio Return Tracker - Setup"
echo "======================================================================"
echo "Google Cloud Project: ${GCLOUD_PROJECT_ID}"
echo "Firebase Project: ${FIREBASE_PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# 检查是否在项目根目录
if [ ! -f "requirements.txt" ] || [ ! -d "scripts/company-ranking" ]; then
    echo "❌ Error: Must run from project root directory (/Users/xuling/code/Stanse)"
    echo "   Current directory: $(pwd)"
    echo "   Please run: cd /Users/xuling/code/Stanse && bash scripts/company-ranking/setup-portfolio-tracker.sh"
    exit 1
fi

# ====================================================================
# Step 1: 构建并推送Docker镜像
# ====================================================================
echo "======================================================================"
echo "📦 Step 1: Building and pushing Docker image..."
echo "======================================================================"

# 备份原.gcloudignore（如果存在）
if [ -f .gcloudignore ]; then
    cp .gcloudignore .gcloudignore.backup
fi

# 创建临时的 .gcloudignore (使用白名单方式，只包含需要的)
cat > .gcloudignore <<'EOF'
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
EOF

# 创建临时的 cloudbuild.yaml
cat > /tmp/company-ranking-build.yaml <<'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'gcr.io/$PROJECT_ID/company-ranking-collector:latest'
      - '-f'
      - 'scripts/company-ranking/Dockerfile'
      - '.'

images:
  - 'gcr.io/$PROJECT_ID/company-ranking-collector:latest'
EOF

# 使用 Cloud Build 构建镜像
gcloud builds submit \
    --config=/tmp/company-ranking-build.yaml \
    --project=${GCLOUD_PROJECT_ID} \
    .

# 恢复原.gcloudignore
if [ -f .gcloudignore.backup ]; then
    mv .gcloudignore.backup .gcloudignore
fi

echo ""
echo "✅ Docker image built and pushed successfully"

# ====================================================================
# Step 2: 创建 Cloud Run Job
# ====================================================================
echo ""
echo "======================================================================"
echo "📦 Step 2: Creating Cloud Run Job"
echo "======================================================================"

echo "📝 Creating/updating Cloud Run Job: ${JOB_NAME}..."

# 尝试创建，如果已存在则更新
gcloud run jobs create ${JOB_NAME} \
    --image=gcr.io/${GCLOUD_PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${GCLOUD_PROJECT_ID} \
    --memory=1Gi \
    --cpu=1 \
    --max-retries=1 \
    --task-timeout=10m \
    --set-secrets="POLYGON_API_KEY=polygon-api-key:latest" \
    --command="python3" \
    --args="06-track-portfolio-returns.py" \
    2>/dev/null || \
gcloud run jobs update ${JOB_NAME} \
    --image=gcr.io/${GCLOUD_PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${GCLOUD_PROJECT_ID} \
    --memory=1Gi \
    --cpu=1 \
    --max-retries=1 \
    --task-timeout=10m \
    --set-secrets="POLYGON_API_KEY=polygon-api-key:latest" \
    --command="python3" \
    --args="06-track-portfolio-returns.py"

echo "✅ Cloud Run Job created/updated: ${JOB_NAME}"

# ====================================================================
# Step 3: 设置 Cloud Scheduler (7个时间点)
# ====================================================================
echo ""
echo "======================================================================"
echo "⏰ Step 3: Setting up Cloud Schedulers (10am-4pm EST, weekdays)"
echo "======================================================================"

# Service Account for scheduler
SA_NAME="cloud-scheduler-invoker"
SA_EMAIL="${SA_NAME}@${GCLOUD_PROJECT_ID}.iam.gserviceaccount.com"

echo "📝 Using service account: ${SA_EMAIL}"
echo ""

# 函数：创建单个scheduler
create_hourly_scheduler() {
    local HOUR=$1
    local SCHEDULER_NAME="portfolio-tracker-${HOUR}00est"

    # 删除旧的（如果存在）
    gcloud scheduler jobs delete ${SCHEDULER_NAME} \
        --location=${REGION} \
        --project=${GCLOUD_PROJECT_ID} \
        --quiet 2>/dev/null || true

    # 创建新的
    gcloud scheduler jobs create http ${SCHEDULER_NAME} \
        --location=${REGION} \
        --schedule="0 ${HOUR} * * 1-5" \
        --time-zone="America/New_York" \
        --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${GCLOUD_PROJECT_ID}/jobs/${JOB_NAME}:run" \
        --http-method=POST \
        --oauth-service-account-email=${SA_EMAIL} \
        --project=${GCLOUD_PROJECT_ID} \
        --description="Track portfolio returns at ${HOUR}:00 EST on weekdays"

    echo "  ✅ Created: ${SCHEDULER_NAME} (${HOUR}:00 EST, Mon-Fri)"
}

# 创建7个scheduler (10am to 4pm EST)
echo "📝 Creating schedulers for market hours..."
create_hourly_scheduler 10
create_hourly_scheduler 11
create_hourly_scheduler 12
create_hourly_scheduler 13
create_hourly_scheduler 14
create_hourly_scheduler 15
create_hourly_scheduler 16

# ====================================================================
# 完成
# ====================================================================
echo ""
echo "======================================================================"
echo "✅ Portfolio Return Tracker Setup Complete!"
echo "======================================================================"
echo ""
echo "📅 Schedule Summary (EST timezone, weekdays Mon-Fri):"
echo "  • 10:00 AM EST - portfolio-tracker-1000est"
echo "  • 11:00 AM EST - portfolio-tracker-1100est"
echo "  • 12:00 PM EST - portfolio-tracker-1200est"
echo "  • 1:00 PM EST  - portfolio-tracker-1300est"
echo "  • 2:00 PM EST  - portfolio-tracker-1400est"
echo "  • 3:00 PM EST  - portfolio-tracker-1500est"
echo "  • 4:00 PM EST  - portfolio-tracker-1600est"
echo ""
echo "📊 Data Structure:"
echo "  Collection: enhanced_persona_index_longshort_fund/{stanceType}"
echo "  Snapshots:  enhanced_persona_index_longshort_fund/{stanceType}/snapshots/{timestamp}"
echo "  Firebase:   ${FIREBASE_PROJECT_ID}"
echo ""
echo "🔍 View schedulers:"
echo "  gcloud scheduler jobs list --location=${REGION} --project=${GCLOUD_PROJECT_ID} | grep portfolio"
echo ""
echo "🧪 Manually trigger job:"
echo "  gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${GCLOUD_PROJECT_ID}"
echo ""
echo "📊 View execution logs:"
echo "  gcloud logging read 'resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}' --limit=50 --project=${GCLOUD_PROJECT_ID}"
echo ""
echo "🚀 Don't forget to deploy Firebase rules:"
echo "  firebase deploy --only firestore:rules --project=${FIREBASE_PROJECT_ID}"
echo ""
