# 28. Company Ranking Data Collection - 测试计划与系统改进方案

**文档版本**: 1.0
**创建日期**: 2025-12-30
**相关文档**:
- [27. Persona-Aware Scoring Solution](./27_persona_aware_scoring_solution.md)
- [20. FEC Data Schema](./20_fec_data_schema.md)

---

## 📋 目录

1. [问题背景](#问题背景)
2. [解决方案](#解决方案)
3. [系统架构](#系统架构)
4. [测试计划](#测试计划)
5. [使用说明](#使用说明)

---

## 🔴 问题背景

### 当前问题

在修改和部署 company ranking 数据收集系统的过程中，积累了以下问题：

#### 1. 临时文件泛滥
```
scripts/company-ranking/
├── missing_fec_data.txt        # FEC 缺失公司
├── missing_fec_rankings.txt    # FEC ranking 缺失
├── missing_esg.txt             # ESG 缺失
├── missing_exec.txt            # Executive 缺失
├── retry_failed.txt            # 重试失败
├── fix-amd.txt                 # AMD 特殊修复
└── ... 更多临时文件
```

**问题**:
- ❌ 文件命名不规范，难以管理
- ❌ 每次缺失都要手动创建文件
- ❌ 容易遗忘清理
- ❌ 没有统一的数据完整性检查机制

#### 2. 缺乏自动化
- ❌ 需要手动检测哪些公司缺失数据
- ❌ 需要手动运行4个脚本
- ❌ 无法自动重试失败的公司
- ❌ 没有统一的进度报告

#### 3. 测试不完整
修改后的4个脚本包含重大变更：
- [01-collect-fec-donations.py](../../scripts/company-ranking/01-collect-fec-donations.py):
  - 修复数据源为 `fec_company_consolidated`
  - 添加 ticker 文件输入支持
- [02-collect-esg-scores.py](../../scripts/company-ranking/02-collect-esg-scores.py):
  - 添加 ticker 文件输入支持
- [03-collect-polygon-news.py](../../scripts/company-ranking/03-collect-polygon-news.py):
  - 添加 ticker 文件输入支持
- [04-analyze-executive-statements.py](../../scripts/company-ranking/04-analyze-executive-statements.py):
  - 添加 ticker 文件输入支持
  - AMD 特殊处理 (8192 tokens)

**问题**:
- ❌ 未经端到端测试
- ❌ 不确定能否从0开始完整运行
- ❌ 没有验证数据完整性的机制

---

## ✅ 解决方案

### 核心思路

**不再依赖临时文件**，而是：
1. 通过 Firebase 查询自动检测缺失数据
2. 使用主控脚本 (Orchestrator) 统一管理
3. 建立完整的测试体系

### 系统组件

#### 1. 主控脚本 (00-orchestrator.py)
**位置**: `/Users/xuling/code/Stanse/scripts/company-ranking/00-orchestrator.py`

**功能**:
- ✅ 自动检测4个数据源的缺失公司
- ✅ 按顺序执行数据收集脚本
- ✅ 自动重试失败的公司
- ✅ 生成完整的数据收集报告
- ✅ 不产生任何临时文件

**使用方式**:
```bash
# 检查数据完整性（不执行收集）
python3 00-orchestrator.py --mode check-only

# 只补齐缺失的数据
python3 00-orchestrator.py --mode fill-missing

# 完整运行（从0开始）
python3 00-orchestrator.py --mode full

# 重试失败的公司
python3 00-orchestrator.py --mode retry
```

#### 2. 清理脚本 (cleanup-temp-files.sh)
**位置**: `/Users/xuling/code/Stanse/scripts/company-ranking/cleanup-temp-files.sh`

**功能**:
- ✅ 自动查找并删除所有临时 .txt 文件
- ✅ 安全确认机制

**使用方式**:
```bash
cd scripts/company-ranking
bash cleanup-temp-files.sh
```

---

## 🏗️ 系统架构

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                 00-orchestrator.py                         │
│                   (主控脚本)                                │
│                                                             │
│  [Check] → [Plan] → [Execute] → [Verify] → [Report]       │
└──────────┬──────────────────────────────────────┬──────────┘
           │                                       │
           │ 检测缺失数据                          │ 验证完整性
           ↓                                       ↓
    ┌──────────────┐                       ┌──────────────┐
    │   Firebase   │                       │   Firebase   │
    │              │                       │              │
    │ - FEC data   │                       │ Coverage %   │
    │ - ESG data   │                       │ Missing list │
    │ - News data  │                       │              │
    │ - Executive  │                       │              │
    └──────────────┘                       └──────────────┘
           │
           │ 自动调用
           ↓
    ┌──────────────────────────────────────────────┐
    │         数据收集脚本 (按顺序执行)              │
    │                                              │
    │  1. 01-collect-fec-donations.py              │
    │     └─> company_rankings_by_ticker/          │
    │                                              │
    │  2. 02-collect-esg-scores.py                 │
    │     └─> company_esg_by_ticker/               │
    │                                              │
    │  3. 03-collect-polygon-news.py               │
    │     └─> company_news_by_ticker/              │
    │                                              │
    │  4. 04-analyze-executive-statements.py       │
    │     └─> company_executive_statements_by_.../ │
    └──────────────────────────────────────────────┘
```

### 数据源检查逻辑

Orchestrator 检查每个数据源的完整性：

```python
for ticker in SP500_TICKERS:
    # 1. FEC Data
    doc = db.collection('company_rankings_by_ticker').document(ticker).get()
    if not doc.exists or 'fec_data' not in doc.to_dict():
        missing_fec.append(ticker)

    # 2. ESG Data
    doc = db.collection('company_esg_by_ticker').document(ticker).get()
    if not doc.exists or 'esg_data' not in doc.to_dict():
        missing_esg.append(ticker)

    # 3. News Data
    doc = db.collection('company_news_by_ticker').document(ticker).get()
    if not doc.exists or 'articles' not in doc.to_dict():
        missing_news.append(ticker)

    # 4. Executive Data
    doc = db.collection('company_executive_statements_by_ticker').document(ticker).get()
    if not doc.exists or 'analysis' not in doc.to_dict():
        missing_executive.append(ticker)
```

---

## 🧪 测试计划

### Phase 1: 单元测试（每个脚本独立测试）

#### Test 1.1: FEC Donations Collector ✅
```bash
# 准备
cd /Users/xuling/code/Stanse/scripts/company-ranking
echo -e "AAPL\nMSFT\nJPM" > test_tickers.txt

# 执行
python3 01-collect-fec-donations.py test_tickers.txt

# 验证
# - company_rankings_by_ticker/{AAPL,MSFT,JPM}/fec_data 存在
# - data_source = 'fec_company_consolidated' ✅
# - 包含 PAC transfer data ✅
# - Political lean score 计算正确 ✅
```

**预期结果**:
- ✅ 所有3个公司成功处理
- ✅ `data_source` 字段 = `fec_company_consolidated`
- ✅ 包含 party_totals (DEM, REP, OTH)
- ✅ Political lean score 在 -100 到 +100 范围内

#### Test 1.2: ESG Scores Collector ✅
```bash
# 设置 API key
export FMP_API_KEY=$(gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135)

# 执行
python3 02-collect-esg-scores.py test_tickers.txt

# 验证
# - company_esg_by_ticker/{AAPL,MSFT,JPM}/esg_data 存在
# - 包含 E, S, G 分数
```

**预期结果**:
- ✅ ESG 数据成功获取
- ✅ environmentalScore, socialScore, governanceScore 都存在
- ✅ 分数在 0-100 范围内

#### Test 1.3: Polygon News Collector ✅
```bash
# 设置 API key
export POLYGON_API_KEY=$(gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135)

# 执行
python3 03-collect-polygon-news.py test_tickers.txt

# 验证
# - company_news_by_ticker/{AAPL,MSFT,JPM}/articles 存在
# - 至少5篇文章
```

**预期结果**:
- ✅ News 数据成功获取
- ✅ 每个公司至少5篇文章
- ✅ 文章包含 title, summary, published_utc

#### Test 1.4: Executive Statements Analyzer ✅
```bash
# 设置 API key
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)

# 执行
python3 04-analyze-executive-statements.py test_tickers.txt

# 验证
# - company_executive_statements_by_ticker/{AAPL,MSFT,JPM}/analysis 存在
# - political_stance 分析存在
```

**预期结果**:
- ✅ Executive statements 成功分析
- ✅ 包含 political_stance (DEM/REP/BALANCED)
- ✅ 包含 confidence_level

---

### Phase 2: 集成测试 (Orchestrator)

#### Test 2.1: Check-Only Mode ✅
```bash
# 检查当前数据完整性（不执行收集）
python3 00-orchestrator.py --mode check-only
```

**预期输出**:
```
============================================================
📊 Checking Data Completeness
============================================================

🔍 Checking FEC Donations...
  ├─ Total: 84
  ├─ Missing: 15
  └─ Coverage: 82.1%

🔍 Checking ESG Scores...
  ├─ Total: 84
  ├─ Missing: 0
  └─ Coverage: 100.0%

🔍 Checking Polygon News...
  ├─ Total: 84
  ├─ Missing: 0
  └─ Coverage: 100.0%

🔍 Checking Executive Statements...
  ├─ Total: 84
  ├─ Missing: 45
  └─ Coverage: 46.4%

============================================================
📊 Summary
============================================================

FEC Donations:
  ├─ Coverage: 82.1%
  ├─ Missing: 15/84
  └─ Missing tickers: ADBE, AMD, AMT, AMZN, COST, ...

ESG Scores:
  ├─ Coverage: 100.0%
  └─ Missing: 0/84

...
```

**验证**:
- ✅ 正确识别缺失的公司
- ✅ Coverage 百分比准确
- ✅ 不执行任何数据收集

#### Test 2.2: Fill-Missing Mode ✅
```bash
# 只补齐缺失的数据
python3 00-orchestrator.py --mode fill-missing
```

**预期行为**:
- ✅ 自动检测缺失数据
- ✅ 只处理缺失的公司
- ✅ 按顺序执行4个脚本
- ✅ 跳过已有数据的公司

---

### Phase 3: 端到端测试 (Full Collection)

#### Test 3.1: 清空测试数据
```bash
# 手动删除3个测试公司的所有数据
# - company_rankings_by_ticker/{AAPL,MSFT,JPM}
# - company_esg_by_ticker/{AAPL,MSFT,JPM}
# - company_news_by_ticker/{AAPL,MSFT,JPM}
# - company_executive_statements_by_ticker/{AAPL,MSFT,JPM}
```

#### Test 3.2: Full Collection (仅测试公司)
```bash
# 修改 00-orchestrator.py 的 SP500_TICKERS 为测试列表
# SP500_TICKERS = ['AAPL', 'MSFT', 'JPM']

python3 00-orchestrator.py --mode full
```

**预期输出**:
```
############################################################
# FULL DATA COLLECTION
# Started at: 2025-12-30 XX:XX:XX
############################################################

============================================================
🚀 Running: FEC Donations
============================================================
Script: 01-collect-fec-donations.py

[1/3] AAPL
📊 Processing AAPL...
  └─ Found 4 variants...
  ✅ Success

[2/3] MSFT
📊 Processing MSFT...
  └─ Found 3 variants...
  ✅ Success

[3/3] JPM
📊 Processing JPM...
  └─ Found 2 variants...
  ✅ Success

============================================================
🚀 Running: ESG Scores
============================================================
...

============================================================
✅ Data Collection Complete
============================================================
Scripts run: 4
Duration: 180.5s (3.0 minutes)
Finished at: 2025-12-30 XX:XX:XX
============================================================
```

**验证**:
- ✅ 4个脚本全部成功执行
- ✅ 所有3个公司都有完整数据
- ✅ 无需人工干预
- ✅ 无临时文件产生

#### Test 3.3: 数据完整性验证
```bash
# 再次运行 check-only 验证
python3 00-orchestrator.py --mode check-only
```

**预期结果**:
- ✅ FEC Data: 100% (3/3)
- ✅ ESG Data: 100% (3/3)
- ✅ News Data: 100% (3/3)
- ✅ Executive Data: 100% (3/3)

---

### Phase 4: 生产环境测试 (完整84个公司)

#### Test 4.1: Dry Run (检查模式)
```bash
# 恢复完整的 SP500_TICKERS 列表 (84个公司)
python3 00-orchestrator.py --mode check-only

# 记录当前覆盖率
```

#### Test 4.2: Fill Missing (生产环境)
```bash
# 只补齐缺失的数据
python3 00-orchestrator.py --mode fill-missing

# 预计时间: 10-20分钟 (取决于缺失数量)
```

**预期结果**:
- ✅ 覆盖率提升到 >90%
- ✅ 无临时文件产生
- ✅ 所有历史数据保留

---

## 📖 使用说明

### 日常数据维护

#### 1. 检查数据完整性
```bash
cd /Users/xuling/code/Stanse/scripts/company-ranking
python3 00-orchestrator.py --mode check-only
```

#### 2. 补齐缺失数据
```bash
python3 00-orchestrator.py --mode fill-missing
```

#### 3. 清理临时文件
```bash
bash cleanup-temp-files.sh
```

### 从0开始部署

如果需要从零开始收集所有数据（例如新环境）：

```bash
# 1. 确认环境
cd /Users/xuling/code/Stanse/scripts/company-ranking

# 2. 检查当前状态
python3 00-orchestrator.py --mode check-only

# 3. 完整运行
python3 00-orchestrator.py --mode full

# 4. 验证结果
python3 00-orchestrator.py --mode check-only
```

### 手动运行单个脚本

如果只需要更新某个数据源：

```bash
# FEC 数据
python3 01-collect-fec-donations.py

# ESG 数据
export FMP_API_KEY=$(gcloud secrets versions access latest --secret=FMP_API_KEY --project=gen-lang-client-0960644135)
python3 02-collect-esg-scores.py

# News 数据
export POLYGON_API_KEY=$(gcloud secrets versions access latest --secret=polygon-api-key --project=gen-lang-client-0960644135)
python3 03-collect-polygon-news.py

# Executive Statements
export GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key --project=gen-lang-client-0960644135)
python3 04-analyze-executive-statements.py
```

---

## ✅ 成功标准

### 必须满足 (Must Have)
1. ✅ 4个脚本能独立运行且支持ticker文件输入
2. ✅ Orchestrator 能自动检测缺失数据
3. ✅ Full collection 模式能从0开始加载所有数据
4. ✅ FEC data_source 字段正确显示 'fec_company_consolidated'
5. ✅ 无需创建临时txt文件

### 应该满足 (Should Have)
1. ✅ 数据覆盖率 >90%
2. ✅ 完整运行时间 <30分钟 (84个公司)
3. ✅ 自动重试失败的公司

### 可以改进 (Nice to Have)
1. 并行处理多个公司
2. 实时进度显示
3. 失败详细日志

---

## 📝 测试检查清单

### 准备阶段
- [ ] 清理所有临时txt文件
- [ ] 备份现有数据（如果需要）
- [ ] 确认所有API keys可用

### Phase 1: 单元测试
- [ ] Test 1.1: FEC Donations ✅
- [ ] Test 1.2: ESG Scores ✅
- [ ] Test 1.3: Polygon News ✅
- [ ] Test 1.4: Executive Statements ✅

### Phase 2: 集成测试
- [ ] Test 2.1: Check-Only Mode ✅
- [ ] Test 2.2: Fill-Missing Mode ✅

### Phase 3: 端到端测试
- [ ] Test 3.1: 清空测试数据 ✅
- [ ] Test 3.2: Full Collection ✅
- [ ] Test 3.3: 数据完整性验证 ✅

### Phase 4: 生产环境
- [ ] Test 4.1: Dry Run ✅
- [ ] Test 4.2: Fill Missing ✅

### 清理阶段
- [ ] 删除所有临时文件
- [ ] 验证最终数据完整性
- [ ] 更新文档

---

## 🔄 回滚计划

如果测试失败：
1. 保留临时txt文件作为备份
2. 使用历史版本恢复数据（每个文档都有 `history` subcollection）
3. 逐个脚本排查问题
4. 记录详细错误日志

---

## 📊 执行计划

### 快速测试 (30分钟)
```bash
# 1. 单元测试（每个5分钟）
cd /Users/xuling/code/Stanse/scripts/company-ranking
echo -e "AAPL\nMSFT\nJPM" > test_tickers.txt

python3 01-collect-fec-donations.py test_tickers.txt
# ... 依次测试其他脚本

# 2. 集成测试（10分钟）
python3 00-orchestrator.py --mode check-only
python3 00-orchestrator.py --mode fill-missing

# 3. 清理
bash cleanup-temp-files.sh
```

### 完整测试 (2小时)
按照 Phase 1-4 顺序执行，详细记录每个阶段的结果。

---

最后更新: 2025-12-30
