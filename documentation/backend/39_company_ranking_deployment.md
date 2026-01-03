# Enhanced Company Rankings Generator - Deployment Guide

## 📋 Overview

自动化系统，为所有8个political personas生成enhanced company rankings。

**功能**:
- 处理84个S&P 500公司
- 8个political personas (progressive-globalist到conservative-nationalist)
- 每12小时自动运行
- LLM综合评分 (Gemini 2.5 Flash)
- Email通知 + 错误告警

**运行模式**:
1. **Production (Cloud Run Job)**: 自动每12小时运行
2. **Manual (本地)**: 按需运行特定persona或公司

---

## 🚀 Quick Start - Deploy to Cloud

### 一键部署
```bash
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/deploy-ranking-generator.sh
```

这将:
1. ✅ 构建并推送Docker镜像
2. ✅ 创建Cloud Run Job: `enhanced-rankings-generator`
3. ✅ 设置Cloud Scheduler: 每12小时 (6:00 AM & 6:00 PM Pacific)
4. ✅ 配置失败告警 (发送到 lxu912@gmail.com)

---

## 📅 Schedule Details

**触发时间**:
- 每天 **6:00 AM** Pacific Time
- 每天 **6:00 PM** Pacific Time

**Cron表达式**: `0 6,18 * * *`

**预计执行时间**:
- 84 companies x 8 personas = 672 evaluations
- 有LLM: ~6-8分钟
- 无LLM: ~20秒

---

## 🔧 Manual Operations

### 本地测试运行

```bash
cd /Users/xuling/code/Stanse/scripts/company-ranking

# 测试模式 (10个公司, 1个persona)
python3 05-generate-enhanced-rankings.py --test --persona progressive-globalist

# 单个persona (84个公司)
python3 05-generate-enhanced-rankings.py --persona progressive-globalist

# 所有8个personas (production)
python3 05-generate-enhanced-rankings.py

# 单公司按需计算
python3 05-generate-enhanced-rankings.py --company "Chick-fil-A" --persona progressive-globalist
```

### 手动触发Cloud Job

```bash
# 触发完整运行 (所有8 personas)
gcloud run jobs execute enhanced-rankings-generator \
    --region=us-central1 \
    --project=gen-lang-client-0960644135 \
    --wait

# 触发单个persona测试
gcloud run jobs execute enhanced-rankings-generator \
    --region=us-central1 \
    --project=gen-lang-client-0960644135 \
    --args=05-generate-enhanced-rankings.py,--persona,progressive-globalist \
    --wait
```

---

## 📊 Monitoring & Logs

### 查看执行历史
```bash
gcloud run jobs executions list \
    --job=enhanced-rankings-generator \
    --region=us-central1 \
    --project=gen-lang-client-0960644135 \
    --limit=10
```

### 查看日志
```bash
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=enhanced-rankings-generator" \
    --limit=200 \
    --project=gen-lang-client-0960644135
```

### 查看Scheduler状态
```bash
gcloud scheduler jobs list \
    --location=us-central1 \
    --project=gen-lang-client-0960644135
```

### 暂停/恢复Scheduler
```bash
# 暂停
gcloud scheduler jobs pause enhanced-rankings-every-12h \
    --location=us-central1 \
    --project=gen-lang-client-0960644135

# 恢复
gcloud scheduler jobs resume enhanced-rankings-every-12h \
    --location=us-central1 \
    --project=gen-lang-client-0960644135
```

---

## 📧 Email Notifications

**成功通知**:
- 发送到: lxu912@gmail.com
- 内容: 8个personas的成功/失败统计
- 执行时间和详细结果

**失败告警**:
- Google Cloud Monitoring自动发送
- 包含排查步骤和有用命令

---

## 🔑 Required Secrets

系统依赖以下Google Secret Manager密钥:

1. **gemini-api-key**
   ```bash
   gcloud secrets versions access latest \
       --secret=gemini-api-key \
       --project=gen-lang-client-0960644135
   ```

2. **sendgrid-api-key**
   ```bash
   gcloud secrets versions access latest \
       --secret=sendgrid-api-key \
       --project=gen-lang-client-0960644135
   ```

