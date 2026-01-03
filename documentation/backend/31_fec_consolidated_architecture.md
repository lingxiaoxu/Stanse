# FEC Consolidated Data Architecture

## Executive Summary

本文档描述FEC政治捐款数据的新架构设计，将个人捐款(individual contributions)和企业PAC转账(PAC transfers)数据分离存储，最后合并为统一的consolidated数据供前端使用。

**状态**: 实施中
**优先级**: 高
**创建日期**: 2025-12-28

---

## 1. Architecture Overview

### 1.1 数据流图

```
┌─────────────────────┐
│  Raw FEC Data       │
│  ─────────────────  │
│  • fec_raw_indiv    │  Individual Contributions
│  • fec_raw_committees│  Committee Info
│  • fec_raw_transfers│  PAC Transfers
└──────────┬──────────┘
           │
           ├─────────────────────────────────┐
           │                                 │
           ▼                                 ▼
┌──────────────────────┐         ┌───────────────────────────┐
│ Individual Path      │         │ PAC Transfer Path         │
│                      │         │                           │
│ 01-collect-fec-      │         │ 12-collect-pac-           │
│ donations.py         │         │ transfers.py              │
│                      │         │                           │
│ Uses:                │         │ Uses:                     │
│ • fec_raw_indiv      │         │ • fec_raw_committees      │
│ • fec_company_index  │         │ • fec_raw_transfers       │
│ • fec_company_name_  │         │ • (read-only index)       │
│   variants           │         │                           │
└──────────┬───────────┘         └─────────┬─────────────────┘
           │                               │
           ▼                               ▼
┌──────────────────────┐         ┌───────────────────────────┐
│ fec_company_party_   │         │ fec_company_pac_          │
│ summary              │         │ transfers_summary         │
│                      │         │                           │
│ Structure:           │         │ Structure:                │
│ {                    │         │ {                         │
│   ticker: "MSFT",    │         │   ticker: "MSFT",         │
│   party_totals: {    │         │   party_totals: {         │
│     DEM: {...},      │         │     DEM: {...},           │
│     REP: {...}       │         │     REP: {...}            │
│   },                 │         │   },                      │
│   total_usd: X,      │         │   total_usd: Y,           │
│   data_source:       │         │   data_source:            │
│     "individual"     │         │     "pac_transfers",      │
│ }                    │         │   committees: [...]       │
│                      │         │ }                         │
└──────────┬───────────┘         └─────────┬─────────────────┘
           │                               │
           └───────────┬───────────────────┘
                       │
                       ▼
              ┌────────────────────┐
              │ 13-build-          │
              │ consolidated.py    │
              │                    │
              │ Merges both sources│
              └────────┬───────────┘
                       │
                       ▼
              ┌────────────────────┐
              │ fec_company_       │
              │ consolidated       │
              │                    │
              │ Structure:         │
              │ {                  │
              │   ticker: "MSFT",  │
              │   party_totals: {  │
              │     DEM: {         │
              │       individual: X│
              │       pac: Y       │
              │       total: X+Y   │
              │     },             │
              │     REP: {...}     │
              │   },               │
              │   total_usd: X+Y,  │
              │   sources: [       │
              │     "individual",  │
              │     "pac_transfers"│
              │   ]                │
              │ }                  │
              └────────┬───────────┘
                       │
                       ▼
                  ┌─────────┐
                  │ Frontend│
                  │ API     │
                  └─────────┘
```

---

## 2. Collections 详细说明

### 2.1 fec_company_party_summary

**用途**: 存储个人捐款(individual contributions)数据
**数据来源**: `fec_raw_indiv` via `01-collect-fec-donations.py`
**更新频率**: 每月
**状态**: 现有collection，保持不变

**结构**:
```typescript
{
  ticker: string,                    // e.g., "MSFT"

  party_totals: {
    DEM: {
      total_amount: number,          // Total donations to Democrats
      count: number                  // Number of donations
    },
    REP: {
      total_amount: number,
      count: number
    },
    OTH: {
      total_amount: number,
      count: number
    }
  },

  total_usd: number,                 // Sum of all party totals
  data_source: "individual",         // Always "individual"
  last_updated: timestamp,

  // Metadata
  variants_found: string[],          // Company name variants found
  normalized_variants: string[]      // Normalized versions
}
```

