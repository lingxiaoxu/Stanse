# Batch 1 执行指南 (84 → 125 Companies)

**Date**: 2026-02-04
**Status**: 代码修改完成，等待数据采集

---

## ✅ 已完成的代码修改 (9个文件)

| 文件 | 修改内容 |
|------|---------|
| `data/sp500Data.json` | +41公司, totalCount: 125, version: 1.1.0 |
| `scripts/company-ranking/05-generate-enhanced-rankings.py` | Line 1570: 84→125 |
| `scripts/company-ranking/verification/verify-ticker-consistency.py` | 动态导入SP500_TICKERS |
| `scripts/company-ranking/batch1_new_tickers.txt` | ✅ 创建 (41个新ticker) |
| `scripts/company-ranking/deploy-ranking-generator.sh` | 84→125 (2处) |
| `scripts/company-ranking/02-collect-esg-scores.py` | 注释: 84→125 |
| `scripts/company-ranking/03-collect-polygon-news.py` | 注释: 84→125 |
| `documentation/backend/39_company_ranking_deployment.md` | 84→125 (4处) |
| `documentation/backend/35_enhanced_rankings_summary.md` | 84→125 (2处) |
| `documentation/backend/53_active_fronts_campaign_system.md` | 84→125, 168→250 |
| `documentation/backend/74_sp500_expansion_phase1_125_companies_2026_02_04.md` | ✅ 新建 |

---

## 🚀 执行步骤（按顺序）

### Step 1: 设置API Keys

```bash
cd /Users/xuling/code/Stanse

export POLYGON_API_KEY=$(gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135)
export FMP_API_KEY=$(gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135)
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)
```

### Step 2: 采集FEC政治捐款数据 (~5分钟)

```bash
python3 scripts/company-ranking/01-collect-fec-donations.py \
    scripts/company-ranking/batch1_new_tickers.txt
```

**输出**: `company_rankings_by_ticker` collection (84 → 125 docs)

### Step 3: 采集ESG评分数据 (~2分钟)

```bash
python3 scripts/company-ranking/02-collect-esg-scores.py \
    scripts/company-ranking/batch1_new_tickers.txt
```

**输出**: `company_esg_by_ticker` collection (84 → 125 docs)

### Step 4: 采集Polygon新闻数据 (~8分钟)

```bash
python3 scripts/company-ranking/03-collect-polygon-news.py \
    scripts/company-ranking/batch1_new_tickers.txt
```

**输出**: `company_news_by_ticker` collection (84 → 125 docs)

### Step 5: 分析Executive Statements (~2分钟)

```bash
python3 scripts/company-ranking/04-analyze-executive-statements.py \
    scripts/company-ranking/batch1_new_tickers.txt
```

**输出**: `company_executive_statements_by_ticker` collection (84 → 125 docs)

### Step 6: 验证数据完整性

```bash
# 验证所有4个collections的数据
python3 scripts/company-ranking/verification/verify-all-jobs.py

# 验证ticker一致性（所有collection都有125个docs）
python3 scripts/company-ranking/verification/verify-ticker-consistency.py
```

### Step 7: 生成Enhanced Rankings (~12分钟)

```bash
# 生成所有8个personas的rankings (125个公司)
python3 scripts/company-ranking/05-generate-enhanced-rankings.py
```

**输出**: `enhanced_company_rankings` collection (8 personas)
- 每个persona从125个公司中选出Top 5 Support / Top 5 Oppose

### Step 8: 本地验证前端

```bash
npm run dev
# 访问 Market 页面，验证rankings显示正常
```

---

## 📊 预期结果

### Firebase Collections状态

| Collection | 执行前 | 执行后 | 变化 |
|------------|-------|-------|-----|
| `company_rankings_by_ticker` | 84 docs | 125 docs | +41 |
| `company_esg_by_ticker` | 84 docs | 125 docs | +41 |
| `company_news_by_ticker` | 84 docs | 125 docs | +41 |
| `company_executive_statements_by_ticker` | 84 docs | 125 docs | +41 |
| `enhanced_company_rankings` | 8 docs | 8 docs | 更新 (从125中选Top 5) |

