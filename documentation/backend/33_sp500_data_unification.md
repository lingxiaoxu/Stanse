# SP500 数据统一方案

**Created**: 2026-01-02
**Status**: 📋 规划中

---

## 🎯 目标

将所有 SP500 股票列表和 sector 映射统一到单一数据源，避免重复定义和不一致。

---

## 🔍 当前问题

### 发现的重复定义

#### TypeScript
**位置**: `data/sp500Companies.ts`
- `SP500_COMPANIES` 数组: **85 个公司**
- 每个公司包含: `symbol`, `name`, `sector`
- 额外公司: `CCI`, `SHW`

#### Python
**位置**: 多个脚本文件中
- `SP500_TICKERS` 列表: **84 个 ticker**
- `TICKER_TO_SECTOR` 字典: sector 映射

**重复文件**:
1. `scripts/company-ranking/05-generate-enhanced-rankings.py` (106-154行)
2. `scripts/company-ranking/01-collect-fec-donations.py` (37行)
3. `scripts/company-ranking/02-collect-esg-scores.py` (42行)
4. `scripts/company-ranking/03-collect-polygon-news.py` (39行)
5. `scripts/company-ranking/04-analyze-executive-statements.py` (39行)
6. `scripts/company-ranking/00-orchestrator.py` (48行)

### 问题

1. **数量不一致**: TypeScript 85 vs Python 84
2. **多处重复**: 至少 6 个 Python 文件重复定义
3. **难以维护**: 扩充股票列表需要修改多个文件
4. **容易出错**: 手动同步容易遗漏

---

## ✅ 统一方案

### 架构设计

```
data/sp500Data.json (单一真实来源)
        ↓
    ┌───┴───┐
    │       │
TypeScript  Python
    │       │
    ↓       ↓
导入使用  导入使用
```

### 文件结构

```
data/
├── sp500Data.json           # 主数据文件 (JSON)
├── sp500Companies.ts        # TypeScript 导入器
├── sp500Companies.py        # Python 导入器 (新)
└── README.md               # 数据说明文档
```

---

## 📁 实现细节

### 1. 主数据文件

**文件**: `data/sp500Data.json`

```json
{
  "companies": [
    {"symbol": "AAPL", "name": "Apple Inc", "sector": "Technology"},
    {"symbol": "MSFT", "name": "Microsoft Corp", "sector": "Technology"},
    ...
  ],
  "version": "1.0.0",
  "lastUpdated": "2026-01-02",
  "totalCount": 84
}
```

### 2. TypeScript 导入器

**文件**: `data/sp500Companies.ts`

```typescript
import sp500Data from './sp500Data.json';

export interface SP500Company {
  symbol: string;
  name: string;
  sector: string;
}

// Load from JSON
export const SP500_COMPANIES: SP500Company[] = sp500Data.companies;

// Helper: Get sector by ticker
export const getSectorByTicker = (ticker: string): string | null => {
  const company = SP500_COMPANIES.find(c => c.symbol === ticker);
  return company?.sector || null;
};

// Helper: Get company by ticker
export const getCompanyByTicker = (ticker: string): SP500Company | null => {
  return SP500_COMPANIES.find(c => c.symbol === ticker) || null;
};
```

### 3. Python 导入器

**文件**: `data/sp500Companies.py`

```python
#!/usr/bin/env python3
"""
SP500 Companies Data - Single Source of Truth
Loads from sp500Data.json to ensure consistency with TypeScript
"""

import json
import os
from typing import List, Dict, Optional

# Load data from JSON
_data_file = os.path.join(os.path.dirname(__file__), 'sp500Data.json')

with open(_data_file, 'r') as f:
    _sp500_data = json.load(f)

# Export list of tickers
SP500_TICKERS: List[str] = [c['symbol'] for c in _sp500_data['companies']]

# Export ticker to sector mapping
TICKER_TO_SECTOR: Dict[str, str] = {
    c['symbol']: c['sector']
    for c in _sp500_data['companies']
}

# Export full company data
SP500_COMPANIES: List[Dict[str, str]] = _sp500_data['companies']

def get_company_sector(ticker: str) -> str:
    """获取公司的sector"""
    return TICKER_TO_SECTOR.get(ticker, 'Unknown')

def get_company_name(ticker: str) -> Optional[str]:
    """获取公司名称"""
    for company in SP500_COMPANIES:
        if company['symbol'] == ticker:
            return company['name']
    return None

def get_company_info(ticker: str) -> Optional[Dict[str, str]]:
    """获取完整公司信息"""
    for company in SP500_COMPANIES:
        if company['symbol'] == ticker:
            return company
    return None

# Metadata
__version__ = _sp500_data['version']
__total_count__ = len(SP500_TICKERS)
__last_updated__ = _sp500_data['lastUpdated']
```

