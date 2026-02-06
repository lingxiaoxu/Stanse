#!/bin/bash
# 部署 Cloud Run Jobs 用于定时数据采集
# 运行方式: 从项目根目录运行 bash scripts/company-ranking/deploy-jobs.sh

set -e  # 遇到错误立即退出

PROJECT_ID="gen-lang-client-0960644135"
REGION="us-central1"
IMAGE_NAME="company-ranking-collector"

# 检查是否在项目根目录
if [ ! -f "requirements.txt" ] || [ ! -d "scripts/company-ranking" ]; then
    echo "❌ Error: Must run from project root directory (/Users/xuling/code/Stanse)"
    echo "   Current directory: $(pwd)"
    echo "   Please run: cd /Users/xuling/code/Stanse && bash scripts/company-ranking/deploy-jobs.sh"
    exit 1
fi

echo "======================================================================"
echo "🚀 Deploying Company Ranking Data Collection Jobs"
echo "======================================================================"
echo ""

# 1. 构建并推送 Docker 镜像到 Google Container Registry
echo "📦 Step 1: Building and pushing Docker image..."
echo "   Building from project root with Dockerfile at scripts/company-ranking/Dockerfile"

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
    --project=${PROJECT_ID} \
    .

# 恢复原.gcloudignore
if [ -f .gcloudignore.backup ]; then
    mv .gcloudignore.backup .gcloudignore
fi

echo ""
echo "✅ Docker image built and pushed successfully"
echo ""

# 2. 创建 Cloud Run Jobs
echo "======================================================================"
echo "📋 Step 2: Creating Cloud Run Jobs"
echo "======================================================================"
echo ""

# Job 1: FEC Donations Collection
echo "📝 Creating job: fec-donations-collector..."
gcloud run jobs create fec-donations-collector \
    --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,FMP_API_KEY=FMP_API_KEY:latest,POLYGON_API_KEY=polygon-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest \
    --max-retries=1 \
    --task-timeout=30m \
    --memory=512Mi \
    --cpu=1 \
    --command=python3 \
    --args=01-collect-fec-donations.py \
    || echo "⚠️  Job already exists, updating instead..." && \
    gcloud run jobs update fec-donations-collector \
        --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,FMP_API_KEY=FMP_API_KEY:latest,POLYGON_API_KEY=polygon-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest

echo "✅ FEC job created/updated"
echo ""

# Job 2: ESG Scores Collection
echo "📝 Creating job: esg-scores-collector..."
gcloud run jobs create esg-scores-collector \
    --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --set-secrets=FMP_API_KEY=FMP_API_KEY:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest \
    --max-retries=1 \
    --task-timeout=30m \
    --memory=512Mi \
    --cpu=1 \
    --command=python3 \
    --args=02-collect-esg-scores.py \
    || echo "⚠️  Job already exists, updating instead..." && \
    gcloud run jobs update esg-scores-collector \
        --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --set-secrets=FMP_API_KEY=FMP_API_KEY:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest

echo "✅ ESG job created/updated"
echo ""

# Job 3: Polygon News Collection
echo "📝 Creating job: polygon-news-collector..."
gcloud run jobs create polygon-news-collector \
    --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --set-secrets=POLYGON_API_KEY=polygon-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest \
    --max-retries=1 \
    --task-timeout=30m \
    --memory=512Mi \
    --cpu=1 \
    --command=python3 \
    --args=03-collect-polygon-news.py \
    || echo "⚠️  Job already exists, updating instead..." && \
    gcloud run jobs update polygon-news-collector \
        --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --set-secrets=POLYGON_API_KEY=polygon-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest

echo "✅ Polygon News job created/updated"
echo ""

# Job 4: Executive Statements Analysis
echo "📝 Creating job: executive-statements-analyzer..."
gcloud run jobs create executive-statements-analyzer \
    --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest \
    --max-retries=1 \
    --task-timeout=45m \
    --memory=1Gi \
    --cpu=1 \
    --command=python3 \
    --args=04-analyze-executive-statements.py \
    || echo "⚠️  Job already exists, updating instead..." && \
    gcloud run jobs update executive-statements-analyzer \
        --image=gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --set-secrets=GEMINI_API_KEY=gemini-api-key:latest,SENDGRID_API_KEY=SENDGRID_API_KEY:latest

echo "✅ Executive Statements job created/updated"
echo ""

echo "======================================================================"
echo "✅ All Cloud Run Jobs deployed successfully!"
echo "======================================================================"
echo ""
echo "Next steps:"
echo "1. Run 'bash setup-schedulers.sh' to create Cloud Scheduler jobs"
echo "2. Or manually test a job:"
echo "   gcloud run jobs execute fec-donations-collector --region=${REGION} --project=${PROJECT_ID}"
echo ""
