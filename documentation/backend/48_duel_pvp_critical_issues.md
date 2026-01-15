# DUEL Arena PvP Critical Issues

## 发现日期
2026-01-15

## 严重问题

### 问题1: 对手答案同步失效 ❌ CRITICAL

**现象：**
- 前几题可以同步（看到对手答题）
- 后来就卡住，对手答题但本地看不到
- 一方连续答对多题，另一方停留在某一题不动

**可能原因：**
1. `listenForOpponentAnswers` 的 `lastProcessedCount` 计数器可能有问题
2. Firestore `answers` 数组可能没有正确更新
3. 网络延迟导致监听器丢失事件

**日志证据：**
```
[listenForOpponentAnswers] Opponent answered Q0: correct  ✓
[listenForOpponentAnswers] Opponent answered Q1: correct  ✓
// 之后就没有日志了，对手继续答题但本地收不到
```

**需要调查：**
- 检查 Firestore `duel_matches/{matchId}` 的 `answers.A` 和 `answers.B` 数组
- 确认 `submitDuelAnswer` Cloud Function 是否正确更新了数组
- 检查 Firestore listener 是否丢失连接

---

### 问题2: 胜负结果不一致 ❌ CRITICAL

**现象：**
- 两边都显示 "VICTORY"
- 一边显示 `+$18`，另一边显示 `-$17`（荒谬！）
- 本应一胜一负，却都是胜利

**根本原因：**
**前端各自计算结果，不依赖后端权威结果**

**当前错误流程：**
```
前端A: 本地计算 → scoreA=7, scoreB=0 → 显示 VICTORY
前端B: 本地计算 → scoreA=0, scoreB=7 → 显示 VICTORY (错误!)
```

**正确流程应该是：**
```
后端: 收集所有 gameplay_events → 计算最终分数 → 确定 winner
前端A: 从 Firestore 读取 result.winner → 显示结果
前端B: 从 Firestore 读取 result.winner → 显示结果
```

**代码位置：**
- `DuelModal.tsx` line ~625-635: `endGame()` 函数本地计算 winner
- 应该改为监听 Firestore `result` 更新

---

### 问题3: 匹配记录丢失 ⚠️

**现象：**
- Firestore 中找不到匹配记录（但控制台说有）
- 可能被提前删除或写入失败

**需要检查：**
- `createMatch()` 函数是否成功写入 Firestore
- `finalizeMatch()` 是否过早删除记录
- Firestore 规则是否阻止写入

---

## 解决方案建议

### 短期修复（本次会话）

1. **修复监听器**
   - 添加更多日志来追踪 `listenForOpponentAnswers`
   - 检查 `lastProcessedCount` 逻辑
   - 添加错误重试机制

2. **修复结果计算**
   - **废弃前端计算**
   - 改为监听 Firestore `result` 字段
   - 后端 `finalizeMatch` 是权威结果源

### 长期重构（下次会话）

**完全重新设计真人对战架构：**

1. **状态同步模型**
   - 所有游戏状态存在 Firestore
   - 前端只做渲染，不做计算
   - 后端是唯一真相来源

2. **实时同步方案**
   - 使用 Firestore snapshot listeners
   - 不依赖手动数组计数
   - 添加心跳检测断线

3. **结果计算**
   - 后端收集 gameplay_events
   - 服务器端计算分数和胜负
   - 前端等待后端结果

4. **错误恢复**
   - 断线重连机制
   - 状态恢复
   - 超时保护

---

## 临时建议

**在完全修复之前：**
- 暂时禁用真人对战（或标记为 BETA）
- AI 对战可以继续使用（本地模拟，不依赖同步）
- 或者添加免责声明："真人对战处于测试阶段，可能出现同步问题"

---

## 相关文件

**需要重构的核心文件：**
1. `components/modals/DuelModal.tsx` - 前端游戏逻辑
2. `services/duelFirebaseService.ts` - Firestore 交互
3. `functions/src/duel/settlement.ts` - 后端结算逻辑
4. `functions/src/duel/matchmaking.ts` - 匹配系统

**参考已有功能：**
- AI 对战 - 工作正常（本地模拟）
- 匹配系统 - 工作正常（RTDB queue）
- Presence 追踪 - 工作正常
