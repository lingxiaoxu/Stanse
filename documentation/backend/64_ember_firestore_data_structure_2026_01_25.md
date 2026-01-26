# Ember Firestore 数据结构完整说明

**文档编号**: 64
**创建日期**: 2026-01-25
**类型**: 数据结构文档
**状态**: ✅ 已实施

---

## 📊 数据库架构概览

### 数据库位置

**所有 Ember 数据**: `stanseproject` Firestore
**原因**: 与前端用户数据在同一数据库，统一管理

### 顶层结构

```
stanseproject Firestore:
├── users/                        (用户数据 - 已有)
│   └── {userId}/
│       ├── (主文档: coordinates, email, profile, etc.)
│       ├── chatHistory/          ← 前端聊天历史（已有，最多5条）
│       │   └── {messageId}
│       └── ember_cost_sessions/  ← Ember 成本追踪（新增，无限制）
│           └── {sessionId}
│
├── ember_global_cache/           ← Ember 全局缓存（新增）
│   └── {cacheKey}
│
├── user_budgets/                 ← 用户预算设置（新增）
│   └── {userId}
│
└── user_tiers/                   ← 用户等级（新增）
    └── {userId}
```

---

## 1. 用户成本追踪

### 路径
```
users/{userId}/ember_cost_sessions/{sessionId}
```

### 数据结构

```typescript
interface EmberCostSession {
  timestamp: Timestamp;           // Firestore Timestamp
  date: string;                   // "2026-01-25" (ISO 日期字符串)
  cost: number;                   // 0.000021 (美元)
  model: string;                  // "models/gemini-2.5-flash"
  mode: string;                   // "default" | "multi" | "ensemble" | "batch"
  tokens: {
    prompt: number;               // 2 (输入 tokens)
    completion: number;           // 8 (输出 tokens)
    total: number;                // 104 (总 tokens)
  };
  execution_time: number;         // 4.054 (秒)
}
```

### 示例文档

```javascript
// 文档 ID: auto-generated
users/LJVcsnNh9Ma3ktDY8JYDTdbqI803/ember_cost_sessions/abc123xyz

{
  timestamp: Timestamp(2026-01-25T01:20:15Z),
  date: "2026-01-25",
  cost: 0.000021,
  model: "models/gemini-2.5-flash",
  mode: "default",
  tokens: {
    prompt: 2,
    completion: 8,
    total: 104
  },
  execution_time: 4.054
}
```

### 写入方法

**位置**: `functions/ember-api/services/cost_service.py`

```python
async def record_usage(self, user_id: str, cost: float, metadata: Dict):
    """记录用户成本"""
    doc_ref = self.db.collection("users") \
        .document(user_id) \
        .collection("ember_cost_sessions") \
        .document()  # 自动生成 ID

    data = {
        "timestamp": datetime.now(),
        "date": datetime.now().date().isoformat(),
        "cost": cost,
        "model": metadata.get("model"),
        "mode": metadata.get("mode"),
        "tokens": metadata.get("tokens", {}),
        "execution_time": metadata.get("execution_time", 0)
    }

    doc_ref.set(data)
```

### 查询方法

**按日期查询** (今日成本):
```python
# cost_service.py::get_usage_stats()

today = datetime.now().replace(hour=0, minute=0, second=0)

query = self.db.collection("users") \
    .document(user_id) \
    .collection("ember_cost_sessions") \
    .where("timestamp", ">=", today) \
    .order_by("timestamp")

docs = query.stream()

total_cost = sum(doc.to_dict()['cost'] for doc in docs)
```

**统计示例**:
```python
# 按模式分组
by_mode = {
    "default": {"requests": 10, "cost": 0.009},
    "multi": {"requests": 2, "cost": 0.034},
    "ensemble": {"requests": 1, "cost": 0.013}
}

# 按模型分组
by_model = {
    "gemini-2.5-flash": {"calls": 8, "cost": 0.007},
    "gpt-5": {"calls": 3, "cost": 0.042},
    "claude-4-sonnet": {"calls": 2, "cost": 0.011}
}
```

### 前端 API 调用

```javascript
// 查看今日成本统计
const response = await fetch(
  'https://ember-api-yfcontxnkq-uc.a.run.app/cost/stats?user_id=xxx&period=today'
);

// 返回:
{
  "success": true,
  "data": {
    "period": "today",
    "summary": {
      "total_cost": 0.056,
      "total_requests": 13,
      "total_tokens": 5200,
      "avg_cost_per_request": 0.004307
    },
    "by_mode": {...},
    "by_model": {...}
  }
}
```

