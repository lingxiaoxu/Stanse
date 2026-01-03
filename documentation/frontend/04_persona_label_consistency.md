# Persona Label 一致性保证机制

**Created**: 2026-01-02
**Status**: ✅ 已实现

---

## 🎯 问题背景

### 发现的问题

在集成 `enhanced_company_rankings` 时发现：
- **显示的 label**: "Chinese-American Progressive Globalist" (AI 生成)
- **实际使用的 stanceType**: `capitalist-globalist` (硬编码逻辑)
- **结果**: 用户看到的 persona 与系统实际使用的不一致 ❌

### 根本原因

1. **AI 自由生成**: onboarding 时，AI 根据坐标自由生成 `personaType`
2. **硬编码映射**: company ranking 使用 `getStanceType()` 硬编码逻辑
3. **双重标准**: 两个不同的逻辑导致不一致

---

## ✅ 解决方案

### 核心原则

**单一真实来源 (Single Source of Truth)**: `getStanceType()` 函数

所有 persona 相关的逻辑都必须使用这个函数，包括：
- Onboarding 时生成 label
- Company ranking 计算
- News personalization
- Market alignment

### 实现方案

#### 1. 修改 Onboarding Label 生成

**文件**: `services/agents/stanceAgent.ts`

**修改前**:
```typescript
// AI 自由生成 personaType
const personaType = result.personaType || "Political Observer";
const fullLabel = nationalityPrefix
  ? `${nationalityPrefix} ${personaType}`
  : personaType;
```

**修改后**:
```typescript
// 1. 使用 getStanceType() 计算 canonical stanceType
const { getStanceType } = await import('../../data/sp500Companies');
const actualStanceType = getStanceType(economic, social, diplomatic);

// 2. 将 stanceType 映射为友好标签
const stanceTypeLabels: Record<string, string> = {
  'progressive-globalist': 'Progressive Globalist',
  'progressive-nationalist': 'Progressive Nationalist',
  'socialist-libertarian': 'Socialist Libertarian',
  'socialist-nationalist': 'Socialist Nationalist',
  'capitalist-globalist': 'Capitalist Globalist',
  'capitalist-nationalist': 'Capitalist Nationalist',
  'conservative-globalist': 'Conservative Globalist',
  'conservative-nationalist': 'Conservative Nationalist'
};

// 3. 生成标准化的 label
const personaType = stanceTypeLabels[actualStanceType] || "Political Observer";
const fullLabel = nationalityPrefix
  ? `${nationalityPrefix} ${personaType}`
  : personaType;
```

#### 2. StanceType 映射逻辑

**文件**: `data/sp500Companies.ts`

```typescript
export const getStanceType = (
  economic: number,
  social: number,
  diplomatic: number
): StanceType => {
  const isLeftEcon = economic < 0;      // < 0 = Left/Progressive/Socialist
  const isLibSocial = social > 0;       // > 0 = Liberal/Progressive
  const isGlobalDiplo = diplomatic > 0; // > 0 = Globalist

  if (isLeftEcon && isLibSocial && isGlobalDiplo) return 'progressive-globalist';
  if (isLeftEcon && isLibSocial && !isGlobalDiplo) return 'progressive-nationalist';
  if (isLeftEcon && !isLibSocial && isGlobalDiplo) return 'socialist-libertarian';
  if (isLeftEcon && !isLibSocial && !isGlobalDiplo) return 'socialist-nationalist';
  if (!isLeftEcon && isLibSocial && isGlobalDiplo) return 'capitalist-globalist';
  if (!isLeftEcon && isLibSocial && !isGlobalDiplo) return 'capitalist-nationalist';
  if (!isLeftEcon && !isLibSocial && isGlobalDiplo) return 'conservative-globalist';
  return 'conservative-nationalist';
};
```

#### 3. Label 格式规范

**格式**: `[Nationality Prefix] [StanceType Label]`

**示例**:
- 坐标 (25, 70, 55) → `capitalist-globalist` → "Chinese-American **Capitalist** Globalist"
- 坐标 (-25, 70, 55) → `progressive-globalist` → "Chinese-American **Progressive** Globalist"
- 坐标 (25, -70, 55) → `conservative-globalist` → "Chinese-American **Conservative** Globalist"

---

## 🔒 一致性保证机制

### 数据流

