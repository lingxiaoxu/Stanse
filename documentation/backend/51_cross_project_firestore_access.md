# 跨项目Firestore访问配置指南

## 概述

允许`gen-lang-client-0960644135`项目下的另一个容器访问`stanseproject`的`news_stanseradar_china` collection。

## 架构

```
Google Cloud Project: gen-lang-client-0960644135 (837715360412)
  ├── Container 1: Stanse前端 (Cloud Run: stanse)
  │   └── Firebase Project: stanseproject (626045766180)
  │       └── 使用所有collections
  │
  └── Container 2: StanseRadar China服务 (你的另一个服务)
      └── 访问: stanseproject的news_stanseradar_china collection
          └── 权限: 读写(Read & Write)
          └── 隔离: 不能访问其他collections
```

## Firestore安全规则 (已部署)

**Collection:** `news_stanseradar_china`

```firestore
match /news_stanseradar_china/{document=**} {
  allow read, write: if true;  // 开发环境: 公开读写
}
```

**状态:** ✅ 已部署到stanseproject

## 在另一个容器中配置Firebase Admin SDK

### 方法1: 使用Firebase Admin SDK (推荐)

在你的另一个容器/服务中:

#### 步骤1: 安装Firebase Admin SDK

```bash
npm install firebase-admin
```

#### 步骤2: 初始化Admin SDK指向stanseproject

**在你的代码中 (Node.js):**

```typescript
import * as admin from 'firebase-admin';

// 初始化Admin SDK连接到stanseproject
admin.initializeApp({
  projectId: 'stanseproject',  // 目标Firebase项目
  // 使用应用默认凭证(Application Default Credentials)
  // Cloud Run会自动使用服务账号凭证
});

const db = admin.firestore();

// 现在可以访问news_stanseradar_china collection
const newsRef = db.collection('news_stanseradar_china');

// 写入数据
await newsRef.doc('article-123').set({
  title: '中国新闻标题',
  content: '新闻内容...',
  source: 'StanseRadar China',
  timestamp: admin.firestore.FieldValue.serverTimestamp()
});

// 读取数据
const snapshot = await newsRef.limit(10).get();
snapshot.forEach(doc => {
  console.log(doc.id, doc.data());
});
```

#### 步骤3: 配置IAM权限

给你的Cloud Run服务账号授予Firestore访问权限:

```bash
# 获取Cloud Run服务使用的服务账号
gcloud run services describe YOUR_SERVICE_NAME \
  --region=us-central1 \
  --project=gen-lang-client-0960644135 \
  --format="value(spec.template.spec.serviceAccountName)"

# 授予该服务账号访问stanseproject Firestore的权限
gcloud projects add-iam-policy-binding stanseproject \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/datastore.user"
```

**注意:** `roles/datastore.user` 允许读写Firestore,但受security rules限制。

### 方法2: 使用Service Account Key (不推荐,仅用于测试)

```typescript
import * as admin from 'firebase-admin';
import * as serviceAccount from './path/to/serviceAccountKey.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  projectId: 'stanseproject'
});

const db = admin.firestore();
```

**⚠️ 安全警告:** 不要将service account key文件提交到git!

## 代码示例

### 写入中国新闻数据

```typescript
import * as admin from 'firebase-admin';

// 初始化(只需要一次)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'stanseproject'
  });
}

const db = admin.firestore();

// 写入新闻
async function saveRadarChinaNews(newsData: any) {
  const newsRef = db.collection('news_stanseradar_china');

  const docData = {
    title: newsData.title,
    summary: newsData.summary,
    url: newsData.url,
    source: 'StanseRadar China',
    category: newsData.category,
    publishedAt: admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
    metadata: {
      sourceService: 'stanseradar-china',
      projectId: 'gen-lang-client-0960644135'
    }
  };

  // 使用唯一ID(如URL hash或标题hash)
  const docId = createHash(newsData.title);
  await newsRef.doc(docId).set(docData, { merge: true });

  console.log(`✅ Saved news: ${newsData.title}`);
}

// 读取新闻
async function getRadarChinaNews(limit = 20) {
  const newsRef = db.collection('news_stanseradar_china');

  const snapshot = await newsRef
    .orderBy('publishedAt', 'desc')
    .limit(limit)
    .get();

  const news: any[] = [];
  snapshot.forEach(doc => {
    news.push({ id: doc.id, ...doc.data() });
  });

  return news;
}
```