---

## 2. Ember 全局缓存

### 路径
```
ember_global_cache/{cacheKey}
```

### 缓存键生成

**方法**: `cache_service.py::generate_cache_key()`

```python
def generate_cache_key(message, mode, user_context):
    # 1. 标准化消息（小写，去空格）
    normalized_message = message.lower().strip()
    # "什么是AI？" → "什么是ai？"

    # 2. 标准化用户上下文（四舍五入）
    normalized_context = {
        'economic': round(user_context['economic'], 1),  # -2.52 → -2.5
        'social': round(user_context['social'], 1),      # 3.14 → 3.1
        'label': user_context['label']
    }

    # 3. 组合数据
    key_data = {
        "message": normalized_message,
        "mode": mode,
        "context": normalized_context
    }

    # 4. MD5 哈希
    key_str = json.dumps(key_data, sort_keys=True)
    return hashlib.md5(key_str.encode()).hexdigest()
    # 返回: "a1b2c3d4e5f6789..."
```

### 数据结构

```typescript
interface EmberCache {
  result: {
    success: boolean;
    answer: string;
    cost: number;
    tokens: {
      prompt: number;
      completion: number;
      total: number;
    };
    model_used: string;
    mode: string;
    execution_time: number;
    from_cache: boolean;
    metadata: {...};
  };
  expires_at: Timestamp;          // 10分钟后过期
  created_at: Timestamp;          // 创建时间
}
```

### 示例文档

```javascript
// 文档 ID: MD5 hash
ember_global_cache/a1b2c3d4e5f6789abcdef

{
  result: {
    success: true,
    answer: "AI是人工智能的缩写...",
    cost: 0.000089,
    tokens: {
      prompt: 2,
      completion: 8,
      total: 104
    },
    model_used: "models/gemini-2.5-flash",
    mode: "default",
    execution_time: 4.05,
    from_cache: false,
    metadata: {
      selection_reason: "短问题，选择快速模型",
      quality_level: "balanced"
    }
  },
  expires_at: Timestamp(2026-01-25T01:30:00Z),  // 10分钟后
  created_at: Timestamp(2026-01-25T01:20:00Z)
}
```

### 缓存流程

**两级缓存**:

```python
# 1. 查找缓存
async def get(self, cache_key):
    # Level 1: 内存缓存（最快）
    if cache_key in self._memory_cache:
        cached_data = self._memory_cache[cache_key]
        if datetime.now() < cached_data['expires_at']:
            return cached_data['result']  # 命中！

    # Level 2: Firestore 缓存
    doc = self.db.collection("ember_global_cache") \
        .document(cache_key) \
        .get()

    if doc.exists:
        data = doc.to_dict()
        if datetime.now() < data['expires_at']:
            # 写回内存缓存
            self._memory_cache[cache_key] = {
                "result": data['result'],
                "expires_at": data['expires_at']
            }
            return data['result']  # 命中！

    return None  # 未命中

# 2. 写入缓存
async def set(self, cache_key, result, ttl_seconds=600):
    expires_at = datetime.now() + timedelta(seconds=ttl_seconds)

    # Level 1: 写入内存
    self._memory_cache[cache_key] = {
        "result": result,
        "expires_at": expires_at
    }

    # 限制内存缓存大小（最多1000条）
    if len(self._memory_cache) > 1000:
        oldest_key = min(...)
        del self._memory_cache[oldest_key]

    # Level 2: 写入 Firestore
    self.db.collection("ember_global_cache") \
        .document(cache_key) \
        .set({
            "result": result,
            "expires_at": expires_at,
            "created_at": datetime.now()
        })
```

### 缓存策略

| 模式 | 是否缓存 | TTL | 原因 |
|------|---------|-----|------|
| **default** | ✅ 是 | 10分钟 | 常见问题，复用率高 |
| **multi** | ✅ 是 | 10分钟 | 多模型结果稳定 |
| **ensemble** | ❌ 否 | - | 每次结果可能不同 |
| **batch** | ❌ 否 | - | 批量问题，复用率低 |

---

## 3. 用户预算设置

### 路径
```
user_budgets/{userId}
```

### 数据结构
```javascript
{
  daily_limit: 1.0,              // 每日限额（美元）
  monthly_limit: 30.0,           // 每月限额（可选）
  alerts_enabled: true,          // 是否启用预算告警
  updated_at: Timestamp
}
```

