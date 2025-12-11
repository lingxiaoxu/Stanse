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

### 1. 原始数据表 (Raw Data Tables)

#### 1.1 `fec_raw_committees` - 委员会/PAC主数据
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
- `committee_id` + `data_year` (复合索引)
- `connected_org_name` (全文搜索)
- `data_year`

---

#### 1.2 `fec_raw_candidates` - 候选人主数据
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
- `candidate_id` + `data_year`
- `party_affiliation` + `data_year`
- `state` + `data_year`

---

#### 1.3 `fec_raw_contributions_pac_to_candidate` - PAC对候选人捐款
```javascript
{
  // Document ID: auto-generated (因为没有自然主键)
  "auto_id_12345": {
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
- `committee_id` + `data_year` (复合索引)
- `candidate_id` + `data_year`
- `transaction_date`

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

#### 1.5 `fec_raw_committee_linkages` - 委员会关联
```javascript
{
  // Document ID: {linkage_id}_{year}
  "linkage_12345_2024": {
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

---

#### 1.6 `fec_raw_operating_expenditures` - 运营支出
```javascript
{
  // Document ID: auto-generated
  "auto_id_abc": {
    committee_id: "C00000059",
    transaction_date: "20240120",
    expenditure_amount: 150000,  // $1,500.00
    expenditure_purpose: "OFFICE RENT",
    payee_name: "LANDLORD COMPANY",
    city: "KANSAS CITY",
    state: "MO",

    // 元数据
    data_year: 2024,
    election_cycle: "2023-2024",
    source_file: "oppexp24.zip",
    uploaded_at: timestamp,
    last_updated: timestamp
  }
}
```

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
// 1. 查找公司（支持模糊匹配）
const companyDoc = await db.collection('fec_company_index')
  .where('search_keywords', 'array-contains', 'hallmark')
  .limit(1)
  .get();

const normalizedName = companyDoc.docs[0].data().normalized_name;

// 2. 直接获取汇总数据
const summary = await db.collection('fec_company_party_summary')
  .doc(`${normalizedName}_2024`)
  .get();

// 结果
console.log(summary.data().party_totals);
// {DEM: {...}, REP: {...}}
```

### 查询2: 公司的历史捐款趋势

```javascript
const allYears = await db.collection('fec_company_all_years_summary')
  .doc(normalizedName)
  .get();

console.log(allYears.data().by_year);
// {2024: {...}, 2022: {...}, 2020: {...}}
```

### 查询3: 查看原始捐款记录

```javascript
// 查看某公司PAC的所有捐款明细
const contributions = await db.collection('fec_raw_contributions_pac_to_candidate')
  .where('committee_id', '==', 'C00000059')
  .where('data_year', '==', 2024)
  .orderBy('transaction_date', 'desc')
  .limit(100)
  .get();
```

---

## 存储估算

### 原始数据（每年）
- Committees: ~20,000 docs × 2KB = 40 MB
- Candidates: ~5,000 docs × 1KB = 5 MB
- Contributions: ~500,000 docs × 1KB = 500 MB
- Individual contributions: ~2,000,000 docs × 1KB = 2 GB

### 处理后数据
- Company index: ~10,000 docs × 1KB = 10 MB
- Company summaries (per year): ~10,000 docs × 5KB = 50 MB
- All years summaries: ~10,000 docs × 10KB = 100 MB

### 5年总计
- 原始数据: (40 + 5 + 500) MB × 5 = 2.7 GB
- 处理数据: 160 MB
- **总计**: ~2.9 GB

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
    // FEC原始数据 - 只读（公开数据）
    match /fec_raw_{type}/{doc} {
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

---

## 下一步

1. 实现完整的上传脚本（包含所有数据类型）
2. 构建自动化更新任务（Cloud Functions + Cloud Scheduler）
3. 添加数据验证和错误处理
4. 实现前端查询API
