# Stanse OpenClaw Skill & API Key System 设计文档

**版本**: 1.0
**创建日期**: 2026-03-27
**状态**: 待开发（设计阶段）

---

## 目录

1. [项目概览](#1-项目概览)
2. [Firestore 数据结构](#2-firestore-数据结构)
3. [Firestore Rules 更新](#3-firestore-rules-更新)
4. [Firebase Cloud Function：API Key 验证](#4-firebase-cloud-functionapi-key-验证)
5. [前端：AccountView API Key 区域](#5-前端accountview-api-key-区域)
6. [前端：LanguageContext 翻译扩展](#6-前端languagecontext-翻译扩展)
7. [前端：apiKeyService.ts](#7-前端apikeyservicets)
8. [Stanse Skill 仓库结构（GitHub）](#8-stanse-skill-仓库结构github)
9. [SKILL.toml 配置文件](#9-skilltoml-配置文件)
10. [Skill 工具函数完整列表](#10-skill-工具函数完整列表)
11. [Skill 工具函数实现架构](#11-skill-工具函数实现架构)
12. [ClawHub 发布流程](#12-clawhub-发布流程)
13. [整体架构图](#13-整体架构图)
14. [开发顺序建议](#14-开发顺序建议)

---

## 1. 项目概览

### 1.1 目标

将 Stanse 的核心功能通过标准 API Key 机制暴露给 OpenClaw / ZeroClaw Skill 生态，让用户可以通过任意消息平台（Telegram、WhatsApp、Slack 等）访问 Stanse 的政治新闻、品牌分析、Duel Arena 等全部功能。

### 1.2 核心约束

- **API Key 必须通过 stanse.ai 账号生成**，未注册用户无法使用
- **用户必须完成 Onboarding Survey**（坐标 label 不能是 `Uncalibrated`）才能生成 Key
- **所有 Key 在 Firestore 中 hash 存储**，明文只显示一次（关闭弹窗后不可再查）
- **Regenerate 后旧 Key 立即失效**，旧 Key 自动写入 history
- **目前 free 用户与 premium 用户均可使用全部 API 功能**（后续可按 plan 限流）
- **全部新增 UI 文字支持 5 种语言**（EN / ZH / JA / FR / ES）

### 1.3 技术约束

- Firebase 项目：`stanseproject`（Cloud Functions、Firestore、Auth）
- 前端部署项目：`gen-lang-client-0960644135`（Cloud Run `stanse`）
- 所有 secrets 通过 Google Secret Manager 管理，不 hardcode
- 遵循现有代码风格（PixelCard、PixelButton、LanguageContext、serverTimestamp 等）

---

## 2. Firestore 数据结构

### 2.1 Collection：`authentication_api_keys`

遵循 `company_news_by_ticker` 的双层结构（当前文档 + history 子集合）。

#### 当前文档路径
```
authentication_api_keys/{userId}
```

#### 当前文档字段
```typescript
interface ApiKeyDocument {
  userId: string;              // Firebase Auth UID
  keyHash: string;             // SHA-256(原始 key)，用于验证
  keyPrefix: string;           // 前8位明文，用于 UI 显示（如 "stanse-a"）
  keySuffix: string;           // 后6位明文，用于 UI 显示（如 "x9f2kp"）
  keyPreview: string;          // "stanse-a...x9f2kp"，纯展示用
  isActive: boolean;           // true = 有效，false = 已吊销
  createdAt: Timestamp;        // serverTimestamp()
  updatedAt: Timestamp;        // serverTimestamp()，regenerate 时更新
  lastUsedAt: Timestamp | null; // 最后一次成功验证的时间
  lastUsedFromSkill: string | null; // 调用来源（如 "openclaw-skill"）
  plan: 'free' | 'premium';   // 从 user_subscriptions 同步
  generationCount: number;     // 历史上共生成过几次 key
}
```

#### history 子集合路径
```
authentication_api_keys/{userId}/history/{historyId}
```

historyId 格式：`{timestamp_ms}` 或 `{YYYY-MM-DD_HH-mm-ss}`（与 company_news_by_ticker 保持一致）

#### history 文档字段
```typescript
interface ApiKeyHistoryDocument {
  keyHash: string;       // 失效 key 的 hash（用于审计，不能用于验证因为 isActive=false）
  keyPrefix: string;     // 前8位（审计展示）
  keySuffix: string;     // 后6位
  revokedAt: Timestamp;  // 何时被 regenerate 吊销
  revokedReason: 'regenerated' | 'manual_revoke'; // 吊销原因
  createdAt: Timestamp;  // 该 key 的原始创建时间
  usageCount: number;    // 生命周期内被使用过几次（可选，用于审计）
}
```

### 2.2 Key 格式规范

```
stanse-{random_40_chars}

示例：stanse-a8f3k2m9x1p4q7w0r6y5t3v2n8j1c9d4s7e2b5h0
总长度：7 + 40 = 47 字符
字符集：小写字母 + 数字（base36，避免混淆字符如 0/O、1/l）
```

生成方式（Node.js）：
```typescript
import crypto from 'crypto';

function generateApiKey(): string {
  const raw = crypto.randomBytes(30).toString('hex'); // 60 chars hex
  // 转换为 base36 并截取 40 位
  const base36 = BigInt('0x' + raw).toString(36).slice(0, 40).padStart(40, '0');
  return `stanse-${base36}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
```

---

## 3. Firestore Rules 更新

在 `firestore.rules` 中新增以下规则块，紧跟在 `user_subscriptions` 规则之后：

```javascript
// ===== API Key Authentication =====
// 用户只能读写自己的 API key 文档
match /authentication_api_keys/{userId} {
  // 用户可以读取自己的 key 文档（用于 UI 展示 prefix/suffix）
  allow read: if request.auth != null && request.auth.uid == userId;

  // 用户不能直接写入（必须通过 Cloud Function，确保 hash 逻辑正确）
  allow write: if false;

  // history 子集合：用户只读，Cloud Function 写入
  match /history/{historyId} {
    allow read: if request.auth != null && request.auth.uid == userId;
    allow write: if false;
  }
}
```

**说明**：所有写操作（生成、regenerate）都通过 Cloud Function 执行，前端无直接写权限。这保证了 hash 逻辑不会被绕过。

---

## 4. Firebase Cloud Function：API Key 验证

### 4.1 新增 Functions（在 `functions/src/index.ts` 中 export）

#### Function 1：`generateApiKey`（callable）

```typescript
// 功能：为已登录用户生成或重新生成 API Key
// 触发：前端调用（用户点击 Generate 或 Regenerate）
// 前提：用户必须已登录 + 坐标 label != 'Uncalibrated'

export const generateApiKey = functions.https.onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // 1. 验证用户已登录
    // 2. 读取 users/{userId}.coordinates.label，检查非 Uncalibrated
    // 3. 读取 user_subscriptions/{userId}.status 确定 plan
    // 4. 如果已有 key，将旧 key 写入 history 子集合（revokedReason: 'regenerated'）
    // 5. 生成新 key（generateApiKey()）
    // 6. 计算 hash（hashApiKey()）
    // 7. 写入 authentication_api_keys/{userId}（isActive: true）
    // 8. 返回原始 key 明文（只此一次）
    // 返回值：{ key: "stanse-xxx..." }（明文，只返回一次）
  }
);
```

#### Function 2：`validateApiKey`（callable / HTTP）

```typescript
// 功能：验证 API Key 是否有效，返回用户信息
// 触发：Skill 的所有 API 请求先调用此函数验证身份
// 注意：这是内部验证函数，Skill 实际上通过下面的业务 API 函数调用

export const validateApiKey = functions.https.onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 10,
    memory: '256MiB',
    cors: true,
  },
  async (req, res) => {
    // 1. 从 Authorization: Bearer <key> header 提取 key
    // 2. Hash 化 key
    // 3. 在 Firestore 查询：authentication_api_keys where keyHash == hash AND isActive == true
    // 4. 如果找到：更新 lastUsedAt，返回 { valid: true, userId, plan }
    // 5. 如果未找到：返回 401 { valid: false, error: 'Invalid or revoked API key' }
  }
);
```

### 4.2 Skill 专用 API Functions

以下所有 function 均为 HTTP functions，统一放在 `functions/src/skill-api.ts`，在 `index.ts` 中 export。

所有函数共享一个中间件：
```typescript
// 中间件：验证 API Key 并注入 userId 到 request
async function requireApiKey(req, res): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing API key' });
    return null;
  }
  const key = authHeader.slice(7);
  const hash = hashApiKey(key);

  const db = admin.firestore();
  const snapshot = await db.collection('authentication_api_keys')
    .where('keyHash', '==', hash)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    res.status(401).json({ error: 'Invalid or revoked API key' });
    return null;
  }

  // 异步更新 lastUsedAt（不阻塞响应）
  snapshot.docs[0].ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() });

  return snapshot.docs[0].data().userId;
}
```

---

## 5. 前端：AccountView API Key 区域

### 5.1 位置

在 `AccountView.tsx` 中，新增一个 `PixelCard` 区块，插入位置：**Email 区块之后、Premium Subscription 区块之前**。

### 5.2 状态管理

```typescript
// 新增状态（在 AccountView 组件内）
const [apiKeyData, setApiKeyData] = useState<{
  keyPreview: string;    // "stanse-a8f3k2...x9f2kp"
  createdAt: Date;
  lastUsedAt: Date | null;
  plan: string;
} | null>(null);

const [apiKeyLoading, setApiKeyLoading] = useState(false);
const [showKeyModal, setShowKeyModal] = useState(false);
const [fullKeyOnce, setFullKeyOnce] = useState<string | null>(null); // 只存一次完整 key
const [apiKeyError, setApiKeyError] = useState<string | null>(null);
const [isRegenerating, setIsRegenerating] = useState(false);
```

### 5.3 UI 组件结构

```
PixelCard（新区块）
├── 标题行：🔑 "OpenClaw Skill API Key"
├── [无 key 时]
│   ├── 说明文字："Generate an API key to use Stanse in OpenClaw / ZeroClaw"
│   └── [Generate API Key] 按钮
│       ├── 如果 label == 'Uncalibrated'：点击显示错误提示（不触发生成）
│       └── 正常：调用 generateApiKey Cloud Function → 打开 ShowKeyModal
├── [有 key 时]
│   ├── key 预览行：
│   │   ├── 左：monospace 字体显示 "stanse-a8f3k2...x9f2kp"（前8位省略后6位）
│   │   └── 右：[Regenerate] 按钮（带旋转图标，点击需二次确认）
│   ├── 创建时间：小字，"Generated on YYYY-MM-DD"
│   └── 最后使用：小字，"Last used: N/A" 或具体时间
└── [Uncalibrated 错误提示]（条件显示）
    └── 橙色警告框："Complete your Fingerprint survey first to generate an API key"
        + [Go to Fingerprint] 链接按钮
```

### 5.4 ShowKeyModal（一次性显示完整 key）

```
Modal（全屏遮罩）
├── 标题：🎉 "Your API Key"
├── 警告横幅（红色/橙色）：
│   "⚠ Copy this key now. It will never be shown again after closing this dialog."
├── key 展示框（monospace，可选中）：
│   stanse-a8f3k2m9x1p4q7w0r6y5t3v2n8j1c9d4s7e2b5h0
│   + [Copy] 按钮（点击后显示 ✓ Copied）
├── 使用说明（collapsible）：
│   "How to use with OpenClaw:"
│   openclaw skills install https://github.com/stanse-ai/stanse-skill
│   "When prompted, enter your API key above."
└── [I've copied my key, Close] 按钮（关闭后 fullKeyOnce 清空）
```

### 5.5 Regenerate 二次确认

```
小型确认弹窗（Alert 或 inline）：
"⚠ Regenerating will immediately revoke your current key.
 Any OpenClaw skill using the old key will stop working.
 Are you sure?"
[Cancel] [Yes, Regenerate]
```

### 5.6 数据加载

```typescript
// 在 useEffect 中，与 loadSubscriptionStatus 一起执行
const loadApiKeyData = async () => {
  if (!user) return;
  const docRef = doc(db, 'authentication_api_keys', user.uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    setApiKeyData({
      keyPreview: data.keyPreview,
      createdAt: data.createdAt?.toDate(),
      lastUsedAt: data.lastUsedAt?.toDate() ?? null,
      plan: data.plan,
    });
  }
};
```

---

## 6. 前端：LanguageContext 翻译扩展

在 `LanguageContext.tsx` 的每种语言下，`menu` 对象中新增以下 key（紧跟在 account 相关 key 后面）：

```typescript
// 在 menu 对象中新增（5种语言各自翻译）

// EN
apiKey_title: 'OpenClaw Skill API Key',
apiKey_desc: 'Use this key to authenticate Stanse in OpenClaw or ZeroClaw',
apiKey_generate: 'Generate API Key',
apiKey_regenerate: 'Regenerate',
apiKey_generated_on: 'Generated on',
apiKey_last_used: 'Last used',
apiKey_never_used: 'Never used',
apiKey_copy: 'Copy',
apiKey_copied: 'Copied!',
apiKey_modal_title: 'Your API Key',
apiKey_modal_warning: '⚠ Copy this key now. It will never be shown again after closing this dialog.',
apiKey_modal_howto: 'How to use with OpenClaw:',
apiKey_modal_close: "I've copied my key, Close",
apiKey_regen_confirm: 'Regenerating will immediately revoke your current key. Any OpenClaw skill using the old key will stop working. Are you sure?',
apiKey_regen_cancel: 'Cancel',
apiKey_regen_confirm_btn: 'Yes, Regenerate',
apiKey_uncalibrated_warning: 'You must complete your Fingerprint survey before generating an API key.',
apiKey_uncalibrated_link: 'Go to Fingerprint',
apiKey_loading: 'Generating...',
apiKey_error_generic: 'Failed to generate API key. Please try again.',

// ZH
apiKey_title: 'OpenClaw Skill API 密钥',
apiKey_desc: '使用此密钥在 OpenClaw 或 ZeroClaw 中验证 Stanse 身份',
apiKey_generate: '生成 API 密钥',
apiKey_regenerate: '重新生成',
apiKey_generated_on: '生成于',
apiKey_last_used: '最后使用',
apiKey_never_used: '从未使用',
apiKey_copy: '复制',
apiKey_copied: '已复制！',
apiKey_modal_title: '您的 API 密钥',
apiKey_modal_warning: '⚠ 请立即复制此密钥。关闭此对话框后将无法再次查看。',
apiKey_modal_howto: '如何在 OpenClaw 中使用：',
apiKey_modal_close: '我已复制密钥，关闭',
apiKey_regen_confirm: '重新生成将立即吊销您当前的密钥，使用旧密钥的 OpenClaw skill 将停止工作。确认继续？',
apiKey_regen_cancel: '取消',
apiKey_regen_confirm_btn: '确认，重新生成',
apiKey_uncalibrated_warning: '您需要先完成 Fingerprint 调查才能生成 API 密钥。',
apiKey_uncalibrated_link: '前往 Fingerprint',
apiKey_loading: '生成中...',
apiKey_error_generic: '生成 API 密钥失败，请重试。',

// JA
apiKey_title: 'OpenClaw スキル API キー',
apiKey_desc: 'このキーを使って OpenClaw または ZeroClaw で Stanse を認証します',
apiKey_generate: 'API キーを生成',
apiKey_regenerate: '再生成',
apiKey_generated_on: '生成日',
apiKey_last_used: '最終使用',
apiKey_never_used: '未使用',
apiKey_copy: 'コピー',
apiKey_copied: 'コピー済み！',
apiKey_modal_title: 'あなたの API キー',
apiKey_modal_warning: '⚠ 今すぐこのキーをコピーしてください。このダイアログを閉じると二度と表示されません。',
apiKey_modal_howto: 'OpenClaw での使い方：',
apiKey_modal_close: 'キーをコピーしました、閉じる',
apiKey_regen_confirm: '再生成すると現在のキーが即時無効になります。古いキーを使用している OpenClaw スキルは動作しなくなります。続けますか？',
apiKey_regen_cancel: 'キャンセル',
apiKey_regen_confirm_btn: 'はい、再生成する',
apiKey_uncalibrated_warning: 'API キーを生成する前に Fingerprint 調査を完了する必要があります。',
apiKey_uncalibrated_link: 'Fingerprint へ移動',
apiKey_loading: '生成中...',
apiKey_error_generic: 'API キーの生成に失敗しました。もう一度お試しください。',

// FR
apiKey_title: 'Clé API OpenClaw Skill',
apiKey_desc: 'Utilisez cette clé pour authentifier Stanse dans OpenClaw ou ZeroClaw',
apiKey_generate: 'Générer une clé API',
apiKey_regenerate: 'Régénérer',
apiKey_generated_on: 'Générée le',
apiKey_last_used: 'Dernière utilisation',
apiKey_never_used: 'Jamais utilisée',
apiKey_copy: 'Copier',
apiKey_copied: 'Copié !',
apiKey_modal_title: 'Votre clé API',
apiKey_modal_warning: '⚠ Copiez cette clé maintenant. Elle ne sera plus affichée après la fermeture de ce dialogue.',
apiKey_modal_howto: 'Comment utiliser avec OpenClaw :',
apiKey_modal_close: "J'ai copié ma clé, Fermer",
apiKey_regen_confirm: 'La régénération révoquera immédiatement votre clé actuelle. Tout skill OpenClaw utilisant l\'ancienne clé cessera de fonctionner. Êtes-vous sûr ?',
apiKey_regen_cancel: 'Annuler',
apiKey_regen_confirm_btn: 'Oui, régénérer',
apiKey_uncalibrated_warning: 'Vous devez compléter le sondage Fingerprint avant de générer une clé API.',
apiKey_uncalibrated_link: 'Aller à Fingerprint',
apiKey_loading: 'Génération...',
apiKey_error_generic: 'Échec de la génération de la clé API. Veuillez réessayer.',

// ES
apiKey_title: 'Clave API de OpenClaw Skill',
apiKey_desc: 'Usa esta clave para autenticar Stanse en OpenClaw o ZeroClaw',
apiKey_generate: 'Generar clave API',
apiKey_regenerate: 'Regenerar',
apiKey_generated_on: 'Generada el',
apiKey_last_used: 'Último uso',
apiKey_never_used: 'Nunca usada',
apiKey_copy: 'Copiar',
apiKey_copied: '¡Copiado!',
apiKey_modal_title: 'Tu clave API',
apiKey_modal_warning: '⚠ Copia esta clave ahora. No volverá a mostrarse después de cerrar este diálogo.',
apiKey_modal_howto: 'Cómo usar con OpenClaw:',
apiKey_modal_close: 'He copiado mi clave, Cerrar',
apiKey_regen_confirm: 'Regenerar revocará inmediatamente tu clave actual. Cualquier skill de OpenClaw que use la clave anterior dejará de funcionar. ¿Estás seguro?',
apiKey_regen_cancel: 'Cancelar',
apiKey_regen_confirm_btn: 'Sí, regenerar',
apiKey_uncalibrated_warning: 'Debes completar la encuesta de Fingerprint antes de generar una clave API.',
apiKey_uncalibrated_link: 'Ir a Fingerprint',
apiKey_loading: 'Generando...',
apiKey_error_generic: 'Error al generar la clave API. Por favor, inténtalo de nuevo.',
```

---

## 7. 前端：apiKeyService.ts

新建文件 `services/apiKeyService.ts`，遵循 `subscriptionService.ts` 的代码风格：

```typescript
// services/apiKeyService.ts
// 处理 API Key 的生成、读取逻辑
// 写操作全部通过 Cloud Function，读操作直接 Firestore

import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from './firebase';

export interface ApiKeyInfo {
  keyPreview: string;    // "stanse-a8f3k2...x9f2kp"
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  plan: 'free' | 'premium';
  generationCount: number;
  isActive: boolean;
}

// 读取当前用户的 API Key 信息（不包含完整 key）
export async function getApiKeyInfo(userId: string): Promise<ApiKeyInfo | null> {
  const docRef = doc(db, 'authentication_api_keys', userId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    keyPreview: data.keyPreview,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
    lastUsedAt: data.lastUsedAt?.toDate() ?? null,
    plan: data.plan,
    generationCount: data.generationCount ?? 1,
    isActive: data.isActive,
  };
}

// 生成新 API Key（调用 Cloud Function，返回明文 key，只此一次）
export async function generateApiKey(): Promise<{ key: string }> {
  const functions = getFunctions();
  const generateFn = httpsCallable<void, { key: string }>(functions, 'generateApiKey');
  const result = await generateFn();
  return result.data;
}

// Regenerate API Key（调用同一个 Cloud Function，Cloud Function 内部判断是否已存在旧 key）
export const regenerateApiKey = generateApiKey;
```

---

## 8. Stanse Skill 仓库结构（GitHub）

### 8.1 仓库信息

- **仓库名**：`stanse-ai/stanse-skill`
- **可见性**：Public
- **URL**：`https://github.com/stanse-ai/stanse-skill`

### 8.2 目录结构

```
stanse-skill/
├── SKILL.toml              # ZeroClaw skill 元数据（主配置）
├── SKILL.md                # OpenClaw skill 元数据（兼容格式）
├── README.md               # 用户文档（英文，含5语言使用说明）
├── package.json            # Node.js 依赖（TypeScript）
├── tsconfig.json
├── src/
│   ├── index.ts            # Skill 入口，注册所有 tools
│   ├── client.ts           # Stanse API HTTP 客户端（含 auth 逻辑）
│   ├── types.ts            # 所有类型定义
│   └── tools/
│       ├── news.ts         # 新闻相关工具
│       ├── sense.ts        # 品牌分析工具
│       ├── fingerprint.ts  # 政治指纹工具
│       ├── union.ts        # 活动 + Duel Arena 工具
│       ├── account.ts      # 账号/订阅工具
│       └── radar.ts        # 中国新闻播报工具（ZH）
└── docs/
    ├── en.md
    ├── zh.md
    ├── ja.md
    ├── fr.md
    └── es.md
```

---

## 9. SKILL.toml 配置文件

```toml
[skill]
name = "stanse"
version = "1.0.0"
description = "Political news, brand alignment analysis, and civic action tools powered by Stanse.ai"
author = "Stanse AI"
homepage = "https://stanse.ai"
repository = "https://github.com/stanse-ai/stanse-skill"
license = "MIT"
tags = ["news", "politics", "brand-analysis", "civic", "multilingual"]

[runtime]
type = "node"
version = ">=18"
entry = "src/index.ts"

[config]
# Required: API key from stanse.ai account settings
STANSE_API_KEY = { required = true, secret = true, description = "Get your API key at https://stanse.ai → Account → OpenClaw Skill API Key" }

# Optional: preferred language (en/zh/ja/fr/es), defaults to en
STANSE_LANGUAGE = { required = false, default = "en", description = "Preferred language for news and responses (en/zh/ja/fr/es)" }

[permissions]
network = ["stanse.ai", "stanseagent-837715360412.us-central1.run.app"]

[onboarding]
message = """
Welcome to Stanse! To get started:
1. Visit https://stanse.ai and create an account
2. Complete the Fingerprint political survey
3. Go to Account → OpenClaw Skill API Key → Generate
4. Copy your key and paste it below
"""
```

---

## 10. Skill 工具函数完整列表

所有可供 Skill 调用的工具函数，对应前端每一个可点击/可执行的功能。

### 10.1 新闻（News）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `fetch_news` | Feed 新闻流加载 | `language`, `category?` | 新闻列表（标题、摘要、来源、时间、分类） |
| `get_breaking_news` | Breaking News 推送 | `language` | 最新 breaking news 列表 |
| `get_prism_analysis` | Prism 三视角分析 | `newsId`, `language` | support/oppose/neutral 三段分析 |
| `record_news_stance` | 立场反馈按钮 | `newsId`, `stance` (SUPPORT/NEUTRAL/OPPOSE) | 确认写入 |
| `get_china_radar` | 中国新闻播报（ZH） | 无 | 最新播报文本（来自 news_stanseradar_china_consolidated） |
| `get_company_rankings` | 公司排名卡片 | `limit?` | 公司排名列表（含对齐分数） |
| `get_market_analysis` | 市场分析横幅 | 无 | 当日市场摘要 |

### 10.2 品牌分析（Sense）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `analyze_brand` | 品牌对齐分析（核心） | `company`, `language?` | 0-100 分数、MATCH/CONFLICT/NEUTRAL、详细分析文本、来源 URL |
| `get_scan_history` | 搜索历史 | `limit?` | 最近扫描过的品牌列表 |
| `get_fec_data` | FEC 政治捐款 | `company` | 捐款党派分布 |
| `get_globe_markers` | 地球标记数据 | `type?` (news/conflict/user) | 全球事件标记列表 |
| `recalibrate_from_scan` | Recalibration（扫描结果反馈） | `company`, `userFeedback` | 更新后的坐标 |

### 10.3 政治指纹（Fingerprint）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `get_my_persona` | 查看当前政治坐标 | 无 | label、经济/社会/外交三轴数值、多语言 label |
| `get_onboarding_status` | 检查是否完成 Onboarding | 无 | `{ completed: bool, label: string }` |
| `submit_onboarding` | 提交 Onboarding 问卷 | 完整问卷答案对象 | 生成的 persona label 和坐标 |
| `reset_coordinates` | 重置政治坐标 | 无 | 确认重置 |

### 10.4 Union 活动（Campaigns）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `get_campaigns` | 活动列表 | `type?` (BOYCOTT/BUYCOTT/etc.), `limit?` | 活动列表 |
| `get_campaign_detail` | 活动详情 | `campaignId` | 完整活动信息 |
| `join_campaign` | 加入活动 | `campaignId` | 确认 |
| `leave_campaign` | 退出活动 | `campaignId` | 确认 |
| `get_collective_stats` | 集体统计 Dashboard | 无 | 在线人数、Union Strength、Capital Diverted |
| `get_polis_status` | Polis 区块链状态 | 无 | TPS、Block Height |

### 10.5 Duel Arena

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `get_duel_credits` | 积分余额 | 无 | 当前积分余额 |
| `get_duel_history` | 历史对战 | `limit?` | 最近对战记录（结果、盈亏） |
| `get_duel_stats` | 个人对战统计 | 无 | 胜率、总场次、总盈亏 |
| `get_credit_history` | 积分历史 | `limit?` | 积分变动记录 |

> **注意**：Duel Arena 的实时对战流程（匹配、答题、实时同步）因需要 WebSocket/长连接，不适合通过 Skill HTTP API 实现。以上工具提供查询类功能。

### 10.6 账号（Account）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `get_account_info` | 账号基本信息 | 无 | email、注册时间、订阅状态 |
| `get_subscription_status` | 订阅状态 | 无 | status、trial 信息、renewal date |
| `get_billing_history` | 账单历史 | `limit?` | 账单记录列表 |
| `get_api_key_info` | API Key 信息 | 无 | keyPreview、createdAt、lastUsedAt（不返回完整 key） |

### 10.7 设置（Settings）

| 工具名 | 对应前端功能 | 参数 | 返回 |
|--------|-------------|------|------|
| `get_language_preference` | 当前语言设置 | 无 | 当前语言代码 |
| `set_language_preference` | 切换语言 | `language` (en/zh/ja/fr/es) | 确认更新 |

---

## 11. Skill 工具函数实现架构

### 11.1 API 端点规划

所有 Skill API 统一挂在一个 Cloud Run HTTP function 下（在现有 `ember-api` 或新建 `stanse-skill-api` service），路径规范：

```
POST https://stanse-skill-api-{hash}.us-central1.run.app/v1/{tool_name}

Headers:
  Authorization: Bearer stanse-xxx...   # 用户的 API Key
  Content-Type: application/json
  X-Stanse-Language: en                 # 可选，语言偏好

Body: { ...tool specific params }

Response: { data: {...}, error?: string }
```

### 11.2 Skill 客户端（`src/client.ts`）

```typescript
// Skill 内的 HTTP 客户端
// 统一处理 auth header、错误码、语言偏好

export class StanseClient {
  private apiKey: string;
  private language: string;
  private baseUrl = 'https://stanse-skill-api-xxx.us-central1.run.app/v1';

  constructor(config: { STANSE_API_KEY: string; STANSE_LANGUAGE?: string }) {
    this.apiKey = config.STANSE_API_KEY;
    this.language = config.STANSE_LANGUAGE ?? 'en';
  }

  async call(tool: string, params: object = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}/${tool}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Stanse-Language': this.language,
      },
      body: JSON.stringify(params),
    });

    if (response.status === 401) {
      throw new Error('Invalid API key. Please generate a new key at stanse.ai → Account → OpenClaw Skill API Key');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Stanse API error');
    return data;
  }
}
```

---

## 12. ClawHub 发布流程

ClawHub 是 OpenClaw 的社区 skill 目录（`https://clawhub.openclaw.ai`）。

### 12.1 发布步骤

1. **确认仓库**：`https://github.com/stanse-ai/stanse-skill` 公开可访问
2. **确认 SKILL.toml**：格式正确，所有必填字段完整
3. **在 ClawHub 提交 PR**：
   - Fork ClawHub registry 仓库（地址待查，通常是 `openclaw/clawhub-registry`）
   - 在 `skills/` 目录新增 `stanse.toml`（或 PR 模板要求的格式）
   - 填写 skill 名称、描述、仓库 URL、标签
   - 提交 PR，等待 OpenClaw 团队审核合并
4. **合并后**：用户可以通过 ClawHub UI 一键安装，或通过命令：
   ```bash
   openclaw skills install stanse
   # 或
   zeroclaw skills install stanse
   ```

### 12.2 安装体验（用户视角）

```bash
# 用户安装
openclaw skills install https://github.com/stanse-ai/stanse-skill

# ZeroClaw 会自动提示：
⚙ Configuring stanse skill...
? STANSE_API_KEY (required, secret)
  Get your API key at https://stanse.ai → Account → OpenClaw Skill API Key
  > [用户粘贴 key]
? STANSE_LANGUAGE (optional, default: en)
  > en

✅ stanse skill installed successfully!

# 使用示例（Telegram 中）
User: /stanse fetch_news category:POLITICS
Bot:  📰 Today's top political news...

User: /stanse analyze_brand Tesla
Bot:  🔍 Analyzing Tesla alignment...
      Score: 67/100 (NEUTRAL)
      ...
```

---

## 13. 整体架构图

```
用户 → OpenClaw/ZeroClaw 客户端（Telegram/WhatsApp/Slack/...）
              ↓
        stanse-skill（本地 Node.js 进程）
        - SKILL.toml 配置
        - src/tools/*.ts 工具函数
              ↓ HTTP POST + Authorization: Bearer stanse-xxx
        stanse-skill-api（Cloud Run, gen-lang-client-0960644135）
              ↓
        [中间件] requireApiKey()
        - hash API Key
        - 查 Firestore authentication_api_keys
        - 验证 isActive == true
        - 更新 lastUsedAt
              ↓ 验证通过，注入 userId
        业务逻辑层
        - 读取 Firestore（新闻、活动、积分等）
        - 调用 Gemini API（品牌分析、Prism）
        - 调用 Cloud Functions（通知、Duel 结算）
              ↓
        返回结构化 JSON 响应

─────── Stanse.ai 前端（用户侧）────────────────────
        stanse.ai → 登录 → Account 页面
        ├── [Generate API Key] → 调用 generateApiKey Cloud Function
        │     ├── 验证 label != 'Uncalibrated'
        │     ├── 生成 stanse-{40chars} 明文 key
        │     ├── hash(key) → 存入 authentication_api_keys/{userId}
        │     ├── 旧 key → 写入 history 子集合
        │     └── 返回明文 key（只此一次）
        └── 弹窗显示完整 key → 用户复制 → 填入 OpenClaw 配置
```

---

## 14. 开发顺序建议

### Phase 1：后端基础（约 1 周）
1. 新建 `functions/src/api-key-manager.ts`（generateApiKey Cloud Function）
2. 更新 `firestore.rules`（新增 authentication_api_keys 规则）
3. 部署 Cloud Function，本地测试生成和 hash 逻辑
4. 验证 Firestore 写入结构正确（当前文档 + history 子集合）

### Phase 2：前端 UI（约 1 周）
1. 新建 `services/apiKeyService.ts`
2. 更新 `contexts/LanguageContext.tsx`（新增5语言翻译 key）
3. 更新 `components/views/AccountView.tsx`（新增 API Key 区块 + ShowKeyModal）
4. 测试完整 UX 流程（生成、显示一次、关闭后只显示 preview、regenerate）
5. 部署到 Cloud Run（`gcloud builds submit`）

### Phase 3：Skill API 后端（约 1-2 周）
1. 新建 Cloud Run service `stanse-skill-api`（或复用 ember-api 路由）
2. 实现 `requireApiKey` 中间件
3. 按优先级实现工具函数（新闻 → 品牌分析 → 指纹 → 账号 → 活动）
4. 测试所有工具端点

### Phase 4：Skill 仓库（约 1 周）
1. 创建 `stanse-ai/stanse-skill` GitHub 仓库
2. 编写 `SKILL.toml`、`SKILL.md`、`README.md`
3. 实现 `src/` 下所有工具函数（调用 stanse-skill-api）
4. 本地测试（ZeroClaw 安装 + 调用验证）
5. 提交 ClawHub PR

### Phase 5：文档和发布（约 3 天）
1. 完善 README（5语言版本）
2. 录制/截图使用示例
3. 提交 ClawHub 审核
4. 在 stanse.ai 添加 "Use with OpenClaw" 入口说明

---

*文档编号：frontend/28_openclaw_skill_api_key_system.md*
*关联文档：backend/78_skill_api_endpoints.md（待创建）*