### 使用方法

```python
# cost_service.py::check_budget()

async def check_budget(user_id, estimated_cost):
    # 1. 获取用户预算设置
    budget_doc = self.db.collection("user_budgets") \
        .document(user_id) \
        .get()

    if budget_doc.exists:
        daily_limit = budget_doc.to_dict()['daily_limit']
    else:
        daily_limit = 1.0  # 默认 $1/天

    # 2. 获取今日已用
    stats = await self.get_usage_stats(user_id, "today")
    today_usage = stats["summary"]["total_cost"]

    # 3. 检查是否超预算
    if today_usage + estimated_cost > daily_limit:
        return False, f"预算不足。已用: ${today_usage:.4f}, 限额: ${daily_limit}"

    return True, None
```

---

## 4. 用户等级

### 路径
```
user_tiers/{userId}
```

### 数据结构
```javascript
{
  tier: "free",                  // free | basic | premium | enterprise
  updated_at: Timestamp
}
```

### 等级权限

```python
TIER_LIMITS = {
    "free": {
        "modes": ["default"],          # 仅快速问答
        "daily_requests": 10,           # 每日10次
        "max_tokens_per_request": 1000,
        "daily_budget": 0.10            # $0.10/天
    },
    "basic": {
        "modes": ["default", "multi"],  # 快速 + 专家会诊
        "daily_requests": 100,
        "daily_budget": 1.00            # $1/天
    },
    "premium": {
        "modes": ["default", "multi", "ensemble"],
        "daily_requests": 500,
        "daily_budget": 10.00           # $10/天
    },
    "enterprise": {
        "modes": ["all"],               # 所有模式含 batch
        "daily_requests": -1,           # 无限制
        "daily_budget": -1
    }
}
```

---

## 📁 完整 Firestore 结构

```
stanseproject/
└── (default database)/
    ├── users/
    │   ├── {userId}/                          (用户文档)
    │   │   ├── coordinates: {...}             (政治坐标)
    │   │   ├── email: "user@example.com"
    │   │   ├── createdAt: Timestamp
    │   │   │
    │   │   ├── chatHistory/                   (子集合 - 前端聊天历史)
    │   │   │   ├── {messageId1}/
    │   │   │   │   ├── question: "..."
    │   │   │   │   ├── answer: "..."
    │   │   │   │   ├── provider: "ember"
    │   │   │   │   ├── timestamp: "..."
    │   │   │   │   └── createdAt: Timestamp
    │   │   │   ├── {messageId2}/
    │   │   │   │   └── ...
    │   │   │   └── (最多5条，前端管理)
    │   │   │
    │   │   └── ember_cost_sessions/          (子集合 - Ember 成本追踪)
    │   │       ├── {sessionId1}/
    │   │       │   ├── timestamp: Timestamp(2026-01-25T01:20:00Z)
    │   │       │   ├── date: "2026-01-25"
    │   │       │   ├── cost: 0.000021
    │   │       │   ├── model: "models/gemini-2.5-flash"
    │   │       │   ├── mode: "default"
    │   │       │   ├── tokens: {prompt: 2, completion: 8, total: 104}
    │   │       │   └── execution_time: 4.054
    │   │       ├── {sessionId2}/
    │   │       │   └── ...
    │   │       └── (无数量限制，持续记录)
    │   │
    │   ├── {userId2}/
    │   │   └── ...
    │   └── ...
    │
    ├── ember_global_cache/                    (Ember 全局缓存)
    │   ├── {cacheKey1}/                       (MD5: a1b2c3d4...)
    │   │   ├── result: {
    │   │   │     success: true,
    │   │   │     answer: "AI是...",
    │   │   │     cost: 0.000089,
    │   │   │     tokens: {...},
    │   │   │     model_used: "models/gemini-2.5-flash",
    │   │   │     mode: "default",
    │   │   │     ...
    │   │   │   }
    │   │   ├── expires_at: Timestamp(+10min)
    │   │   └── created_at: Timestamp
    │   ├── {cacheKey2}/
    │   │   └── ...
    │   └── (自动过期清理)
    │
    ├── user_budgets/                          (用户预算设置)
    │   ├── {userId}/
    │   │   ├── daily_limit: 1.0               ($1/天)
    │   │   ├── monthly_limit: 30.0            ($30/月, 可选)
    │   │   ├── alerts_enabled: true
    │   │   └── updated_at: Timestamp
    │   └── ...
    │
    └── user_tiers/                            (用户等级)
        ├── {userId}/
        │   ├── tier: "free"                   (free|basic|premium|enterprise)
        │   └── updated_at: Timestamp
        └── ...
```