## 验证访问权限

测试连接是否正常:

```bash
# 在另一个容器中运行
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'stanseproject' });
const db = admin.firestore();

db.collection('news_stanseradar_china').doc('test').set({
  test: true,
  timestamp: admin.firestore.FieldValue.serverTimestamp()
}).then(() => {
  console.log('✅ Write successful');
  return db.collection('news_stanseradar_china').doc('test').get();
}).then(doc => {
  console.log('✅ Read successful:', doc.data());
  return db.collection('news_stanseradar_china').doc('test').delete();
}).then(() => {
  console.log('✅ Delete successful');
}).catch(err => {
  console.error('❌ Error:', err.message);
});
"
```

## 安全注意事项

### ✅ 当前配置:
- `news_stanseradar_china` collection: 公开读写(开发模式)
- 其他所有collections: 完全隔离,外部服务无法访问

### 🔒 生产环境建议:

将firestore.rules中的规则改为:

```firestore
match /news_stanseradar_china/{document=**} {
  // 只允许Firebase Admin SDK (服务账号)访问
  // 拒绝客户端直接访问
  allow read, write: if request.auth != null
                     && request.auth.token.firebase.sign_in_provider == 'custom';
}
```

然后在另一个服务中使用Admin SDK(服务器端)而不是客户端SDK。

## 环境变量配置

在另一个容器的Cloud Run服务中,不需要额外的环境变量:

```yaml
# Cloud Run服务配置
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: stanseradar-china
spec:
  template:
    spec:
      serviceAccountName: YOUR_SERVICE_ACCOUNT@gen-lang-client-0960644135.iam.gserviceaccount.com
      containers:
      - image: gcr.io/gen-lang-client-0960644135/stanseradar-china:latest
        env:
        # 不需要FIREBASE_CONFIG - Admin SDK自动使用服务账号
        - name: FIRESTORE_PROJECT_ID
          value: stanseproject
```

## 部署步骤总结

### 在Stanse项目(当前):
1. ✅ 已添加Firestore规则 (`news_stanseradar_china` collection)
2. ✅ 已部署到stanseproject

### 在另一个容器/服务中:
1. 安装`firebase-admin` npm包
2. 使用以下代码初始化:
   ```typescript
   admin.initializeApp({ projectId: 'stanseproject' });
   const db = admin.firestore();
   const newsRef = db.collection('news_stanseradar_china');
   ```
3. 确保Cloud Run服务账号有权限:
   ```bash
   gcloud projects add-iam-policy-binding stanseproject \
     --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
     --role="roles/datastore.user"
   ```

## 测试checklist

- [ ] 另一个服务可以写入`news_stanseradar_china`
- [ ] 另一个服务可以读取`news_stanseradar_china`
- [ ] 另一个服务**不能**读取`users` collection (应该失败)
- [ ] 另一个服务**不能**读取`news` collection (应该失败)
- [ ] Stanse前端仍然可以正常访问所有collections

## 故障排查

### 错误: Permission denied
```
Error: 7 PERMISSION_DENIED: Missing or insufficient permissions
```

**解决方案:**
1. 检查firestore.rules是否已部署: `firebase deploy --only firestore:rules --project=stanseproject`
2. 检查IAM权限: 服务账号是否有`roles/datastore.user`角色
3. 验证projectId: 确保使用`projectId: 'stanseproject'`

### 错误: Project not found
```
Error: Project 'stanseproject' not found
```

**解决方案:**
1. 确认项目ID拼写正确(全小写)
2. 检查服务账号是否有跨项目访问权限
3. 使用`gcloud projects list`验证项目存在

## 相关文档

- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Cloud Run Service Account: https://cloud.google.com/run/docs/securing/service-identity