---

## 🗄️ Output

### Firebase Collections

**主文档** (实时数据):
```
enhanced_company_rankings/{stanceType}
├── opposeCompanies: [top 5]
├── supportCompanies: [top 5]
├── updatedAt: timestamp
├── expiresAt: timestamp (updatedAt + 12小时)
└── version: "3.0"
```

**历史记录**:
```
enhanced_company_rankings/{stanceType}/history/{YYYYmmdd_HHMMSS}
└── (相同结构的历史快照)
```

### 本地日志文件

```
/Users/xuling/code/Stanse/logs/company-ranking/
├── progressive-globalist_detailed_calculations.json
├── progressive-globalist_detailed_calculations.csv
├── conservative-nationalist_detailed_calculations.json
├── conservative-nationalist_detailed_calculations.csv
└── ... (每个persona一对JSON+CSV)
```

---

## 🛠️ Troubleshooting

### 问题: Scheduler不触发

**检查**:
```bash
gcloud scheduler jobs describe enhanced-rankings-every-12h \
    --location=us-central1 \
    --project=gen-lang-client-0960644135
```

**解决**: 确认state为ENABLED

### 问题: Job执行失败

**查看最近执行**:
```bash
gcloud run jobs executions list \
    --job=enhanced-rankings-generator \
    --region=us-central1 \
    --project=gen-lang-client-0960644135 \
    --limit=5
```

**查看详细日志**:
```bash
# 获取最近一次execution的ID
EXECUTION_ID=$(gcloud run jobs executions list \
    --job=enhanced-rankings-generator \
    --region=us-central1 \
    --project=gen-lang-client-0960644135 \
    --limit=1 \
    --format='value(metadata.name)')

# 查看该execution的日志
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=enhanced-rankings-generator AND labels.run.googleapis.com/execution_name=${EXECUTION_ID}" \
    --limit=500 \
    --project=gen-lang-client-0960644135
```

### 问题: LLM调用失败

**常见原因**:
1. Gemini API配额不足
2. API key失效
3. 网络问题

**解决**:
```bash
# 检查secret是否有效
gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135 | head -c 20

# 检查Gemini API配额
# 访问: https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas
```

---

## 📈 Performance Metrics

**测试模式** (10 companies, 8 personas):
- 总时间: ~2.6分钟
- LLM调用: 80次

**生产模式** (84 companies, 8 personas):
- 预估时间: ~6-8分钟
- LLM调用: 672次
- 并行处理: 20 workers

**数据完整性**:
- FEC: ~77% 覆盖率
- ESG: ~99% 覆盖率
- Executive: ~0% (缺少有效statements)
- News: ~98% 覆盖率
- LLM: 100% (所有公司都有综合评分)

---

## 🔄 Update Deployment

重新部署（代码更新后）:

```bash
cd /Users/xuling/code/Stanse
bash scripts/company-ranking/deploy-ranking-generator.sh
```

这将重新构建镜像并更新Cloud Run Job。Scheduler自动使用新版本。

---

## 🎯 Architecture

```
Cloud Scheduler (每12小时)
    ↓
Cloud Run Job (enhanced-rankings-generator)
    ↓
Python Script (05-generate-enhanced-rankings.py)
    ↓ (并行处理)
├─→ Firebase读取 (FEC, ESG, Executive, News)
├─→ Persona-Aware评分计算
├─→ Gemini LLM综合评分 (672次调用)
├─→ 权重自适应 (50/50 或 100% LLM)
├─→ Firebase写入 (enhanced_company_rankings)
└─→ 日志导出 + Email通知
```

---

## ✅ Production Checklist

部署前确认:

- [ ] Gemini API key 在 Secret Manager 中有效
- [ ] SendGrid API key 配置正确 (lxu912@gmail.com已验证)
- [ ] Firebase权限正常 (stanseproject)
- [ ] Docker镜像构建成功
- [ ] 本地测试运行成功 (`--test`)
- [ ] Alert email已验证并可接收

---

**Created**: 2026-01-02
**Author**: Claude Code
**Project**: Stanse Enhanced Company Ranking System