---

## 🔄 完整数据流示例

### 用户发送消息: "什么是AI?"

#### 1. 生成缓存键

```python
cache_key = cache_service.generate_cache_key(
    message="什么是ai？",  # 标准化为小写
    mode="default",
    user_context={
        "economic": -2.5,
        "social": 3.1,
        "label": "Social Democrat"
    }
)
# 返回: "a1b2c3d4e5f6789abcdef0123456789"
```

#### 2. 检查缓存

```python
# 查询 ember_global_cache/a1b2c3d4e5f6789abcdef0123456789
cached_result = await cache_service.get(cache_key)

if cached_result:
    # 缓存命中！直接返回
    return {
        ...cached_result,
        "from_cache": True
    }
```

#### 3. 调用 Ember AI（缓存未命中）

```python
result = ember_service.chat(
    message="什么是AI?",
    mode="default",
    user_context={...}
)

# 返回:
{
    "success": True,
    "answer": "AI是人工智能...",
    "cost": 0.000089,
    "tokens": {
        "prompt": 2,
        "completion": 8,
        "total": 104
    },
    "model_used": "models/gemini-2.5-flash",
    "mode": "default",
    "execution_time": 4.05
}
```

#### 4. 写入缓存

```python
# 写入 ember_global_cache/{cacheKey}
await cache_service.set(cache_key, result, ttl_seconds=600)

# Firestore 文档:
ember_global_cache/a1b2c3d4e5f6789abcdef0123456789:
{
  result: {...},  # 完整响应
  expires_at: Timestamp(+10分钟),
  created_at: Timestamp(当前)
}
```

#### 5. 记录成本

```python
# 写入 users/{userId}/ember_cost_sessions/{auto-id}
await cost_service.record_usage(
    user_id="LJVcsnNh9Ma3ktDY8JYDTdbqI803",
    cost=0.000089,
    metadata={
        "model": "models/gemini-2.5-flash",
        "mode": "default",
        "tokens": {"prompt": 2, "completion": 8, "total": 104},
        "execution_time": 4.05
    }
)

# Firestore 文档:
users/LJVcsnNh9Ma3ktDY8JYDTdbqI803/ember_cost_sessions/xyz789:
{
  timestamp: Timestamp,
  date: "2026-01-25",
  cost: 0.000089,
  model: "models/gemini-2.5-flash",
  mode: "default",
  tokens: {...},
  execution_time: 4.05
}
```

#### 6. 前端保存聊天历史

```typescript
// 写入 users/{userId}/chatHistory/{auto-id}
await saveChatMessage(
    userId,
    "什么是AI?",
    "AI是人工智能...",
    "ember"
)

// Firestore 文档:
users/LJVcsnNh9Ma3ktDY8JYDTdbqI803/chatHistory/abc456:
{
  question: "什么是AI?",
  answer: "AI是人工智能...",
  provider: "ember",
  timestamp: "2026-01-25T01:20:15Z",
  createdAt: Timestamp
}
```

---

## 📊 数据关系图

```
用户: LJVcsnNh9Ma3ktDY8JYDTdbqI803

users/{userId}/                           (用户主文档)
├── coordinates: {economic: -2.5, ...}    (政治坐标)
├── email: "user@example.com"
│
├── chatHistory/                          (前端 - 聊天历史)
│   ├── msg001: {q: "你好", a: "...", provider: "ember"}
│   ├── msg002: {...}
│   └── (最多5条)
│
└── ember_cost_sessions/                  (后端 - 成本追踪)
    ├── session001: {cost: 0.000021, mode: "default", ...}
    ├── session002: {cost: 0.017054, mode: "multi", ...}
    └── (无限制，持续记录)

ember_global_cache/                       (全局缓存，所有用户共享)
├── hash001: {result: {...}, expires_at: T+10min}
├── hash002: {...}
└── (定期清理过期)

user_budgets/                             (预算设置)
└── {userId}: {daily_limit: 1.0, ...}

user_tiers/                               (用户等级)
└── {userId}: {tier: "free", ...}
```

---

## 🔍 查询示例

### 查询用户今日成本