### 总耗时估算

| 任务 | 时间 |
|------|-----|
| FEC数据 | ~5分钟 |
| ESG数据 | ~2分钟 |
| Polygon新闻 | ~8分钟 |
| Executive分析 | ~2分钟 |
| 验证 | ~2分钟 |
| Rankings生成 | ~12分钟 |
| **总计** | **~30分钟** |

---

## 🔍 验证检查点

### 数据采集后验证

```bash
# 检查新增的41个公司是否都有数据
python3 -c "
from google.cloud import firestore
db = firestore.Client(project='stanseproject')

collections = [
    'company_rankings_by_ticker',
    'company_esg_by_ticker',
    'company_news_by_ticker',
    'company_executive_statements_by_ticker'
]

new_tickers = open('scripts/company-ranking/batch1_new_tickers.txt').read().split()

for coll in collections:
    count = 0
    for ticker in new_tickers:
        if db.collection(coll).document(ticker).get().exists:
            count += 1
    print(f'{coll}: {count}/{len(new_tickers)} new companies')
"
```

### Rankings生成后验证

```bash
# 检查8个personas是否都生成成功
python3 -c "
from google.cloud import firestore
db = firestore.Client(project='stanseproject')

personas = [
    'progressive-globalist',
    'progressive-nationalist',
    'socialist-libertarian',
    'socialist-nationalist',
    'capitalist-globalist',
    'capitalist-nationalist',
    'conservative-globalist',
    'conservative-nationalist'
]

for persona in personas:
    doc = db.collection('enhanced_company_rankings').document(persona).get()
    if doc.exists:
        data = doc.to_dict()
        print(f'✓ {persona}: {len(data.get(\"supportCompanies\", []))} support, {len(data.get(\"opposeCompanies\", []))} oppose')
    else:
        print(f'✗ {persona}: Missing!')
"
```

---

## ⚠️ 注意事项

### API限制

1. **Polygon API** (Free tier):
   - 5 calls/min
   - 脚本已设置12秒延迟
   - 41个公司 × 12秒 = ~8分钟

2. **FMP API**:
   - 需要付费key
   - 每个公司调用3个endpoints
   - 41个公司 × 3 = 123次API调用

3. **Gemini API**:
   - Executive分析: 41次调用
   - Rankings生成: 125 × 8 = 1000次调用
   - 确保配额充足

### 数据缺失处理

系统会自动处理缺失数据：
- 如果公司没有FEC数据，FEC score = None，动态权重调整
- 如果完全没有数据，使用LLM通用知识评估，默认分数50
- **不需要手动添加** `fec_company_name_variants`

---

## 🔮 下一步：Phase 2 (125 → 250)

当Batch 1在production验证通过后：

1. 创建 `batch2_new_tickers.txt` (125个新ticker)
2. 更新 `sp500Data.json` (totalCount=250)
3. 修改 `05-generate-enhanced-rankings.py:1570` (125→250)
4. 重复上述数据采集流程
5. 生成250公司的最终rankings

---

## 📝 Troubleshooting

### 问题: 某些公司FEC数据缺失

**正常情况**，不是所有公司都有政治捐款记录。系统会：
- 使用其他维度（ESG, News, Executive）
- LLM补充评估
- 不影响ranking生成

### 问题: API调用失败

检查API key是否正确：
```bash
# 验证keys已设置
echo $POLYGON_API_KEY | wc -c  # 应该>10
echo $FMP_API_KEY | wc -c      # 应该>10
echo $GEMINI_API_KEY | wc -c   # 应该>10
```

### 问题: Rankings没有更新

检查Firebase写入权限：
```bash
# 测试写入权限
python3 -c "
from google.cloud import firestore
db = firestore.Client(project='stanseproject')
db.collection('enhanced_company_rankings').document('test').set({'test': True})
print('✓ Write permission OK')
"
```

---

**准备好开始执行数据采集了吗？**
