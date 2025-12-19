# FEC Data Firebase Architecture

## 概述

完整的FEC数据Firebase架构设计，支持定期数据更新和高效查询。所有原始数据和处理后的关联数据都存储在Firestore中。

## 核心原则

1. **原始数据完整保存**: 所有FEC原始数据表格都要在Firebase中构建
2. **时间戳管理**: 每条记录都有时间戳，支持按年份分离数据
3. **数据关联**: 预处理JOIN结果，避免查询时重复计算
4. **增量更新**: 支持定期从FEC网站下载新数据并更新
5. **本地不保留**: 处理完成后删除本地文件

## Firestore Collections架构

### Collection命名策略

**多年份集合** (所有年份的数据存储在单个集合中，使用`data_year`字段过滤):
- `fec_raw_committees` - Document ID: `{committee_id}_{year}`，包含`data_year`字段
- `fec_raw_candidates` - Document ID: `{candidate_id}_{year}`，包含`data_year`字段
- `fec_raw_linkages` - Document ID: `{candidate_id}_{committee_id}_{year}`
- `fec_raw_transfers` - Document ID: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}`

**年份特定集合** (每个选举周期年份一个独立集合):
- `fec_raw_contributions_pac_to_candidate_2024` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- `fec_raw_contributions_pac_to_candidate_2022` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- `fec_raw_contributions_pac_to_candidate_2020` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- `fec_raw_contributions_pac_to_candidate_2018` - Document ID: `{committee_id}_{candidate_id}_{line_num}`
- `fec_raw_contributions_pac_to_candidate_2016` - Document ID: `{committee_id}_{candidate_id}_{line_num}`

**设计原因**:
1. **为什么捐款使用年份特定集合**: 捐款数据量最大（每年~50万条记录），独立集合防止单个集合大小限制，提升查询性能
2. **为什么委员会/候选人使用多年份集合**: 这些数据集较小，在单个集合中更容易通过`data_year`字段过滤
3. **Python脚本配置**: 所有脚本使用`DATA_YEAR = '24'`配置变量（可以是'16', '18', '20', '22', '24'）

### 1. 原始数据表 (Raw Data Tables)

#### 1.1 `fec_raw_committees` - 委员会/PAC主数据
**多年份集合** - 包含所有年份的记录

```javascript
{
  // Document ID: {committee_id}_{year}
  "C00000059_2024": {
    committee_id: "C00000059",
    committee_name: "HALLMARK CARDS, INC. PAC (HALLPAC)",
    treasurer_name: "KLEIN, CASSIE MS.",
    connected_org_name: "HALLMARK CARDS, INC.",
    street_1: "2501 MCGEE, MD853",
    city: "KANSAS CITY",
    state: "MO",
    zip: "64108",
    designation: "B",
    committee_type: "Q",
    party: "UNK",
    filing_frequency: "M",
    interest_group_category: "C",
    candidate_id: "",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "cm24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- Document ID: `{committee_id}_{year}` (自动索引)
- `committee_id` (用于跨年份查找)
- `data_year` (用于按年份过滤)
- `connected_org_name` (用于公司查找)

---

#### 1.2 `fec_raw_candidates` - 候选人主数据
**多年份集合** - 包含所有年份的记录

```javascript
{
  // Document ID: {candidate_id}_{year}
  "H0NY15049_2024": {
    candidate_id: "H0NY15049",
    candidate_name: "OCASIO-CORTEZ, ALEXANDRIA",
    party_affiliation: "DEM",
    election_year: 2024,
    office_sought: "H",  // H=House, S=Senate, P=President
    state: "NY",
    district: "15",
    incumbent_challenger_status: "I",  // I=Incumbent, C=Challenger, O=Open
    candidate_status: "C",  // C=Candidate
    principal_committee_id: "C00639591",
    street_1: "...",
    city: "...",
    zip: "...",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "cn24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- Document ID: `{candidate_id}_{year}` (自动索引)
- `candidate_id` (用于跨年份查找)
- `data_year` (用于按年份过滤)
- `party_affiliation` + `data_year` (复合索引)
- `state` + `data_year` (复合索引)

---

#### 1.3 `fec_raw_contributions_pac_to_candidate_{year}` - PAC对候选人捐款
**年份特定集合** - 每个选举周期年份一个独立集合

可用年份: 2016, 2018, 2020, 2022, 2024

```javascript
{
  // Collection: fec_raw_contributions_pac_to_candidate_2024
  // Document ID: {committee_id}_{candidate_id}_{line_num}
  "C00000059_H0NY15049_12345": {
    committee_id: "C00000059",  // 捐款方PAC
    candidate_id: "H0NY15049",  // 接收方候选人
    transaction_id: "...",
    transaction_date: "20240315",  // YYYYMMDD
    transaction_amount: 500000,  // 以美分为单位 ($5,000.00)
    transaction_type: "24K",
    entity_type: "CAN",
    amendment_indicator: "N",
    report_type: "Q1",
    primary_general_indicator: "P",
    image_number: "...",
    file_number: "...",
    memo_code: "",
    memo_text: "",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "pas224.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- Document ID: `{committee_id}_{candidate_id}_{line_num}` (自动索引)
- `committee_id` (用于PAC→捐款查找)
- `candidate_id` (用于候选人→捐款查找)
- `transaction_date` (用于时间查询)

**查询方式**:
- **查询单年**: 直接查询特定年份集合 (例如: `fec_raw_contributions_pac_to_candidate_2024`)
- **查询多年**: 依次或并行迭代多个年份特定集合
- **Python脚本**: 使用`DATA_YEAR = '24'`变量指定要查询的集合

---

#### 1.4 `fec_raw_contributions_individual` - 个人捐款
```javascript
{
  // Document ID: auto-generated
  "auto_id_67890": {
    committee_id: "C00000059",
    entity_type: "IND",
    contributor_name: "SMITH, JOHN",
    city: "NEW YORK",
    state: "NY",
    zip: "10001",
    employer: "GOOGLE INC",
    occupation: "SOFTWARE ENGINEER",
    transaction_date: "20240115",
    transaction_amount: 250000,  // $2,500.00
    transaction_id: "...",
    image_number: "...",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "indiv24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- `committee_id` + `data_year`
- `employer` (用于分析企业员工捐款模式)

---

#### 1.5 `fec_raw_linkages` - 委员会关联
**多年份集合** - 包含所有年份的记录

```javascript
{
  // Document ID: {candidate_id}_{committee_id}_{year}
  "H0NY15049_C00639591_2024": {
    candidate_id: "H0NY15049",
    committee_id: "C00639591",
    committee_type: "P",  // P=Principal
    committee_designation: "P",
    linkage_id: "12345",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "ccl24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- Document ID: `{candidate_id}_{committee_id}_{year}` (自动索引)
- `candidate_id` (用于候选人→委员会查找)
- `committee_id` (用于委员会→候选人查找)
- `data_year` (用于按年份过滤)

---

#### 1.6 `fec_raw_transfers` - 委员会间转账
**多年份集合** - 包含所有年份的记录

```javascript
{
  // Document ID: {sender_committee_id}_{receiver_committee_id}_{transaction_id}
  "C00000059_C00639591_TX123456": {
    sender_committee_id: "C00000059",
    receiver_committee_id: "C00639591",
    transaction_id: "TX123456",
    transaction_date: "20240120",  // YYYYMMDD
    transaction_amount: 150000,  // 以美分为单位 ($1,500.00)
    transaction_type: "24T",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "oth24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- Document ID: `{sender_committee_id}_{receiver_committee_id}_{transaction_id}` (自动索引)
- `sender_committee_id` (用于发送方查找)
- `receiver_committee_id` (用于接收方查找)
- `data_year` (用于按年份过滤)
- `transaction_date` (用于时间查询)

---

### 2. 处理后的关联数据 (Processed/Joined Data)

#### 2.1 `fec_company_index` - 公司索引（优化查询）
```javascript
{
  // Document ID: normalized_company_name
  "hallmarkcards": {
    normalized_name: "hallmarkcards",
    original_names: [
      "HALLMARK CARDS, INC.",
      "Hallmark Cards Inc",
      "HALLMARK CARDS INC"
    ],
    search_keywords: ["hallmark", "cards", "hallmarkcards"],

    // 关联的所有PAC（跨年份）
    committee_ids: [
      {committee_id: "C00000059", years: [2024, 2022, 2020, 2018, 2016]}
    ],

    total_committees: 1,
    created_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- `search_keywords` (array-contains)

---

#### 2.2 `fec_company_party_summary` - 公司政党捐款汇总
```javascript
{
  // Document ID: {normalized_company}_{year}
  "hallmarkcards_2024": {
    company_name: "Hallmark Cards",
    normalized_name: "hallmarkcards",
    data_year: 2024,
    election_cycle: "2023-2024",

    // 按政党汇总的捐款
    party_totals: {
      "DEM": {
        total_amount: 4350000,  // $43,500.00
        contribution_count: 18,
        top_recipients: [
          {candidate_id: "H0NY15049", candidate_name: "OCASIO-CORTEZ, ALEXANDRIA", amount: 500000}
        ]
      },
      "REP": {
        total_amount: 3650000,  // $36,500.00
        contribution_count: 15,
        top_recipients: [...]
      }
    },

    total_contributed: 8000000,  // $80,000.00
    total_contributions: 33,

    // 涉及的PAC
    committee_ids: ["C00000059"],

    calculated_at: timestamp,
    last_updated: timestamp
  }
}
```

**索引**:
- `normalized_name` + `data_year`
- `data_year`

---

#### 2.3 `fec_company_all_years_summary` - 公司所有年份总汇总
```javascript
{
  // Document ID: normalized_company_name
  "hallmarkcards": {
    company_name: "Hallmark Cards",
    normalized_name: "hallmarkcards",

    // 所有年份总计
    all_time_totals: {
      "DEM": 25000000,  // $250,000 across all years
      "REP": 22000000   // $220,000 across all years
    },

    // 按年份分解
    by_year: {
      "2024": {
        "DEM": 4350000,
        "REP": 3650000,
        total: 8000000
      },
      "2022": {...},
      "2020": {...}
    },

    years_available: [2024, 2022, 2020, 2018, 2016],
    total_contributed_all_time: 47000000,  // $470,000

    calculated_at: timestamp,
    last_updated: timestamp
  }
}
```

---

### 3. 元数据管理

#### 3.1 `fec_data_metadata` - 数据更新记录
```javascript
{
  // Document ID: {data_type}_{year}
  "committees_2024": {
    data_type: "committees",
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "cm24.zip",
    source_url: "https://www.fec.gov/files/bulk-downloads/2024/cm24.zip",

    download_date: timestamp,
    file_size_bytes: 880640,
    records_count: 7823,
    upload_started_at: timestamp,
    upload_completed_at: timestamp,
    upload_status: "completed",  // pending, processing, completed, failed

    processing_stats: {
      records_processed: 7823,
      records_failed: 0,
      processing_time_ms: 12500
    }
  }
}
```

**索引**:
- `data_type` + `data_year`
- `upload_status`

---

#### 3.2 `fec_update_schedule` - 更新计划
```javascript
{
  // Document ID: schedule_id
  "monthly_update": {
    schedule_name: "Monthly FEC Data Update",
    frequency: "monthly",  // daily, weekly, monthly
    next_run: timestamp,
    last_run: timestamp,
    last_run_status: "success",

    data_types_to_update: [
      "committees",
      "candidates",
      "contributions_pac_to_candidate"
    ],

    years_to_update: [2024, 2022],  // 只更新最近的年份

    enabled: true
  }
}
```

---

## 数据更新流程

### 完整更新流程

```
1. 下载数据
   ↓
2. 解压ZIP文件
   ↓
3. 解析TXT文件
   ↓
4. 上传原始数据到 fec_raw_* collections
   ↓
5. 构建公司索引 (fec_company_index)
   ↓
6. 计算汇总数据 (fec_company_party_summary)
   ↓
7. 更新元数据 (fec_data_metadata)
   ↓
8. 删除本地文件
   ↓
9. 完成
```

### 增量更新流程

当新的一个月数据发布时：

```python
# 1. 检查是否有新数据
if is_new_data_available(year=2024, month=current_month):
    # 2. 下载新数据
    download_files(year=2024)

    # 3. 解析并上传原始数据
    upload_raw_data(year=2024)

    # 4. 重新计算该年份的汇总数据
    recalculate_summaries(year=2024)

    # 5. 更新all_years汇总
    update_all_years_summaries()

    # 6. 清理本地文件
    cleanup_local_files()
```

---

## 查询模式

### 查询1: 公司的政党捐款分布（单年）

```javascript
// 配置：指定查询年份
const DATA_YEAR = 2024;

// 1. 查找公司（支持模糊匹配）
const companyDoc = await db.collection('fec_company_index')
  .where('search_keywords', 'array-contains', 'hallmark')
  .limit(1)
  .get();

const normalizedName = companyDoc.docs[0].data().normalized_name;
const committeeIds = companyDoc.docs[0].data().committee_ids;

// 2. 从年份特定集合获取捐款（必须在集合名中指定年份）
const contributions = await db.collection(`fec_raw_contributions_pac_to_candidate_${DATA_YEAR}`)
  .where('committee_id', 'in', committeeIds.slice(0, 10))
  .get();

// 3. 获取候选人信息（使用data_year过滤）
const candidateIds = [...new Set(contributions.docs.map(d => d.data().candidate_id))];
const candidates = await db.collection('fec_raw_candidates')
  .where('data_year', '==', DATA_YEAR)
  .where('candidate_id', 'in', candidateIds.slice(0, 10))
  .get();

// 4. 按政党汇总
const partyTotals = {};
contributions.forEach(contribDoc => {
  const contrib = contribDoc.data();
  const candidate = candidates.docs.find(c => c.data().candidate_id === contrib.candidate_id);
  if (candidate) {
    const party = candidate.data().party_affiliation;
    partyTotals[party] = (partyTotals[party] || 0) + contrib.transaction_amount;
  }
});

// 结果
console.log(partyTotals);
// {DEM: 4350000, REP: 3650000}
```

### 查询2: 公司的历史捐款趋势（多年）

```javascript
// 配置：要查询的年份列表
const YEARS = [2024, 2022, 2020];

// 1. 查找公司
const companyDoc = await db.collection('fec_company_index')
  .where('search_keywords', 'array-contains', 'hallmark')
  .limit(1)
  .get();

const committeeIds = companyDoc.docs[0].data().committee_ids;

// 2. 并行查询多个年份的捐款
const yearlyResults = await Promise.all(YEARS.map(async (year) => {
  // 从年份特定集合获取捐款
  const contributions = await db.collection(`fec_raw_contributions_pac_to_candidate_${year}`)
    .where('committee_id', 'in', committeeIds.slice(0, 10))
    .get();

  // 获取该年候选人信息
  const candidateIds = [...new Set(contributions.docs.map(d => d.data().candidate_id))];
  const candidates = await db.collection('fec_raw_candidates')
    .where('data_year', '==', year)
    .where('candidate_id', 'in', candidateIds.slice(0, 10))
    .get();

  // 按政党汇总
  const partyTotals = {};
  contributions.forEach(contribDoc => {
    const contrib = contribDoc.data();
    const candidate = candidates.docs.find(c => c.data().candidate_id === contrib.candidate_id);
    if (candidate) {
      const party = candidate.data().party_affiliation;
      partyTotals[party] = (partyTotals[party] || 0) + contrib.transaction_amount;
    }
  });

  return { year, partyTotals };
}));

console.log(yearlyResults);
// [{year: 2024, partyTotals: {DEM: ..., REP: ...}}, {year: 2022, ...}, {year: 2020, ...}]
```

### 查询3: 查看原始捐款记录

```javascript
// 配置：指定查询年份
const DATA_YEAR = 2024;

// 查看某公司PAC的所有捐款明细（从年份特定集合查询）
const contributions = await db.collection(`fec_raw_contributions_pac_to_candidate_${DATA_YEAR}`)
  .where('committee_id', '==', 'C00000059')
  .orderBy('transaction_date', 'desc')
  .limit(100)
  .get();

// 注意：data_year字段仍然存在于文档中，但不需要用于过滤，因为集合本身已经是年份特定的
```

---

## 存储估算

### 每年数据量
- Committees: ~20,000 docs × 2KB = 40 MB (多年份集合，包含data_year字段)
- Candidates: ~5,000 docs × 1KB = 5 MB (多年份集合，包含data_year字段)
- Linkages: ~10,000 docs × 500B = 5 MB (多年份集合，包含data_year字段)
- Transfers: ~50,000 docs × 500B = 25 MB (多年份集合，包含data_year字段)
- Contributions: ~500,000 docs × 1KB = 500 MB (年份特定集合，每年一个独立集合)

### 5年总计 (2016, 2018, 2020, 2022, 2024)
**多年份集合** (所有年份在单个集合中):
- Committees (所有年份): ~100,000 docs = 200 MB
- Candidates (所有年份): ~25,000 docs = 25 MB
- Linkages (所有年份): ~50,000 docs = 25 MB
- Transfers (所有年份): ~250,000 docs = 125 MB

**年份特定集合** (每年一个独立集合):
- Contributions (5个独立集合): 5 × 500 MB = 2,500 MB

**索引集合**:
- Company index: ~10,000 docs × 500B = 5 MB

**总计 (5年)**: ~2,880 MB (~2.9 GB)

**架构说明**:
- 多年份集合 (committees, candidates, linkages, transfers) 将所有年份存储在单个集合中，使用`data_year`字段过滤
- 年份特定集合 (contributions) 每年一个独立集合，以管理规模和提升查询性能

**注意**: Firestore免费层是1GB存储。如果需要存储所有年份的数据，需要升级到付费计划（约$0.18/GB/月）。

---

## 成本优化策略

1. **只保留关键年份**: 仅存储最近3个选举周期（6年）
2. **原始数据压缩**: 将不常用的字段存为JSON字符串
3. **按需加载**: 旧年份数据可以存储在Cloud Storage，需要时再导入
4. **定期清理**: 自动删除超过10年的原始数据

---

## 安全规则

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // FEC多年份原始数据 - 只读（公开数据）
    match /fec_raw_committees/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /fec_raw_candidates/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /fec_raw_linkages/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    match /fec_raw_transfers/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // FEC年份特定捐款集合 - 只读（公开数据）
    match /fec_raw_contributions_pac_to_candidate_{year}/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // FEC公司索引 - 只读
    match /fec_company_index/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // FEC处理数据 - 只读
    match /fec_company_{type}/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }

    // 元数据 - 管理员才能写
    match /fec_data_metadata/{doc} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

**注意**: 年份特定集合的通配符规则 `fec_raw_contributions_pac_to_candidate_{year}` 可能需要在实际使用时展开为具体的年份，例如 `fec_raw_contributions_pac_to_candidate_2024`, `fec_raw_contributions_pac_to_candidate_2022` 等。

---

## 下一步

1. 实现完整的上传脚本（包含所有数据类型）
2. 构建自动化更新任务（Cloud Functions + Cloud Scheduler）
3. 添加数据验证和错误处理
4. 实现前端查询API