```python
# Python (后端)
query = db.collection("users") \
    .document("LJVcsnNh9Ma3ktDY8JYDTdbqI803") \
    .collection("ember_cost_sessions") \
    .where("date", "==", "2026-01-25") \
    .stream()

total_cost = sum(doc.to_dict()['cost'] for doc in query)
# 返回: 0.056
```

### 查询缓存

```python
# Python (后端)
doc = db.collection("ember_global_cache") \
    .document("a1b2c3d4e5f6789") \
    .get()

if doc.exists and datetime.now() < doc.to_dict()['expires_at']:
    # 缓存有效
    return doc.to_dict()['result']
```

---

## 🔐 Firestore Rules

**已添加规则** (`firestore.rules`):

```javascript
// Ember 成本追踪
match /users/{userId}/ember_cost_sessions/{sessionId} {
  // 用户可读自己的成本数据
  allow read: if request.auth != null && request.auth.uid == userId;
  // Cloud Function 可写
  allow write: if true;
}

// Ember 全局缓存
match /ember_global_cache/{cacheKey} {
  allow read: if request.auth != null;  // 认证用户可读
  allow write: if true;                 // Cloud Function 可写
}

// 用户预算
match /user_budgets/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

// 用户等级
match /user_tiers/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false;  // 仅管理员
}
```

---

## 📈 数据增长估算

### 1000 用户，每人每天 10 次请求

**用户成本记录**:
```
每日新增: 1000 × 10 = 10,000 条
每月新增: 10,000 × 30 = 300,000 条
每条大小: ~200 bytes
月度存储: 300,000 × 200 = 60MB

成本: 60MB × $0.18/GB = $0.01/月 (几乎免费)
```

**全局缓存**:
```
唯一问题数: ~1,000-5,000 (缓存命中后复用)
每条大小: ~1KB (包含完整响应)
总存储: 5,000 × 1KB = 5MB

成本: 5MB × $0.18/GB ≈ $0.001/月 (几乎免费)
```

**读写成本**:
```
每日写入: 10,000 (成本记录) + 500 (新缓存) = 10,500
写入成本: 10,500 × 30 × $0.18/100K = $0.57/月

每日读取: 10,000 (检查缓存) + 3,000 (命中) = 13,000
读取成本: 13,000 × 30 × $0.06/100K = $0.23/月

总 Firestore 成本: ~$0.80/月
```

---

## ✅ 与前端聊天历史的关系

### 同一个 users collection 下的两个子集合

```
users/{userId}/
├── chatHistory/                  ← 前端管理（最多5条）
│   └── 存储: 完整问题和答案
│
└── ember_cost_sessions/          ← 后端管理（无限制）
    └── 存储: 仅元数据（cost, tokens, model）
```

**关键区别**:

| 项目 | chatHistory | ember_cost_sessions |
|------|-------------|---------------------|
| **管理者** | 前端 (saveChatMessage) | 后端 (cost_service) |
| **数量限制** | 5条 | 无限制 |
| **存储内容** | 问题 + 答案 | 仅元数据 |
| **目的** | 显示历史对话 | 成本统计和分析 |
| **SDK** | Firebase Client SDK | Firebase Admin SDK |
| **清理策略** | 超过5条删最旧 | 不自动清理（或90天后） |

**隐私保护**:
- ✅ chatHistory: 存储完整对话（用户可见可删除）
- ✅ ember_cost_sessions: **不存储**问题和答案（仅元数据）

---

## 🎯 总结

### Ember 在 stanseproject Firestore 中的结构

**4个主要部分**:

1. **`users/{userId}/ember_cost_sessions`** (子集合)
   - 用途: 成本追踪
   - 数据: 成本、tokens、模型、执行时间
   - 特点: 按用户隔离，无限记录

2. **`ember_global_cache`** (独立集合)
   - 用途: 响应缓存
   - 数据: 完整 API 响应
   - 特点: 全局共享，10分钟TTL

3. **`user_budgets`** (独立集合)
   - 用途: 预算管理
   - 数据: 每日/月限额
   - 特点: 每用户一条

4. **`user_tiers`** (独立集合)
   - 用途: 用户等级
   - 数据: free/basic/premium/enterprise
   - 特点: 每用户一条

**设计原则**:
- ✅ 用户数据在 `users` 下（成本追踪）
- ✅ 共享数据独立（全局缓存）
- ✅ 配置数据独立（预算、等级）
- ✅ 与前端数据共存（chatHistory + ember_cost_sessions）

---

**文档状态**: ✅ 完成
**数据库**: stanseproject Firestore
**最后更新**: 2026-01-25 01:25
