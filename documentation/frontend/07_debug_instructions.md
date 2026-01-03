# 🐛 调试主应用排名不一致问题

## 问题描述
- **测试页面**: 显示正确的 Python 数据 (PLD, NEM, ADBE, CSCO, NKE)
- **主应用**: 显示不同的数据 (AMZN, AMD, CSCO, PLD, GS)
- **Persona**: 两者都是 `progressive-globalist`

## 🔍 调试步骤

### 步骤 1: 查看主应用控制台日志

在主应用浏览器控制台 (F12 → Console) 搜索:

```
[Enhanced Rankings]
```

**预期看到**:
```
[Enhanced Rankings] Getting ranking for progressive-globalist (forceRefresh: false)
[Enhanced Rankings] Found valid ranking for progressive-globalist (updated: ..., expires: ...)
[Enhanced Rankings] Using pre-computed ranking from enhanced_company_rankings
```

**如果看到其他内容，复制完整日志！**

---

### 步骤 2: 在控制台直接测试 Firebase 读取

复制以下代码到主应用控制台执行:

```javascript
// 直接测试 Firebase 读取
(async () => {
  try {
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

    const db = getFirestore();
    const docRef = doc(db, 'enhanced_company_rankings', 'progressive-globalist');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 Firebase 实际存储的数据:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Version:', data.version);
      console.log('Updated:', data.updatedAt);
      console.log('Expires:', data.expiresAt);
      console.log('StanceType:', data.stanceType);
      console.log('');
      console.log('Support Companies:');
      data.supportCompanies.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.symbol} (${c.name}) - Score: ${c.score}`);
      });
      console.log('');
      console.log('Oppose Companies:');
      data.opposeCompanies.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.symbol} (${c.name}) - Score: ${c.score}`);
      });
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.error('❌ 文档不存在！');
    }
  } catch (error) {
    console.error('❌ 错误:', error);
  }
})();
```

**将输出结果告诉我！**

---

### 步骤 3: 检查 Network 请求

1. F12 → Network 标签
2. 刷新页面
3. 在 Filter 框输入: `firestore`
4. 找到 `enhanced_company_rankings` 相关的请求
5. 点击请求 → Preview 标签
6. 查看返回的 `supportCompanies` 数据

**预期**: 应该看到 PLD, NEM, ADBE, CSCO, NKE

**如果看到其他公司，说明 Firebase 数据本身有问题！**

---

### 步骤 4: 检查是否有多个 Firebase 实例

在控制台执行:

```javascript
// 检查 Firebase 配置
const { getApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
const app = getApp();
console.log('Firebase Config:', app.options);
console.log('Project ID:', app.options.projectId);
```

**预期输出**:
```
Project ID: stanseproject
```

---

### 步骤 5: 强制重新获取排名

在主应用中点击刷新按钮 (⟳)，然后查看:
1. 控制台日志
2. 刷新后显示的公司是否变化

---

## 🔬 可能的根本原因

### 原因 A: React 组件状态未更新
- 组件可能缓存了旧状态
- **解决**: 强制刷新整个页面

### 原因 B: Firebase SDK 缓存
- Firebase SDK 可能有自己的缓存层
- **解决**: 清除浏览器所有数据

### 原因 C: 服务代码路径错误
- 可能仍在调用旧的服务
- **解决**: 检查导入语句

### 原因 D: Firebase 数据本身不一致
- 测试页面和主应用读取了不同的文档
- **解决**: 检查 Firebase Console

---

## 📝 请提供的信息

执行完上述步骤后，请提供:

1. **步骤 1 的控制台日志** (搜索 "[Enhanced Rankings]")
2. **步骤 2 的输出** (Firebase 数据测试结果)
3. **步骤 3 的发现** (Network 请求返回的数据)
4. **步骤 4 的输出** (Firebase 配置)

有了这些信息，我就能准确定位问题！

---

**快速测试**: 如果你想快速验证代码是否正确，可以:
1. 打开隐身窗口
2. 访问 http://localhost:3000
3. 完成 onboarding (设置 progressive-globalist 坐标)
4. 查看排名

如果隐身窗口显示正确，那就是缓存问题。