**示例**:
```json
{
  "ticker": "MSFT",
  "party_totals": {
    "DEM": {
      "total_amount": 1500000,
      "count": 250
    },
    "REP": {
      "total_amount": 907500,
      "count": 150
    }
  },
  "total_usd": 2407500,
  "data_source": "individual",
  "last_updated": "2025-12-28T10:00:00Z"
}
```

---

### 2.2 fec_company_pac_transfers_summary (NEW)

**用途**: 存储企业PAC转账(PAC transfers)数据
**数据来源**: `fec_raw_committees` + `fec_raw_transfers` via `12-collect-pac-transfers.py`
**更新频率**: 每月
**状态**: 新collection

**结构**:
```typescript
{
  ticker: string,                    // e.g., "MSFT"
  company_name: string,              // e.g., "MICROSOFT CORPORATION"

  committees: [                      // All PACs linked to this company
    {
      committee_id: string,          // e.g., "C00227546"
      committee_name: string,        // e.g., "MICROSOFT CORP PAC"
      connected_org_name: string,    // From fec_raw_committees
      committee_type: string,        // "Q" for PAC

      transfer_totals: {             // Transfers from THIS committee
        DEM: {
          total_amount: number,
          count: number
        },
        REP: {...},
        OTH: {...}
      },
      transfer_total_usd: number,
      transfer_count: number
    }
  ],

  party_totals: {                    // Aggregate across ALL committees
    DEM: {
      total_amount: number,
      count: number
    },
    REP: {...},
    OTH: {...}
  },

  total_usd: number,                 // Sum of all committee transfers
  total_count: number,               // Total number of transfers
  data_source: "pac_transfers",      // Always "pac_transfers"
  last_updated: timestamp
}
```

**示例**:
```json
{
  "ticker": "MSFT",
  "company_name": "MICROSOFT CORPORATION",
  "committees": [
    {
      "committee_id": "C00227546",
      "committee_name": "MICROSOFT CORPORATION STAKEHOLDERS VOLUNTARY PAC",
      "connected_org_name": "MICROSOFT CORPORATION",
      "committee_type": "Q",
      "transfer_totals": {
        "DEM": {
          "total_amount": 87350000,
          "count": 270
        },
        "REP": {
          "total_amount": 87350000,
          "count": 270
        }
      },
      "transfer_total_usd": 174700000,
      "transfer_count": 540
    }
  ],
  "party_totals": {
    "DEM": {
      "total_amount": 87350000,
      "count": 270
    },
    "REP": {
      "total_amount": 87350000,
      "count": 270
    }
  },
  "total_usd": 174700000,
  "total_count": 540,
  "data_source": "pac_transfers",
  "last_updated": "2025-12-28T11:00:00Z"
}
```

---

### 2.3 fec_company_consolidated (NEW)

**用途**: 合并individual + PAC数据，供前端使用
**数据来源**: `fec_company_party_summary` + `fec_company_pac_transfers_summary` via `13-build-consolidated.py`
**更新频率**: 在individual和PAC数据更新后立即执行
**状态**: 新collection，替代前端直接读取`fec_company_party_summary`

**结构**:
```typescript
{
  ticker: string,                    // e.g., "MSFT"
  company_name: string,              // Display name

  party_totals: {
    DEM: {
      individual: number,            // From fec_company_party_summary
      pac: number,                   // From fec_company_pac_transfers_summary
      total: number,                 // individual + pac
      count: number                  // Total transaction count
    },
    REP: {...},
    OTH: {...}
  },

  total_usd: number,                 // Grand total (individual + PAC)

  sources: string[],                 // ["individual", "pac_transfers"]
  data_completeness: string,         // "complete" | "individual_only" | "pac_only"

  // Source breakdown
  individual_total: number,          // Total from individual donations
  pac_total: number,                 // Total from PAC transfers

  // Political lean
  political_lean_score: number,      // -100 (very REP) to +100 (very DEM)

  // Metadata
  last_updated: timestamp,
  committees: [...],                 // Copy from fec_company_pac_transfers_summary
}
```

