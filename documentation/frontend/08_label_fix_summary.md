# ✅ Persona Label 一致性修复完成

**日期**: 2026-01-02
**状态**: 已修复，等待测试

---

## 🐛 发现的问题

### 问题描述
- **显示的 label**: "Chinese-American Progressive Globalist" (AI 自由生成)
- **实际的 stanceType**: `capitalist-globalist` (硬编码逻辑计算)
- **结果**: Label 与实际使用的 stanceType 不一致，可能让用户困惑

### 根本原因

AI 在 onboarding 时自由生成 `personaType`，没有遵循硬编码的 `getStanceType()` 映射逻辑。

---

## 🔧 修复方案

### 修改的文件

**`services/agents/stanceAgent.ts`** - `calculateCoordinates()` 函数

**修改前**:
```typescript
const personaType = result.personaType || "Political Observer"; // AI 自由生成
const fullLabel = nationalityPrefix ? `${nationalityPrefix} ${personaType}` : personaType;
```

**修改后**:
```typescript
// 1. 使用 getStanceType() 计算 canonical stanceType
const { getStanceType } = await import('../../data/sp500Companies');
const actualStanceType = getStanceType(economic, social, diplomatic);

// 2. 将 stanceType 转换为友好标签
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

// 3. 组合 nationality prefix + canonical label
const personaType = stanceTypeLabels[actualStanceType] || "Political Observer";
const fullLabel = nationalityPrefix ? `${nationalityPrefix} ${personaType}` : personaType;
```

### 映射逻辑

| Coordinates | StanceType | Label |
|-------------|------------|-------|
| econ: 25, social: 70, diplo: 50 | `capitalist-globalist` | "Chinese American **Capitalist** Globalist" |
| econ: -25, social: 70, diplo: 50 | `progressive-globalist` | "Chinese American **Progressive** Globalist" |
| econ: 25, social: -70, diplo: 50 | `conservative-globalist` | "Chinese American **Conservative** Globalist" |

---

## 🧪 测试步骤

### 新用户测试（推荐）

1. **使用隐身窗口**打开 http://localhost:3002
2. 完成 onboarding，设置坐标
3. 查看生成的 persona label
4. 打开控制台，搜索 `[Enhanced Rankings] Getting ranking for`
5. **验证**: label 中的 persona 类型与控制台的 stanceType 一致

**示例验证**:
```
显示: "Chinese American Capitalist Globalist"
控制台: "[Enhanced Rankings] Getting ranking for capitalist-globalist"
✅ 一致！
```

### 现有用户修复

**选项 1: 手动修复（仅测试账号）**
1. 退出登录
2. 重新注册新账号
3. 完成 onboarding

**选项 2: 批量修复脚本（所有用户）**
```bash
npx ts-node scripts/maintenance/fix-user-labels.ts
```

这个脚本会:
- 读取所有用户的 coordinates
- 重新计算正确的 label
- 更新 Firebase 中的用户配置

---

## ✅ 修复效果

### Before (有问题)
```
Coordinates: economic: 25, social: 70, diplomatic: 50
Label: "Chinese American Progressive Globalist" ❌
StanceType: capitalist-globalist
→ 不一致，用户困惑
```

### After (已修复)
```
Coordinates: economic: 25, social: 70, diplomatic: 50
Label: "Chinese American Capitalist Globalist" ✅
StanceType: capitalist-globalist
→ 完全一致！
```

---

## 📋 部署前检查清单

- [ ] 新用户 onboarding 测试通过
- [ ] Label 与 stanceType 一致
- [ ] Company rankings 正确显示
- [ ] Market alignment 正确更新
- [ ] 无控制台错误
- [ ] (可选) 运行批量修复脚本更新现有用户

---

## 🚀 部署流程

测试通过后执行:

```bash
# 1. 构建
npm run build

# 2. 提交
git add .
git commit -m "fix: Ensure persona label matches canonical stanceType

- Use getStanceType() to calculate canonical stanceType
- Map stanceType to friendly label (e.g., 'Capitalist Globalist')
- Ensure label consistency with company ranking logic
- Add maintenance script to fix existing user labels"

# 3. 部署
gcloud run deploy stanse --source . --region us-central1 --allow-unauthenticated
```

---

**维护者**: Claude Code
**最后更新**: 2026-01-02 14:15 PT
