# 🚀 部署前最终检查清单

**日期**: 2026-01-02
**版本**: Enhanced Rankings + Label Consistency Fix

---

## ✅ 已完成的工作

### 1. Enhanced Company Rankings 集成
- [x] 创建 `enhancedCompanyRankingService.ts`
- [x] 更新 `ValuesCompanyRanking.tsx` 组件
- [x] 优先读取 Python 预计算排名
- [x] Fallback 到 TypeScript 实时计算
- [x] 统一使用 `enhanced_company_rankings` collection
- [x] 测试页面验证通过

### 2. Persona Label 一致性修复
- [x] 修改 `stanceAgent.ts` 使用 `getStanceType()`
- [x] 创建检查脚本 `check-user-labels.ts`
- [x] 创建修复脚本 `fix-user-labels.ts`
- [x] 修复所有 5 个现有用户的 label
- [x] 验证新用户 onboarding 生成正确 label

---

## 🧪 部署前验证

### 必须通过的测试

#### 测试 1: 刷新主应用验证 label
- [ ] 刷新 http://localhost:3002
- [ ] 查看显示的 persona label
- [ ] **预期**: "Chinese-American **Capitalist** Globalist"
- [ ] 控制台显示: `[Enhanced Rankings] Getting ranking for capitalist-globalist`

#### 测试 2: Company Rankings 显示
- [ ] VALUES COMPANY RANKING 组件正常显示
- [ ] Support 公司列表正确 (CSCO, PLD, CRM, AMD, ADBE)
- [ ] Oppose 公司列表正确
- [ ] Sector 字段全部填充（无 null）

#### 测试 3: Market Alignment 同步
- [ ] VALUES MARKET ALIGNMENT 显示价格
- [ ] 股票列表包含 ranking 中的公司
- [ ] 价格合理（非 NaN 或 0）

#### 测试 4: 刷新功能
- [ ] 点击刷新按钮 (⟳)
- [ ] 显示加载动画
- [ ] 数据成功重新加载
- [ ] 无错误提示

#### 测试 5: 新用户 Onboarding (隐身窗口)
- [ ] 打开隐身窗口
- [ ] 注册新账号
- [ ] 完成 onboarding
- [ ] 验证生成的 label 与 stanceType 一致

---

## 📁 修改的文件清单

### 核心功能
- ✅ `services/enhancedCompanyRankingService.ts` (新文件)
- ✅ `components/ui/ValuesCompanyRanking.tsx` (已更新)
- ✅ `services/companyRankingService.ts` (导出函数)
- ✅ `services/agents/stanceAgent.ts` (label 一致性修复)

### 维护脚本
- ✅ `scripts/maintenance/check-user-labels.ts` (检查)
- ✅ `scripts/maintenance/fix-user-labels.ts` (修复)

### 测试文件
- ✅ `test-enhanced-rankings.html`
- ✅ `vite.config.ts` (添加测试页面)

### 文档
- ✅ `ENHANCED_RANKINGS_SUMMARY.md`
- ✅ `LABEL_FIX_SUMMARY.md`
- ✅ `documentation/frontend/01_enhanced_rankings_integration.md`
- ✅ `documentation/frontend/02_persona_label_consistency.md`
- ✅ `DEPLOYMENT_CHECKLIST.md` (本文件)

---

## 🚀 部署命令

### 步骤 1: 最终构建

```bash
npm run build
```

**验证输出**:
- ✅ 无 TypeScript 错误
- ✅ 无构建警告（除了 chunk size warning）
- ✅ dist/ 目录生成成功

### 步骤 2: Git 提交

```bash
git add .

git commit -m "feat: Enhanced rankings integration + persona label consistency

Major Changes:
- Add enhancedCompanyRankingService for Python/TypeScript integration
- Migrate to enhanced_company_rankings collection
- Fix persona label to match canonical stanceType
- Add maintenance scripts for user label consistency

Technical Details:
- Priority: Read Python pre-computed rankings (every 12h)
- Fallback: TypeScript real-time calculation when needed
- Consistency: Use getStanceType() as single source of truth
- Collection: enhanced_company_rankings (replaces company_rankings)

Fixes:
- Persona label now matches actual stanceType used for rankings
- All existing users updated with correct labels
- New users will have consistent labels from onboarding

🤖 Generated with Claude Code"
```

### 步骤 3: 部署到 Cloud Run

```bash
gcloud run deploy stanse \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

**预计时间**: 3-5 分钟

### 步骤 4: 部署后验证

1. 访问生产环境: https://stanse-yfcontxnkq-uc.a.run.app
2. 完成 onboarding
3. 验证:
   - [ ] VALUES COMPANY RANKING 正常显示
   - [ ] Persona label 与 stanceType 一致
   - [ ] Market alignment 更新正常
   - [ ] 无控制台错误

---

## 🐛 回滚计划

如果部署后发现问题:

```bash
# 1. 查看最近的部署
gcloud run revisions list --service=stanse --region=us-central1

# 2. 回滚到上一个版本
gcloud run services update-traffic stanse \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

---

## 📊 监控指标

部署后监控:
- [ ] Cloud Run 错误日志
- [ ] Firebase 读取成功率
- [ ] Company rankings 加载时间
- [ ] 用户 onboarding 完成率

---

## ✅ 批准部署

**测试完成**: □ 是 / □ 否

**批准人**: ___________

**部署时间**: ___________

---

**下一步**: 刷新主应用验证 label 修复，然后开始部署！
