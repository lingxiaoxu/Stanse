# Dockerfile for Company Ranking Data Collection Scripts
# 用于 Cloud Run Jobs 定时执行数据采集
#
# 构建上下文应该是项目根目录 /Users/xuling/code/Stanse
# 运行: gcloud builds submit --config=scripts/company-ranking/cloudbuild.yaml

FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 从项目根目录复制 requirements.txt
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制 data/ 目录（SP500 unified data source）
COPY data/ /app/data/

# 复制 company-ranking 脚本
# 分别复制每个Python文件以避免glob pattern问题
COPY scripts/company-ranking/00-orchestrator.py ./
COPY scripts/company-ranking/01-collect-fec-donations.py ./
COPY scripts/company-ranking/02-collect-esg-scores.py ./
COPY scripts/company-ranking/03-collect-polygon-news.py ./
COPY scripts/company-ranking/04-analyze-executive-statements.py ./
COPY scripts/company-ranking/05-generate-enhanced-rankings.py ./
COPY scripts/company-ranking/email_notifier.py ./
COPY scripts/company-ranking/check-firebase-schema.py ./
COPY scripts/company-ranking/verification/ ./verification/
COPY scripts/company-ranking/maintenance/ ./maintenance/

# 设置 Python 不缓冲输出（便于查看日志）
ENV PYTHONUNBUFFERED=1

# 默认命令（会被 Cloud Run Job 覆盖）
CMD ["python3", "--version"]