---

## 🔄 迁移计划

### Phase 1: 创建统一数据源 ✅
- [x] 创建 `sp500Data.json`
- [ ] 决定最终的公司列表（84 或 86 个）
- [ ] 验证所有 sector 映射正确

### Phase 2: 更新 TypeScript
- [ ] 修改 `data/sp500Companies.ts` 从 JSON 导入
- [ ] 移除硬编码的公司列表
- [ ] 添加 helper 函数
- [ ] 测试前端功能

### Phase 3: 更新 Python
- [ ] 创建 `data/sp500Companies.py`
- [ ] 更新所有 Python 脚本导入:
  - [ ] `05-generate-enhanced-rankings.py`
  - [ ] `01-collect-fec-donations.py`
  - [ ] `02-collect-esg-scores.py`
  - [ ] `03-collect-polygon-news.py`
  - [ ] `04-analyze-executive-statements.py`
  - [ ] `00-orchestrator.py`
- [ ] 测试所有脚本

### Phase 4: 清理和验证
- [ ] 删除所有旧的硬编码定义
- [ ] 运行所有测试
- [ ] 更新文档

---

## 📊 公司列表决策

### 选项 A: 使用 84 个（Python 当前列表）
- ✅ 与 Python 已有数据一致
- ✅ 移除 TypeScript 的 CCI 和 SHW
- ❌ 需要验证 CCI 和 SHW 是否有数据

### 选项 B: 使用 86 个（TypeScript 当前列表）
- ✅ 保留所有公司
- ✅ 不需要删除数据
- ❌ 需要为 CCI 和 SHW 收集数据

### 选项 C: 重新评估（推荐）
- 检查 Firebase 中哪些公司有实际数据
- 保留有数据的公司
- 移除无数据的公司

---

## 🛠️ Helper 函数设计

### TypeScript

```typescript
// 获取所有 tickers
export const getAllTickers = (): string[] => {
  return SP500_COMPANIES.map(c => c.symbol);
};

// 获取所有 sectors
export const getAllSectors = (): string[] => {
  return Array.from(new Set(SP500_COMPANIES.map(c => c.sector)));
};

// 按 sector 分组
export const getCompaniesBySector = (sector: string): SP500Company[] => {
  return SP500_COMPANIES.filter(c => c.sector === sector);
};

// 验证 ticker 存在
export const isValidTicker = (ticker: string): boolean => {
  return SP500_COMPANIES.some(c => c.symbol === ticker);
};
```

### Python

```python
def get_all_tickers() -> List[str]:
    """获取所有 ticker 列表"""
    return SP500_TICKERS.copy()

def get_all_sectors() -> List[str]:
    """获取所有 sector 列表"""
    return list(set(TICKER_TO_SECTOR.values()))

def get_companies_by_sector(sector: str) -> List[Dict[str, str]]:
    """获取指定 sector 的所有公司"""
    return [c for c in SP500_COMPANIES if c['sector'] == sector]

def is_valid_ticker(ticker: str) -> bool:
    """验证 ticker 是否存在"""
    return ticker in TICKER_TO_SECTOR
```

---

## 🚀 部署策略

### 方案 1: 分阶段部署（推荐）

1. **阶段 1**: 创建统一数据源
   - 创建 JSON 文件
   - 创建 Python 导入器
   - 不修改现有代码

2. **阶段 2**: 更新 TypeScript
   - 修改导入方式
   - 测试前端
   - 部署前端

3. **阶段 3**: 更新 Python
   - 批量替换导入
   - 测试所有脚本
   - 部署 Cloud Run Jobs

### 方案 2: 一次性迁移

- 同时更新所有文件
- 全面测试
- 一次部署

**推荐**: 方案 1，风险更低

---

## 📋 待决定的问题

1. **最终公司数量**:  84 or 86?
   - 需要检查 CCI 和 SHW 的数据完整性

2. **迁移时机**:
   - 现在立即迁移？
   - 下次大版本更新？

3. **向后兼容**:
   - 是否保留旧的导入方式作为 deprecated？

---

## 📝 相关文档

- **当前数据**: `data/sp500Companies.ts`
- **Python 脚本**: `scripts/company-ranking/05-generate-enhanced-rankings.py`
- **迁移脚本**: (待创建)

---

**建议**: 在当前的 enhanced rankings 部署后，作为下一个独立任务进行统一。

**维护者**: Claude Code
**最后更新**: 2026-01-02
