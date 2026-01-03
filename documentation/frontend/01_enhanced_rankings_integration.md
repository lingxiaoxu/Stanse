# Enhanced Company Rankings Integration

**Created**: 2026-01-02
**Status**: ✅ Implemented (Dev Testing)

## 概述

前端已完全迁移到新的 `enhanced_company_rankings` collection，实现 Python 预计算排名（每12小时更新）与 TypeScript 实时计算的无缝集成。

## 架构设计

### 数据流

```
用户请求排名
    ↓
enhancedCompanyRankingService.ts
    ↓
尝试读取 enhanced_company_rankings/{stanceType}
    ↓
┌───────────────┴─────────────────┐
│                                 │
存在且未过期 (<12h)            不存在或已过期
│                                 │
返回预计算结果                   触发实时计算
                                  ↓
                     companyRankingService.ts
                                  ↓
                     保存到 enhanced_company_rankings
                                  ↓
                            返回新计算结果
```

### Collection 结构

#### 主文档
**路径**: `enhanced_company_rankings/{stanceType}`

```typescript
{
  stanceType: "capitalist-globalist",
  version: "3.0",
  updatedAt: "2026-01-02T21:02:44.068818Z",
  expiresAt: "2026-01-03T09:02:44.068818Z",
  supportCompanies: [
    {
      symbol: "ADBE",
      name: "Adobe",
      sector: "Technology",
      score: 79,
      reasoning: "[AI-Data] Numerical=71.2, LLM=88.0 | ..."
    }
  ],
  opposeCompanies: [...]
}
```

#### 历史记录
**路径**: `enhanced_company_rankings/{stanceType}/history/{YYYYmmdd_HHMMSS}`
- 每次更新保存快照
- 用于追踪排名变化趋势

## 核心服务

### 1. enhancedCompanyRankingService.ts

**主要功能**:
- 从 Firebase 读取 Python 生成的排名
- 验证数据版本和过期时间
- Fallback 到 TypeScript 实时计算

**关键 API**:

```typescript
// 获取排名（自动处理缓存/fallback）
getEnhancedCompanyRanking(stanceType, forceRefresh?)

// 基于用户坐标获取排名
getEnhancedCompanyRankingsForUser(economic, social, diplomatic, forceRefresh?)

// 检查缓存有效性
isEnhancedRankingValid(stanceType)

// 获取排名年龄（小时）
getEnhancedRankingAge(stanceType)

// 获取历史记录
getEnhancedRankingHistory(stanceType, limit?)
```

### 2. companyRankingService.ts

**保持不变**，作为 fallback 计算引擎：
- `rankCompaniesForStanceEnhanced()` - AI-Data + LLM 综合评分
- `savePersonaRankingToFirebase()` - 保存到 enhanced_company_rankings

## 前端组件更新

### ValuesCompanyRanking.tsx

**变更**:
```diff
- import { getCompanyRankingsForUser } from '../../services/companyRankingService';
+ import { getEnhancedCompanyRankingsForUser } from '../../services/enhancedCompanyRankingService';

- const result = await getCompanyRankingsForUser(economic, social, diplomatic);
+ const result = await getEnhancedCompanyRankingsForUser(economic, social, diplomatic);
```

## Collection 迁移

### 旧系统 (已废弃)
- Collection: `company_rankings`
- 仅 TypeScript 计算
- 无历史记录

### 新系统 (已启用)
- Collection: `enhanced_company_rankings`
- Python (每12h) + TypeScript (fallback)
- 带历史记录子集合
- 版本 3.0

**注意**: `company_rankings` collection 保留但不再使用，可视为已弃用。

## Python 集成

### 定时任务
- **频率**: 每12小时 (6 AM & 6 PM PT)
- **脚本**: `scripts/company-ranking/05-generate-enhanced-rankings.py`
- **Cloud Run Job**: `enhanced-rankings-generator`
- **Cloud Scheduler**: `enhanced-rankings-every-12h`

### 数据生成流程
1. 处理 84 家 S&P 500 公司
2. 为 8 种 persona 生成排名
3. 保存到 `enhanced_company_rankings/{stanceType}`
4. 保存历史快照到 `history/` 子集合
5. 发送邮件通知完成

## 测试

### 开发测试页面
**文件**: `test-enhanced-rankings.html`

**功能**:
- 选择任意 persona
- 测试缓存读取
- 强制刷新测试
- 检查缓存有效性
- 查看排名年龄
- 实时日志查看

**访问**:
```bash
npm run dev
# 打开 http://localhost:3000/test-enhanced-rankings.html
```

### 测试场景

#### 场景 1: 读取 Python 预计算排名
1. 选择 persona: `capitalist-globalist`
2. 点击 "Fetch Ranking (Use Cache)"
3. **预期**: 显示 Python 生成的排名，metadata 显示 "🐍 Python-generated"

#### 场景 2: Fallback 到 TypeScript 计算
1. 选择一个未生成的 persona（或过期的）
2. 点击 "Fetch Ranking (Use Cache)"
3. **预期**: 触发实时计算，metadata 显示 "📝 TypeScript-generated"

#### 场景 3: 强制刷新
1. 点击 "Force Refresh (Skip Cache)"
2. **预期**: 跳过缓存，直接实时计算

## 部署检查清单

### 开发环境测试 ✅
- [x] 构建成功无错误
- [ ] 测试页面验证缓存读取
- [ ] 测试页面验证 fallback 计算
- [ ] 主应用 VALUES COMPANY RANKING 显示正常
- [ ] 强制刷新功能正常
- [ ] 检查 Firebase 写入权限

### 生产环境部署 ⏸️ (等待确认)
- [ ] 确认所有测试通过
- [ ] 备份当前生产代码
- [ ] 部署到 Cloud Run
- [ ] 验证生产环境读取
- [ ] 监控错误日志
- [ ] 验证 VALUES MARKET ALIGNMENT 更新

## VALUES MARKET ALIGNMENT 影响

新的 enhanced rankings 系统会自动影响 VALUES MARKET ALIGNMENT：
- 排名更新 → 前端 `onRankingsChange` 回调触发
- 父组件接收新排名数据
- Market alignment 价格自动重新计算
- 无需额外代码修改

## 故障排查

### 问题：无法读取排名
**检查**:
1. Firebase 权限配置
2. Collection 名称拼写
3. StanceType 是否正确
4. 网络连接

### 问题：总是触发实时计算
**检查**:
1. Python 定时任务是否运行
2. 排名是否过期 (>12h)
3. 版本号是否为 "3.0"
4. Firebase 读取权限

### 问题：实时计算失败
**检查**:
1. Gemini API key 配置
2. Firebase 数据源 (FEC/ESG/Executive/News)
3. 控制台错误日志
4. 网络超时设置

## 性能优化

### 缓存策略
- Python 预计算: 12小时有效期
- TypeScript fallback: 立即保存到 Firebase
- 避免重复计算同一 persona

### 加载优化
- 优先使用预计算结果（毫秒级）
- Fallback 计算仅在必要时触发
- 历史记录按需加载

## 未来增强

1. **排名对比功能**: 使用 history 子集合实现趋势分析
2. **智能预加载**: 预测用户可能切换的 persona
3. **增量更新**: 仅更新变化的公司
4. **实时通知**: 排名重大变化时推送通知

## 相关文档

- Python 脚本: `documentation/backend/31_enhanced_company_ranking_system.md`
- 数据结构: `enhanced_company_rankings` collection schema
- API 文档: `services/enhancedCompanyRankingService.ts` JSDoc

---

**维护者**: Claude Code
**最后更新**: 2026-01-02