**示例**:
```json
{
  "ticker": "MSFT",
  "company_name": "MICROSOFT CORPORATION",
  "party_totals": {
    "DEM": {
      "individual": 1500000,
      "pac": 87350000,
      "total": 88850000,
      "count": 520
    },
    "REP": {
      "individual": 907500,
      "pac": 87350000,
      "total": 88257500,
      "count": 420
    }
  },
  "total_usd": 177107500,
  "sources": ["individual", "pac_transfers"],
  "data_completeness": "complete",
  "individual_total": 2407500,
  "pac_total": 174700000,
  "political_lean_score": 0.3,
  "last_updated": "2025-12-28T12:00:00Z"
}
```

---

## 3. Scripts 说明

### 3.1 Production Scripts (`/scripts/fec-data/production/`)

#### `01-collect-fec-donations.py` (现有)
- **功能**: 收集个人捐款数据
- **输入**: `fec_raw_indiv`, `fec_company_index`, `fec_company_name_variants`
- **输出**: `fec_company_party_summary`
- **修改**: 无需修改

#### `12-collect-pac-transfers.py` (新增)
- **功能**: 收集企业PAC转账数据
- **输入**: `fec_raw_committees`, `fec_raw_transfers`
- **输出**: `fec_company_pac_transfers_summary`
- **特性**:
  - 只读模式访问`fec_company_index`
  - 不修改`fec_company_name_variants`
  - 新发现的variants保存到临时collection供人工审核
- **命令**:
  ```bash
  # 测试模式 (5个公司)
  python3 12-collect-pac-transfers.py --test

  # 生产模式 (全部SP500)
  python3 12-collect-pac-transfers.py --production
  ```

#### `13-build-consolidated.py` (新增)
- **功能**: 合并individual和PAC数据
- **输入**: `fec_company_party_summary`, `fec_company_pac_transfers_summary`
- **输出**: `fec_company_consolidated`
- **逻辑**:
  1. 遍历所有tickers (from `fec_company_index`)
  2. 读取individual数据 (如果有)
  3. 读取PAC数据 (如果有)
  4. 按party合并金额
  5. 计算political lean score
  6. 写入consolidated collection
- **命令**:
  ```bash
  # 测试模式
  python3 13-build-consolidated.py --test

  # 生产模式
  python3 13-build-consolidated.py --production
  ```

---

### 3.2 Verification Scripts (`/scripts/fec-data/verification/`)

#### `verify-10-pac-transfers.py` (新增)
- **功能**: 验证PAC transfers数据收集
- **测试公司**: MSFT, META, JPM, V, KO (已知有PAC的公司)
- **检查项**:
  - 每个公司是否找到委员会
  - 委员会ID是否正确
  - Transfer金额是否合理
  - 数据结构是否完整

#### `verify-11-consolidated.py` (新增)
- **功能**: 验证consolidated数据合并
- **检查项**:
  - Individual + PAC = Total
  - 所有tickers都有consolidated数据
  - 数据完整性标记正确

---

### 3.3 Reports Scripts (`/scripts/fec-data/reports/`)

#### `02-pac-enhancement-report.json` (新增)
- **功能**: 生成PAC数据增强效果报告
- **内容**:
  - 数据覆盖率提升
  - 捐款金额增长
  - 新增公司列表
  - 增强公司列表

---

## 4. Index Management (极其谨慎)

### 4.1 原则

**严格只读**:
- `12-collect-pac-transfers.py` 和 `13-build-consolidated.py` **只读**访问现有index
- **不主动修改** `fec_company_index` 或 `fec_company_name_variants`

### 4.2 新公司发现流程

当PAC数据发现了原本没有individual数据的公司时:

1. **Discovery**: `12-collect-pac-transfers.py` 保存数据到 `fec_company_pac_transfers_summary`
2. **Manual Review**: 人工审核 `fec_pac_discovered_variants` collection
3. **Manual Update**: 如果确认正确，手动添加到 `fec_company_index`:
   ```python
   # 手动执行
   db.collection('fec_company_index').document('microsoft corporation').set({
       'ticker': 'MSFT',
       'source': 'pac_transfers_manual_verified',
       'added_at': firestore.SERVER_TIMESTAMP
   })
   ```
4. **Rebuild**: 重新运行 `13-build-consolidated.py`

### 4.3 临时Collection

#### `fec_pac_discovered_variants`
- **用途**: 存储PAC数据发现的新company name variants
- **结构**:
  ```typescript
  {
    ticker: string,
    company_name: string,              // From TICKER_TO_COMPANY_NAME mapping
    committee_name: string,            // From fec_raw_committees
    connected_org_name: string,        // From fec_raw_committees
    confidence: number,                // 0.0 - 1.0
    needs_review: boolean,
    discovered_at: timestamp
  }
  ```