```
┌─────────────────────────────────────────────────────────┐
│ Onboarding (stanceAgent.ts)                            │
│                                                         │
│ 1. AI 计算坐标 (economic, social, diplomatic)          │
│ 2. getStanceType(坐标) → canonical stanceType          │
│ 3. stanceTypeLabels[stanceType] → 友好标签             │
│ 4. nationality + label → 完整 label                    │
│ 5. 保存到 Firebase                                     │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│ Firebase: users/{userId}                                │
│                                                         │
│ coordinates: {                                          │
│   economic: 25,                                         │
│   social: 70,                                           │
│   diplomatic: 55,                                       │
│   label: "Chinese-American Capitalist Globalist" ✅     │
│ }                                                       │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│ Company Ranking (enhancedCompanyRankingService.ts)     │
│                                                         │
│ 1. 读取 coordinates (economic, social, diplomatic)      │
│ 2. getStanceType(坐标) → "capitalist-globalist"        │
│ 3. 查询 enhanced_company_rankings/capitalist-globalist │
│ 4. 返回排名数据                                         │
└─────────────────────────────────────────────────────────┘

结果: Label 显示 "Capitalist" ✅
      使用 stanceType "capitalist-globalist" ✅
      完全一致！
```

### 代码级保证

**所有使用 persona 的地方都通过 `getStanceType()` 计算**:

1. **Onboarding** - `stanceAgent.ts:244`
   ```typescript
   const actualStanceType = getStanceType(economic, social, diplomatic);
   ```

2. **Company Rankings** - `enhancedCompanyRankingService.ts:153`
   ```typescript
   const { getStanceType } = await import('../data/sp500Companies');
   const stanceType = getStanceType(economic, social, diplomatic);
   ```

3. **News Personalization** - 使用 coordinates，间接使用 stanceType

4. **Market Alignment** - 从 company rankings 接收，间接使用 stanceType

---

## 🛡️ 防止未来不一致

### 规则

1. **禁止 AI 自由生成 stanceType**
   - AI 只计算坐标值 (economic, social, diplomatic)
   - StanceType 必须通过 `getStanceType()` 计算

2. **禁止手动修改 label 映射**
   - 所有 label 必须使用 `stanceTypeLabels` 字典
   - 保持与 `getStanceType()` 逻辑同步

3. **代码审查重点**
   - 任何新增的 persona 相关代码必须使用 `getStanceType()`
   - 避免绕过标准映射逻辑

### 维护脚本

**检查现有用户**: `scripts/maintenance/check-user-labels.ts`
```bash
npx tsx scripts/maintenance/check-user-labels.ts
```

**修复不一致**: `scripts/maintenance/fix-user-labels.ts`
```bash
npx tsx scripts/maintenance/fix-user-labels.ts
```

---

## 📊 测试验证

### 新用户测试

1. 隐身窗口打开 http://localhost:3002
2. 注册新账号
3. 完成 onboarding:
   - Economic: 30 → Capitalist
   - Social: 30 → Liberal/Progressive
   - Diplomatic: 30 → Globalist
4. 验证:
   - 显示: "Capitalist Globalist" ✅
   - 控制台: "capitalist-globalist" ✅

### 现有用户验证

1. 运行检查脚本
2. 运行修复脚本
3. 刷新应用
4. 验证 label 已更新

---

## 🔍 Troubleshooting

### 问题: 新用户 label 仍然不一致

**检查**:
- `stanceAgent.ts` 是否正确导入 `getStanceType`
- `stanceTypeLabels` 映射是否完整
- 浏览器是否缓存了旧代码

**解决**:
- 清除浏览器缓存
- 重启开发服务器
- 验证构建输出

### 问题: 修复脚本无法运行

**检查**:
- Firebase credentials 是否配置
- `firebase-admin` 是否安装
- TypeScript 是否正确编译

**解决**:
```bash
npm install firebase-admin
npx tsx scripts/maintenance/check-user-labels.ts
```

---

## 📝 相关文档

- **Enhanced Rankings**: `documentation/frontend/01_enhanced_rankings_integration.md`
- **StanceType 定义**: `data/sp500Companies.ts`
- **Label 生成**: `services/agents/stanceAgent.ts`
- **修复脚本**: `scripts/maintenance/fix-user-labels.ts`

---

**维护者**: Claude Code
**最后更新**: 2026-01-02 14:30 PT