- **清理**: 定期清空 (审核完成后)

---

## 5. Frontend Integration

### 5.1 API 修改

**现有**:
```typescript
// OLD: 直接读取 fec_company_party_summary
const fecData = await db.collection('fec_company_party_summary').doc(ticker).get();
```

**新架构**:
```typescript
// NEW: 读取 fec_company_consolidated
const fecData = await db.collection('fec_company_consolidated').doc(ticker).get();

// 数据结构包含所有信息
const data = fecData.data();
console.log(data.party_totals.DEM.individual);  // Individual donations
console.log(data.party_totals.DEM.pac);         // PAC transfers
console.log(data.party_totals.DEM.total);       // Combined total
console.log(data.sources);                       // ["individual", "pac_transfers"]
```

### 5.2 UI 展示

可以在前端展示数据来源:

```typescript
if (data.sources.includes('individual') && data.sources.includes('pac_transfers')) {
  // 显示 "Data from individual donations and PAC transfers"
  showBreakdown({
    individual: data.individual_total,
    pac: data.pac_total
  });
} else if (data.sources.includes('individual')) {
  // 显示 "Data from individual donations only"
} else if (data.sources.includes('pac_transfers')) {
  // 显示 "Data from PAC transfers only"
}
```

---

## 6. Execution Plan

### Phase 1: Implementation (Week 1)
- [x] 创建文档 `30_fec_consolidated_architecture.md`
- [ ] 实现 `12-collect-pac-transfers.py`
- [ ] 实现 `13-build-consolidated.py`
- [ ] 实现 `verify-10-pac-transfers.py`
- [ ] 实现 `verify-11-consolidated.py`

### Phase 2: Testing (Week 1)
- [ ] 测试5个公司 (MSFT, META, JPM, V, KO)
- [ ] 验证数据正确性
- [ ] 检查index未被污染
- [ ] 生成测试报告

### Phase 3: Production Rollout (Week 2)
- [ ] 运行全部SP500公司
- [ ] 验证consolidated数据
- [ ] 更新frontend API调用
- [ ] 部署到production

---

## 7. Data Integrity Protection

### 7.1 Safeguards

1. **Read-Only Index Access**:
   - Scripts只读访问`fec_company_index`
   - 使用查询而非写操作

2. **Discovery Logging**:
   - 新发现的variants写入临时collection
   - 不自动添加到production index

3. **Manual Verification**:
   - 所有新variants需人工审核
   - 使用专门的审核脚本

4. **Backup Before Production**:
   ```bash
   # Backup collections before running production scripts
   gcloud firestore export gs://stanseproject-backup/fec-pre-pac-rollout
   ```

### 7.2 Rollback Plan

如果发现问题:
1. 停止所有scripts执行
2. 从backup恢复 (如果index被污染)
3. 删除 `fec_company_pac_transfers_summary` 和 `fec_company_consolidated`
4. 修复bugs
5. 重新测试

---

## 8. Success Metrics

### 8.1 Data Coverage
- **Before**: 39/84 companies (46.4%) have FEC data
- **After**: 43/84 companies (51.2%) have FEC data
- **Target**: +4 companies with PAC data only

### 8.2 Data Completeness
- **Before**: $4.18B total (individual only)
- **After**: $7.59B total (individual + PAC)
- **Target**: +81.6% donation amount increase

### 8.3 Data Integrity
- **Zero** unwanted modifications to `fec_company_index`
- **Zero** unwanted modifications to `fec_company_name_variants`
- **100%** of new companies manually verified

---

## 9. Related Documentation

- [19_fec_data_schema.md](19_fec_data_schema.md) - FEC data structure reference
- [20_fec_data_system.md](20_fec_data_system.md) - FEC system overview
- [21_fec_firebase_architecture.md](21_fec_firebase_architecture.md) - Firebase collections
- [29_fec_transfer_linkage_enhancement.md](29_fec_transfer_linkage_enhancement.md) - Original enhancement plan

---

**Document Version**: 1.0
**Last Updated**: 2025-12-28
**Author**: AI Assistant
**Reviewed By**: [Pending]
