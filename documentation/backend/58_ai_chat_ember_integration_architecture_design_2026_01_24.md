# AI Chat Assistant - Ember 集成完整架构设计

**文档编号**: 58
**创建日期**: 2026-01-24
**作者**: Claude Code Assistant
**类型**: 架构设计 (深度思考)
**状态**: 🎨 设计阶段

---

## 📋 目录

1. [现状分析](#1-现状分析)
2. [Ember 能力全景](#2-ember-能力全景)
3. [核心架构设计](#3-核心架构设计)
4. [多用户场景设计](#4-多用户场景设计)
5. [API 接口设计](#5-api-接口设计)
6. [安全性架构](#6-安全性架构)
7. [性能优化策略](#7-性能优化策略)
8. [成本管理方案](#8-成本管理方案)
9. [实施路线图](#9-实施路线图)

---

## 1. 现状分析

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                               │
│  components/ai-chat/                                        │
│  ├── AIChatSidebar.tsx       (主聊天界面)                    │
│  ├── ProviderSelector.tsx    (LLM 提供商选择)                │
│  └── ChatBubble.tsx          (消息显示)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    服务层 (TypeScript)                       │
│  services/llm/                                              │
│  ├── llmService.ts           (LLM 服务单例)                  │
│  ├── llmProvider.ts          (基础接口)                      │
│  └── providers/                                             │
│      ├── GeminiProvider.ts   (✅ 通过 API 代理)             │
│      ├── ChatGPTProvider.ts  (⚠️ 需用户提供 API key)        │
│      ├── ClaudeProvider.ts   (⚠️ 需用户提供 API key)        │
│      └── LocalProvider.ts    (⚠️ 本地模型)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    外部 API                                  │
│  - Gemini API (通过 /api/gemini 代理)                       │
│  - OpenAI API (用户自带 key)                                │
│  - Anthropic API (用户自带 key)                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 现有问题

| 问题类别 | 具体问题 | 影响 |
|---------|---------|------|
| **功能局限** | 仅支持单模型单次对话 | 无法利用多模型优势 |
| **性能** | 无并行处理能力 | 响应慢,无法批量处理 |
| **成本** | 无成本追踪和优化 | 无法控制费用 |
| **安全** | API keys 在环境变量 | 安全性不足 |
| **扩展性** | 紧耦合前端实现 | 难以添加高级功能 |
| **用户体验** | 单一对话模式 | 无法满足多样化需求 |

### 1.3 用户需求场景分析

基于现有 AI Chat Assistant 的使用场景,用户需求可分为:

#### 场景 1: 快速问答 (70% 用户)
- **需求**: 快速获得答案
- **特点**: 短问题,简单回答
- **当前方案**: ✅ Gemini Flash (快速+便宜)
- **Ember 增强**: 自动选择最快模型

#### 场景 2: 深度分析 (20% 用户)
- **需求**: 获得高质量、深度的回答
- **特点**: 复杂问题,需要推理
- **当前方案**: ⚠️ 单模型,质量不稳定
- **Ember 增强**: Ensemble (多模型投票)

#### 场景 3: 多语言翻译 (5% 用户)
- **需求**: 准确的多语言翻译
- **特点**: 专业术语,上下文理解
- **当前方案**: ⚠️ 单模型,可能不准确
- **Ember 增强**: 多模型对比 + 专家评判

#### 场景 4: 批量处理 (3% 用户)
- **需求**: 处理多个相似问题
- **特点**: 重复性任务
- **当前方案**: ❌ 不支持
- **Ember 增强**: XCS 并行 + Data API

#### 场景 5: 个性化推荐 (2% 用户)
- **需求**: 基于用户 profile 的推荐
- **特点**: 需要理解用户政治倾向
- **当前方案**: ⚠️ 简单 context 传递
- **Ember 增强**: Operators 管道 + 上下文增强

---

## 2. Ember 能力全景

基于测试报告,Ember 提供 9 大核心能力:

### 2.1 Models API - 直接 LLM 访问 ✅

**能力**:
- 统一接口访问多个 LLM 提供商
- 自动成本追踪 (Token 使用 + 价格)
- 可复用实例配置 (temperature, max_tokens)
- 详细响应元数据

**使用场景**:
```python
# 场景 1: 快速问答
response = models("gemini-2.5-flash", user_question)

# 场景 2: 高质量回答
response = models("gpt-5", complex_question)

# 场景 3: 获取详细信息
response_obj = models.response("gpt-4o", question)
print(f"成本: ${response_obj.usage['cost']}")
```

**AI Chat 应用**:
- 替代现有 GeminiProvider
- 自动选择最佳模型
- 实时成本追踪

### 2.2 Operators API - 可组合构建块 ✅

**能力**:
- `@op` 装饰器创建可复用操作
- `operators.chain()` 组合多个步骤
- 函数调用组合 (推荐方式)

**使用场景**:
```python
@op
def analyze_question(text: str) -> str:
    """分析问题类型"""
    return models("gemini-2.5-flash", f"分析问题类型: {text}")

@op
def generate_answer(analysis: str, question: str) -> str:
    """根据分析生成答案"""
    return models("gpt-5", f"基于分析: {analysis}\n回答: {question}")

@op
def user_aware_pipeline(question: str, user_profile: dict) -> str:
    """个性化问答管道"""
    # 步骤 1: 分析问题
    analysis = analyze_question(question)

    # 步骤 2: 生成基础答案
    base_answer = generate_answer(analysis, question)

    # 步骤 3: 根据用户 profile 调整
    context = format_user_profile(user_profile)
    final_answer = models(
        "claude-4-sonnet",
        f"调整答案以匹配用户画像:\n{context}\n原答案:{base_answer}"
    )

    return final_answer
```

**AI Chat 应用**:
- 个性化问答管道
- 多步骤处理 (分析 → 回答 → 优化)
- 可复用的处理逻辑

### 2.3 Data API - 流式管道 ✅

**能力**:
- 批量加载数据集 (42 个内置数据集)
- 流式处理大量数据
- 高效的数据管道

**使用场景**:
```python
# 批量处理用户问题
questions = [
    "什么是 AI?",
    "什么是量子计算?",
    "什么是区块链?"
]

# 批量处理
for q in questions:
    answer = models("gemini-2.5-flash", q)
    save_to_cache(q, answer)
```

**AI Chat 应用**:
- 批量问答模式
- FAQ 自动生成
- 知识库预填充

### 2.4 XCS API - 自动优化 ✅

**能力**:
- `@xcs.jit` JIT 编译优化
- `xcs.vmap()` 向量化并行处理
- 自动检测并行机会

**使用场景**:
```python
@xcs.jit
def batch_process_questions(questions: list) -> list:
    """JIT 优化的批量处理"""
    return [models("gemini-2.5-flash", q) for q in questions]

# 向量化处理
vmapped_chat = xcs.vmap(lambda q: models("gemini-2.5-flash", q))
answers = vmapped_chat(questions)  # 自动并行
```

**AI Chat 应用**:
- 高并发用户请求处理
- 批量问答加速
- 自动性能优化

### 2.5 NON - Compound AI 系统 ✅

**能力**:
- 构建"网络的网络"(NON)
- Ensemble (集成多个模型)
- Judge (评判器)
- Verifier (验证器)

**使用场景**:
```python
from ember.non import build_graph

# 5 个 GPT-4o + Claude 评判
system = build_graph([
    "5E@openai/gpt-4o(temp=0.7)",     # 5 个集成候选
    "1J@anthropic/claude-4-sonnet"    # Claude 评判综合
])

# 复杂问题获得高质量答案
result = system(query="AI 的未来发展方向?")
```

**AI Chat 应用**:
- 高质量问答模式
- 事实核查
- 多视角分析

### 2.6 多模型对比 ✅

**能力**:
- 同时调用多个模型
- 对比不同模型的回答
- 让用户选择最佳答案

**使用场景**:
```python
models_to_compare = ["gpt-5", "gemini-2.5-flash", "claude-4-sonnet"]

responses = {}
for model in models_to_compare:
    responses[model] = models(model, user_question)

# 返回所有答案供用户选择
return responses
```

**AI Chat 应用**:
- "专家会诊"模式
- 对比不同 LLM 的观点
- 增强用户信任

### 2.7 批量处理 ✅

**能力**:
- 高效处理多个问题
- 自动并行化
- 成本优化 (使用便宜模型)

**使用场景**:
```python
from concurrent.futures import ThreadPoolExecutor

def batch_chat(questions: list, model: str = "gemini-2.5-flash"):
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(models, model, q) for q in questions]
        return [f.result() for f in futures]
```

**AI Chat 应用**:
- FAQ 批量生成
- 知识库构建
- 数据预处理

### 2.8 内容处理管道 ✅

**能力**:
- 总结 → 翻译 → 优化 多步骤管道
- 可复用的处理流程
- 自动错误处理

**使用场景**:
```python
@op
def summarize(text: str) -> str:
    return models("gpt-4o", f"总结: {text}")

@op
def translate(text: str, target_lang: str) -> str:
    return models("gemini-2.5-flash", f"翻译成{target_lang}: {text}")

@op
def content_pipeline(text: str, target_lang: str) -> str:
    summary = summarize(text)
    translated = translate(summary, target_lang)
    return translated
```

**AI Chat 应用**:
- 长文本总结
- 多语言翻译
- 内容优化

### 2.9 性能和成本追踪 ✅

**能力**:
- 实时 Token 使用统计
- 精确成本计算
- 提供商成本对比

**使用场景**:
```python
response = models.response("gpt-5", question)

# 获取详细成本信息
print(f"Prompt Tokens: {response.usage['prompt_tokens']}")
print(f"Completion Tokens: {response.usage['completion_tokens']}")
print(f"Total Cost: ${response.usage['cost']:.6f}")

# 决策: 如果成本过高,切换到便宜模型
if response.usage['cost'] > 0.01:
    response = models("gemini-2.5-flash", question)
```

**AI Chat 应用**:
- 用户成本透明化
- 自动成本优化
- 预算控制

### 2.10 Ensemble 执行 ✅

**能力**:
- 并行调用多个模型实例
- 评判器综合多个答案
- 获得最佳质量结果

**使用场景**:
```python
from concurrent.futures import ThreadPoolExecutor

question = "AI 的最大挑战是什么?"

# 并行调用 5 个模型
with ThreadPoolExecutor(max_workers=5) as executor:
    model_calls = [
        ("gpt-5", question),
        ("gpt-5", question),
        ("gpt-5", question),
        ("gemini-2.5-flash", question),
        ("claude-4-sonnet", question),
    ]
    futures = [executor.submit(models, m, q) for m, q in model_calls]
    candidates = [f.result() for f in futures]

# Claude 评判综合
judge_prompt = f"""综合以下 5 个答案,给出最佳回答:

问题: {question}

答案:
1. (GPT-5) {candidates[0]}
2. (GPT-5) {candidates[1]}
3. (GPT-5) {candidates[2]}
4. (Gemini) {candidates[3]}
5. (Claude) {candidates[4]}

请综合后给出答案:"""

final_answer = models("claude-4-sonnet", judge_prompt)
```

**AI Chat 应用**:
- "终极问答"模式
- 高质量、高可信度回答
- 重要决策辅助

---

## 3. 核心架构设计

### 3.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          前端层 (React/TypeScript)                │
│                                                                  │
│  components/ai-chat/                                             │
│  ├── AIChatSidebar.tsx                                          │
│  │   ├── 基础聊天模式 (default)                                  │
│  │   ├── 专家会诊模式 (multi-model)                              │
│  │   ├── 深度分析模式 (ensemble)                                 │
│  │   ├── 批量问答模式 (batch)                                    │
│  │   └── 成本追踪显示                                            │
│  │                                                               │
│  ├── ChatModeSelector.tsx (NEW)                                 │
│  │   └── 让用户选择聊天模式                                      │
│  │                                                               │
│  └── CostTracker.tsx (NEW)                                      │
│      └── 实时显示成本和 token 使用                               │
└─────────────────────┬────────────────────────────────────────────┘
                      │
                      │ HTTP/HTTPS
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Ember API 层 (Python/Cloud Run)               │
│                                                                  │
│  functions/ember-api/                                           │
│  ├── main.py                      (Flask/FastAPI 入口)          │
│  ├── routes/                                                    │
│  │   ├── chat.py                 (基础聊天 API)                 │
│  │   ├── multi_model.py          (多模型对比 API)               │
│  │   ├── ensemble.py             (Ensemble API)                │
│  │   ├── batch.py                (批量处理 API)                 │
│  │   └── cost.py                 (成本统计 API)                 │
│  │                                                               │
│  ├── services/                                                  │
│  │   ├── ember_service.py        (Ember 核心服务)               │
│  │   ├── chat_service.py         (聊天逻辑)                     │
│  │   ├── ensemble_service.py     (Ensemble 逻辑)               │
│  │   └── cost_service.py         (成本追踪)                     │
│  │                                                               │
│  └── utils/                                                     │
│      ├── secret_manager.py       (Secret Manager 集成)          │
│      ├── user_context.py         (用户上下文管理)               │
│      └── cache.py                (Redis 缓存)                   │
└─────────────────────┬────────────────────────────────────────────┘
                      │
                      │ Secret Manager API
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│              Google Cloud Secret Manager                         │
│                                                                  │
│  Secrets (gen-lang-client-0960644135):                         │
│  ├── ember-openai-api-key      → OpenAI GPT-5                  │
│  ├── ember-google-api-key      → Google Gemini                 │
│  └── ember-anthropic-api-key   → Anthropic Claude              │
└─────────────────────┬────────────────────────────────────────────┘
                      │
                      │ LLM API Calls
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Ember Framework                             │
│                                                                  │
│  ├── Models API       → 统一 LLM 访问                            │
│  ├── Operators API    → 可组合管道                              │
│  ├── Data API         → 批量处理                                │
│  ├── XCS API          → 自动优化                                │
│  └── NON API          → Compound AI                            │
└─────────────────────┬────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                    外部 LLM 提供商                                │
│                                                                  │
│  ├── OpenAI API       (gpt-5, gpt-4o)                          │
│  ├── Google AI API    (gemini-2.5-flash, gemini-2.5-pro)      │
│  └── Anthropic API    (claude-4-sonnet, claude-opus-4)        │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流设计

#### 3.2.1 基础聊天流程

```
用户输入问题
    │
    ▼
前端 AIChatSidebar
    │
    ├─ 添加用户画像 context
    ├─ 选择聊天模式 (default/multi/ensemble/batch)
    │
    ▼
POST /api/ember/chat
    │
    ├─ 请求体:
    │   {
    │     "message": "用户问题",
    │     "mode": "default",  // default | multi | ensemble | batch
    │     "user_context": {
    │       "economic": -2.5,
    │       "social": 3.1,
    │       "diplomatic": 1.2,
    │       "label": "Moderate Liberal"
    │     },
    │     "language": "ZH",
    │     "model_preference": "auto"  // auto | fast | quality | balanced
    │   }
    │
    ▼
Ember API (Python)
    │
    ├─ 从 Secret Manager 获取 API keys
    ├─ 根据 mode 选择处理策略:
    │
    ├─ Mode: default (70% 用户)
    │   │
    │   ├─ 自动选择模型:
    │   │   • 短问题 (<50字) → gemini-2.5-flash (快速)
    │   │   • 长问题 (>50字) → gpt-4o (平衡)
    │   │   • 复杂问题 (包含"分析"/"为什么") → gpt-5 (深度)
    │   │
    │   ├─ 构建 prompt (包含用户 context)
    │   ├─ 调用 Ember Models API
    │   └─ 返回答案 + 成本信息
    │
    ├─ Mode: multi (20% 用户)
    │   │
    │   ├─ 并行调用 3 个模型:
    │   │   • gpt-5 (最强推理)
    │   │   • gemini-2.5-flash (快速)
    │   │   • claude-4-sonnet (编程/分析)
    │   │
    │   ├─ 使用 ThreadPoolExecutor 并行
    │   └─ 返回 3 个答案供用户选择
    │
    ├─ Mode: ensemble (5% 用户)
    │   │
    │   ├─ Ensemble 配置:
    │   │   • 3x gpt-5 (高质量候选)
    │   │   • 2x gemini-2.5-flash (快速候选)
    │   │   • 1x claude-4-sonnet (评判)
    │   │
    │   ├─ 并行调用所有候选模型
    │   ├─ Claude 评判综合答案
    │   └─ 返回最终答案 + 候选答案
    │
    └─ Mode: batch (3% 用户)
        │
        ├─ 使用 XCS vmap 并行处理
        ├─ 批量调用 gemini-2.5-flash
        └─ 返回所有答案
```

#### 3.2.2 成本追踪流程

```
每次 LLM 调用
    │
    ▼
models.response() 返回详细信息
    │
    ├─ response.text          (答案文本)
    ├─ response.model_id      (实际使用的模型)
    ├─ response.usage         (使用统计)
    │   ├─ prompt_tokens      (输入 token 数)
    │   ├─ completion_tokens  (输出 token 数)
    │   ├─ total_tokens       (总 token 数)
    │   └─ cost               (本次成本 $)
    │
    ▼
存储到 Firestore
    │
    ├─ 集合: user_chat_costs/{userId}/sessions/{sessionId}
    ├─ 字段:
    │   {
    │     "timestamp": "2026-01-24T21:00:00Z",
    │     "model": "gpt-5",
    │     "prompt_tokens": 150,
    │     "completion_tokens": 300,
    │     "total_tokens": 450,
    │     "cost": 0.00315,
    │     "mode": "ensemble",
    │     "question": "AI的未来发展?",
    │     "answer_length": 1200
    │   }
    │
    ▼
返回给前端
    │
    ├─ 实时显示本次成本
    ├─ 累计成本统计
    └─ 成本趋势图表
```

### 3.3 组件设计

#### 3.3.1 前端新增组件

##### ChatModeSelector.tsx

```typescript
interface ChatMode {
  id: 'default' | 'multi' | 'ensemble' | 'batch';
  name: string;
  description: string;
  icon: React.ReactNode;
  costLevel: 'low' | 'medium' | 'high';
  speed: 'fast' | 'medium' | 'slow';
  quality: 'good' | 'better' | 'best';
}

const CHAT_MODES: ChatMode[] = [
  {
    id: 'default',
    name: '快速问答',
    description: '最快速,适合简单问题',
    icon: <Zap />,
    costLevel: 'low',
    speed: 'fast',
    quality: 'good'
  },
  {
    id: 'multi',
    name: '专家会诊',
    description: '3个AI同时回答,对比观点',
    icon: <Users />,
    costLevel: 'medium',
    speed: 'medium',
    quality: 'better'
  },
  {
    id: 'ensemble',
    name: '深度分析',
    description: '6个AI协作,最高质量',
    icon: <Brain />,
    costLevel: 'high',
    speed: 'slow',
    quality: 'best'
  },
  {
    id: 'batch',
    name: '批量处理',
    description: '同时处理多个问题',
    icon: <List />,
    costLevel: 'medium',
    speed: 'fast',
    quality: 'good'
  }
];
```

##### CostTracker.tsx

```typescript
interface CostInfo {
  currentSessionCost: number;    // 本次会话成本
  todayCost: number;              // 今日总成本
  monthCost: number;              // 本月总成本
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  modelUsage: {
    [model: string]: {
      calls: number;
      cost: number;
    };
  };
}

// 显示:
// 💰 本次: $0.0032 | 今日: $0.12 | 本月: $3.45
// 📊 Tokens: 450 (150 in + 300 out)
// 🤖 GPT-5: 5次 ($0.08) | Gemini: 12次 ($0.04)
```

#### 3.3.2 后端服务设计

##### ember_service.py

```python
"""
Ember 核心服务
负责所有 Ember 相关的操作
"""

from ember.api import models, op, operators, data, xcs
from ember.non import build_graph
from ember.core.secret_manager import get_provider_api_key
import os

class EmberService:
    """Ember 框架封装服务"""

    def __init__(self):
        # 确保 API keys 从 Secret Manager 加载
        self._ensure_api_keys()

    def _ensure_api_keys(self):
        """从 Secret Manager 加载 API keys 到环境变量"""
        # Ember 会自动从 Secret Manager 读取
        # 无需额外操作,credentials.py 已实现
        pass

    def chat(
        self,
        message: str,
        mode: str = "default",
        user_context: dict = None,
        language: str = "ZH",
        model_preference: str = "auto"
    ) -> dict:
        """
        统一聊天接口

        Args:
            message: 用户消息
            mode: 模式 (default/multi/ensemble/batch)
            user_context: 用户画像
            language: 语言
            model_preference: 模型偏好 (auto/fast/quality/balanced)

        Returns:
            {
                "success": bool,
                "answer": str或list,
                "cost": float,
                "tokens": {...},
                "model_used": str,
                "mode": str
            }
        """

        if mode == "default":
            return self._default_chat(message, user_context, language, model_preference)
        elif mode == "multi":
            return self._multi_model_chat(message, user_context, language)
        elif mode == "ensemble":
            return self._ensemble_chat(message, user_context, language)
        elif mode == "batch":
            return self._batch_chat(message, user_context, language)
        else:
            raise ValueError(f"Unknown mode: {mode}")

    def _default_chat(self, message, user_context, language, model_preference):
        """默认聊天模式 - 自动选择最佳模型"""

        # 自动选择模型
        model = self._select_model(message, model_preference)

        # 构建 prompt
        prompt = self._build_prompt(message, user_context, language)

        # 调用 Ember
        response = models.response(model, prompt)

        return {
            "success": True,
            "answer": response.text,
            "cost": response.usage['cost'],
            "tokens": {
                "prompt": response.usage['prompt_tokens'],
                "completion": response.usage['completion_tokens'],
                "total": response.usage['total_tokens']
            },
            "model_used": response.model_id,
            "mode": "default"
        }

    def _multi_model_chat(self, message, user_context, language):
        """多模型对比模式"""
        from concurrent.futures import ThreadPoolExecutor

        models_to_use = [
            "gpt-5",
            "gemini-2.5-flash",
            "claude-4-sonnet"
        ]

        prompt = self._build_prompt(message, user_context, language)

        def call_model(model_name):
            response = models.response(model_name, prompt)
            return {
                "model": response.model_id,
                "answer": response.text,
                "cost": response.usage['cost'],
                "tokens": response.usage['total_tokens']
            }

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(call_model, m) for m in models_to_use]
            results = [f.result() for f in futures]

        total_cost = sum(r['cost'] for r in results)

        return {
            "success": True,
            "answer": results,  # 返回多个答案
            "cost": total_cost,
            "tokens": {"total": sum(r['tokens'] for r in results)},
            "model_used": "multi",
            "mode": "multi"
        }

    def _ensemble_chat(self, message, user_context, language):
        """Ensemble 模式 - 最高质量"""
        from concurrent.futures import ThreadPoolExecutor

        prompt = self._build_prompt(message, user_context, language)

        # 5 个候选模型
        model_calls = [
            ("gpt-5", prompt),
            ("gpt-5", prompt),
            ("gpt-5", prompt),
            ("gemini-2.5-flash", prompt),
            ("gemini-2.5-flash", prompt),
        ]

        def call_model(model_name, prompt_text):
            return models(model_name, prompt_text)

        # 并行调用
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(call_model, m, p) for m, p in model_calls]
            candidates = [f.result() for f in futures]

        # Claude 评判
        judge_prompt = f"""综合以下 5 个 AI 的答案,给出最佳回答:

问题: {message}

答案:
1. (GPT-5) {candidates[0]}
2. (GPT-5) {candidates[1]}
3. (GPT-5) {candidates[2]}
4. (Gemini) {candidates[3]}
5. (Gemini) {candidates[4]}

请综合后给出最佳答案:"""

        final_response = models.response("claude-4-sonnet", judge_prompt)

        # 计算总成本 (5次候选 + 1次评判)
        total_cost = final_response.usage['cost']  # 简化,实际需累加

        return {
            "success": True,
            "answer": final_response.text,
            "candidates": candidates,  # 也返回候选答案
            "cost": total_cost,
            "tokens": {"total": final_response.usage['total_tokens']},
            "model_used": "ensemble (3xGPT-5 + 2xGemini + Claude)",
            "mode": "ensemble"
        }

    def _select_model(self, message: str, preference: str) -> str:
        """智能选择模型"""

        if preference == "fast":
            return "gemini-2.5-flash"
        elif preference == "quality":
            return "gpt-5"
        elif preference == "balanced":
            return "gpt-4o"

        # auto - 根据问题自动选择
        msg_len = len(message)

        # 短问题 (<50字) - 快速模型
        if msg_len < 50:
            return "gemini-2.5-flash"

        # 包含深度关键词 - 高质量模型
        deep_keywords = ["为什么", "分析", "解释", "原因", "如何", "评价"]
        if any(kw in message for kw in deep_keywords):
            return "gpt-5"

        # 默认 - 平衡模型
        return "gpt-4o"

    def _build_prompt(self, message: str, user_context: dict, language: str) -> str:
        """构建包含用户上下文的 prompt"""

        if not user_context:
            return message

        context_text = f"""用户政治画像:
- 经济观点: {user_context.get('economic', 0)} ({'左倾' if user_context.get('economic', 0) < 0 else '右倾'})
- 社会观点: {user_context.get('social', 0)} ({'威权' if user_context.get('social', 0) < 0 else '自由'})
- 外交观点: {user_context.get('diplomatic', 0)} ({'民族' if user_context.get('diplomatic', 0) < 0 else '国际'})
- 标签: {user_context.get('label', 'Unknown')}

请基于用户的政治倾向,提供平衡、尊重的回答。

用户问题: {message}"""

        return context_text
```

---

## 4. 多用户场景设计

### 4.1 场景矩阵

| 用户需求 | 推荐模式 | Ember 能力 | 预期成本 | 响应时间 |
|---------|---------|-----------|---------|---------|
| **快速问答** | default (auto) | Models API | $0.0001-0.001 | <2秒 |
| **深度分析** | ensemble | NON + Ensemble | $0.005-0.02 | 5-10秒 |
| **多视角对比** | multi | Models API + 并行 | $0.002-0.005 | 3-5秒 |
| **批量处理** | batch | XCS + vmap | $0.001-0.01 | 2-5秒 |
| **个性化推荐** | default + operators | Operators管道 | $0.001-0.003 | 2-4秒 |
| **事实核查** | ensemble | Ensemble验证 | $0.01-0.03 | 8-12秒 |
| **多语言翻译** | multi | 多模型对比 | $0.002-0.005 | 3-5秒 |

### 4.2 场景详细设计

#### 场景 1: 政治观点问答 (核心场景)

**用户输入**: "你对自由贸易的看法是什么?"

**处理流程**:

```python
# 步骤 1: 分析用户画像
user_context = {
    "economic": -2.5,  # 偏左经济观
    "social": 3.1,     # 自由社会观
    "diplomatic": 1.2, # 偏国际主义
    "label": "Social Democrat"
}

# 步骤 2: 选择模式
# 政治相关 → ensemble (高质量,多视角)
mode = "ensemble"

# 步骤 3: 构建个性化 prompt
@op
def build_political_prompt(question, user_profile):
    """构建政治相关问题的 prompt"""
    return f"""用户画像: {user_profile['label']}

经济立场: {user_profile['economic']} (偏{get_tendency(user_profile['economic'], 'economic')})

请回答以下问题,提供平衡、多角度的分析:
{question}

要求:
1. 列举不同政治立场的观点
2. 分析各观点的优缺点
3. 避免政治偏见
4. 提供事实依据"""

# 步骤 4: Ensemble 执行
response = ember_service.chat(
    message="你对自由贸易的看法是什么?",
    mode="ensemble",
    user_context=user_context,
    language="ZH"
)

# 返回结果:
{
    "answer": "关于自由贸易,存在多种观点:\n\n1. 自由市场派...\n2. 保护主义派...\n3. 中间路线...",
    "candidates": [...],  # 5个候选答案
    "cost": 0.015,
    "model_used": "ensemble",
    "quality_score": 0.95
}
```

#### 场景 2: 品牌推荐 (个性化)

**用户输入**: "推荐几个符合我价值观的咖啡品牌"

**处理流程**:

```python
# 使用 Operators 管道
@op
def analyze_user_values(user_profile):
    """分析用户价值观"""
    prompt = f"基于用户画像 {user_profile},总结其核心价值观"
    return models("gpt-4o", prompt)

@op
def find_matching_brands(values, category):
    """查找匹配品牌"""
    prompt = f"基于价值观 {values},推荐{category}品牌"
    return models("gemini-2.5-flash", prompt)

@op
def explain_recommendations(brands, user_profile):
    """解释推荐理由"""
    prompt = f"解释为何推荐这些品牌给 {user_profile['label']} 用户: {brands}"
    return models("claude-4-sonnet", prompt)

@op
def brand_recommendation_pipeline(user_profile, category):
    """完整推荐管道"""
    values = analyze_user_values(user_profile)
    brands = find_matching_brands(values, category)
    explanation = explain_recommendations(brands, user_profile)
    return {
        "brands": brands,
        "explanation": explanation,
        "values_matched": values
    }

# 执行
result = brand_recommendation_pipeline(user_context, "咖啡")
```

#### 场景 3: 批量 FAQ 生成

**用户输入**: "生成10个关于政治光谱的常见问题和答案"

**处理流程**:

```python
# 使用 Data API + XCS vmap
questions = [
    "什么是政治光谱?",
    "左翼和右翼的区别?",
    "如何确定自己的政治立场?",
    # ... 10个问题
]

# 批量处理
@xcs.jit
def batch_generate_answers(questions):
    """JIT 优化的批量问答"""
    return [models("gemini-2.5-flash", q) for q in questions]

# 或使用 vmap 并行
vmapped_chat = xcs.vmap(lambda q: models("gemini-2.5-flash", q))
answers = vmapped_chat(questions)

# 成本: ~$0.01 (使用便宜的 Gemini)
# 时间: ~3秒 (并行执行)
```

#### 场景 4: 多语言支持

**用户输入**: "Translate this political statement to English, French, and Spanish"

**处理流程**:

```python
# 多模型并行翻译
languages = ["English", "French", "Spanish"]

def translate_to_language(text, target_lang):
    prompt = f"Translate to {target_lang}: {text}"
    return models("gemini-2.5-flash", prompt)

# 并行翻译
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor(max_workers=3) as executor:
    futures = [
        executor.submit(translate_to_language, original_text, lang)
        for lang in languages
    ]
    translations = [f.result() for f in futures]

# 返回 3 种语言的翻译
# 成本: ~$0.003
# 时间: ~2秒 (并行)
```

### 4.3 用户分层策略

```python
class UserTier:
    """用户等级定义"""

    FREE = "free"           # 免费用户
    BASIC = "basic"         # 基础付费
    PREMIUM = "premium"     # 高级付费
    ENTERPRISE = "enterprise"  # 企业用户

# 不同等级的功能权限
TIER_LIMITS = {
    UserTier.FREE: {
        "modes": ["default"],           # 仅基础模式
        "daily_requests": 10,            # 每日10次
        "max_tokens": 1000,              # 最多1000 tokens
        "models": ["gemini-2.5-flash"],  # 仅 Gemini
        "daily_budget": 0.10             # 每日$0.10预算
    },
    UserTier.BASIC: {
        "modes": ["default", "multi"],   # 基础+多模型
        "daily_requests": 100,
        "max_tokens": 5000,
        "models": ["gemini-2.5-flash", "gpt-4o"],
        "daily_budget": 1.00
    },
    UserTier.PREMIUM: {
        "modes": ["default", "multi", "ensemble"],
        "daily_requests": 500,
        "max_tokens": 20000,
        "models": ["all"],               # 所有模型
        "daily_budget": 10.00
    },
    UserTier.ENTERPRISE: {
        "modes": ["all"],
        "daily_requests": -1,            # 无限制
        "max_tokens": -1,
        "models": ["all"],
        "daily_budget": -1               # 无限制
    }
}

def check_user_permission(user_tier, mode, daily_usage):
    """检查用户权限"""
    limits = TIER_LIMITS[user_tier]

    # 检查模式权限
    if mode not in limits["modes"] and "all" not in limits["modes"]:
        return False, "此模式需要升级会员"

    # 检查请求次数
    if limits["daily_requests"] != -1 and daily_usage >= limits["daily_requests"]:
        return False, "今日请求次数已用完"

    return True, None
```

---

## 5. API 接口设计

### 5.1 RESTful API 规范

#### 5.1.1 基础聊天 API

**端点**: `POST /api/ember/chat`

**请求体**:
```json
{
  "message": "你对全球化的看法?",
  "mode": "ensemble",
  "user_context": {
    "economic": -2.5,
    "social": 3.1,
    "diplomatic": 1.2,
    "label": "Social Democrat"
  },
  "language": "ZH",
  "model_preference": "auto",
  "options": {
    "include_candidates": true,
    "include_cost": true,
    "stream": false
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "answer": "关于全球化,有多种观点...",
    "candidates": [
      {
        "model": "gpt-5",
        "answer": "...",
        "confidence": 0.92
      },
      {
        "model": "gemini-2.5-flash",
        "answer": "...",
        "confidence": 0.88
      },
      {
        "model": "claude-4-sonnet",
        "answer": "...",
        "confidence": 0.95
      }
    ],
    "metadata": {
      "mode": "ensemble",
      "models_used": ["gpt-5", "gpt-5", "gpt-5", "gemini-2.5-flash", "gemini-2.5-flash", "claude-4-sonnet"],
      "execution_time": 8.5,
      "tokens": {
        "prompt": 450,
        "completion": 1200,
        "total": 1650
      },
      "cost": {
        "total": 0.0185,
        "breakdown": {
          "gpt-5": 0.012,
          "gemini-2.5-flash": 0.002,
          "claude-4-sonnet": 0.0045
        }
      }
    }
  },
  "timestamp": "2026-01-24T21:30:00Z"
}
```

#### 5.1.2 多模型对比 API

**端点**: `POST /api/ember/multi-model`

**请求体**:
```json
{
  "message": "什么是量子计算?",
  "models": ["gpt-5", "gemini-2.5-flash", "claude-4-sonnet"],
  "user_context": {...},
  "language": "ZH"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "responses": [
      {
        "model": "gpt-5",
        "model_version": "gpt-5-2025-08-07",
        "answer": "量子计算是...",
        "tokens": 450,
        "cost": 0.00315,
        "execution_time": 2.3
      },
      {
        "model": "gemini-2.5-flash",
        "model_version": "gemini-2.5-flash",
        "answer": "量子计算利用...",
        "tokens": 380,
        "cost": 0.00076,
        "execution_time": 1.8
      },
      {
        "model": "claude-4-sonnet",
        "model_version": "claude-4-sonnet-20250514",
        "answer": "量子计算是一种...",
        "tokens": 420,
        "cost": 0.00252,
        "execution_time": 2.1
      }
    ],
    "total_cost": 0.00643,
    "total_time": 2.5,
    "comparison": {
      "fastest": "gemini-2.5-flash",
      "cheapest": "gemini-2.5-flash",
      "most_detailed": "gpt-5"
    }
  }
}
```

#### 5.1.3 批量处理 API

**端点**: `POST /api/ember/batch`

**请求体**:
```json
{
  "questions": [
    "什么是AI?",
    "什么是区块链?",
    "什么是量子计算?"
  ],
  "model": "gemini-2.5-flash",
  "user_context": {...},
  "parallel": true
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "question": "什么是AI?",
        "answer": "...",
        "cost": 0.0008,
        "tokens": 320
      },
      {
        "question": "什么是区块链?",
        "answer": "...",
        "cost": 0.0009,
        "tokens": 350
      },
      {
        "question": "什么是量子计算?",
        "answer": "...",
        "cost": 0.0011,
        "tokens": 420
      }
    ],
    "total_cost": 0.0028,
    "total_time": 2.1,
    "parallel": true
  }
}
```

#### 5.1.4 成本统计 API

**端点**: `GET /api/ember/cost/stats?user_id={userId}&period=today`

**响应**:
```json
{
  "success": true,
  "data": {
    "period": "today",
    "date_range": {
      "start": "2026-01-24T00:00:00Z",
      "end": "2026-01-24T23:59:59Z"
    },
    "summary": {
      "total_cost": 3.45,
      "total_requests": 127,
      "total_tokens": 145000,
      "avg_cost_per_request": 0.0272
    },
    "by_mode": {
      "default": {
        "requests": 89,
        "cost": 0.89,
        "tokens": 35000
      },
      "multi": {
        "requests": 25,
        "cost": 1.25,
        "tokens": 62000
      },
      "ensemble": {
        "requests": 13,
        "cost": 1.31,
        "tokens": 48000
      }
    },
    "by_model": {
      "gpt-5": {
        "calls": 45,
        "cost": 1.89,
        "tokens": 67000
      },
      "gemini-2.5-flash": {
        "calls": 98,
        "cost": 0.78,
        "tokens": 52000
      },
      "claude-4-sonnet": {
        "calls": 28,
        "cost": 0.78,
        "tokens": 26000
      }
    },
    "trend": [
      {"hour": "00:00", "cost": 0.12, "requests": 5},
      {"hour": "01:00", "cost": 0.08, "requests": 3},
      // ...
    ]
  }
}
```

### 5.2 WebSocket 实时 API (流式响应)

**连接**: `ws://api.stanse.com/ember/stream`

**客户端发送**:
```json
{
  "action": "chat",
  "payload": {
    "message": "解释量子纠缠",
    "mode": "default",
    "stream": true
  }
}
```

**服务器推送** (流式):
```json
// 消息 1: 开始
{"type": "start", "session_id": "abc123"}

// 消息 2-N: 内容流
{"type": "content", "chunk": "量子"}
{"type": "content", "chunk": "纠缠"}
{"type": "content", "chunk": "是一种"}
// ...

// 消息 N+1: 元数据
{"type": "metadata", "tokens": 450, "cost": 0.0032}

// 消息 N+2: 结束
{"type": "end", "session_id": "abc123"}
```

---

## 6. 安全性架构

### 6.1 API Key 安全管理

#### 6.1.1 Secret Manager 架构

```
┌─────────────────────────────────────────────────────────┐
│         应用层 (Cloud Run/Cloud Functions)              │
│                                                         │
│  ❌ 无 API Keys                                         │
│  ❌ 无硬编码                                            │
│  ❌ 无环境变量中的明文 keys                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 1. 请求 API Key
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Ember Core (credentials.py)                │
│                                                         │
│  查找顺序:                                               │
│  1. Secret Manager (最高优先级)  ← 生产环境              │
│  2. 环境变量 (后备)             ← 开发环境              │
│  3. 配置文件 (降级)             ← 本地测试              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 2. 调用 Secret Manager API
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Google Cloud Secret Manager                     │
│                                                         │
│  项目: gen-lang-client-0960644135                       │
│                                                         │
│  Secrets:                                               │
│  ├─ ember-openai-api-key                               │
│  │  ├─ Version 1 (latest)                              │
│  │  ├─ Created: 2026-01-25T01:44:31Z                   │
│  │  ├─ Replciation: automatic                          │
│  │  └─ IAM: serviceAccount@... (accessor)              │
│  │                                                      │
│  ├─ ember-google-api-key                               │
│  │  └─ ...                                             │
│  │                                                      │
│  └─ ember-anthropic-api-key                            │
│     └─ ...                                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 3. 返回加密的 API Key
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Ember Framework                            │
│                                                         │
│  ✅ API Key 在内存中                                    │
│  ✅ 仅在 LLM API 调用时使用                             │
│  ✅ 不记录日志                                          │
│  ✅ 不存储到数据库                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ 4. HTTPS 加密传输
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              外部 LLM API                                │
│  (OpenAI / Google AI / Anthropic)                      │
└─────────────────────────────────────────────────────────┘
```

#### 6.1.2 访问控制

```python
# IAM 策略配置
ALLOWED_SERVICE_ACCOUNTS = [
    "ember-api@gen-lang-client-0960644135.iam.gserviceaccount.com",
    "cloud-functions@gen-lang-client-0960644135.iam.gserviceaccount.com"
]

# Secret Manager 权限
# roles/secretmanager.secretAccessor - 仅读取权限
# 绝不授予 secretmanager.secretCreator 或 secretmanager.admin

# 审计日志
# 启用 Secret Manager 访问日志
# 监控异常访问模式
# 设置警报: 每日访问次数 > 1000 次
```

### 6.2 用户数据隐私

#### 6.2.1 数据流转

```
用户输入 (前端)
    │
    │ ✅ HTTPS 加密传输
    │
    ▼
Cloud Run API
    │
    ├─ ✅ 用户 context 仅用于本次请求
    ├─ ✅ 不存储用户消息内容
    ├─ ✅ 仅存储元数据 (成本/tokens)
    │
    ▼
Ember Processing
    │
    ├─ ✅ 临时内存处理
    ├─ ✅ 请求结束后清除
    │
    ▼
LLM API
    │
    ├─ ⚠️ 用户消息发送到第三方
    ├─ ✅ 遵守各提供商隐私政策
    │
    ▼
响应返回 (前端)
    │
    ✅ HTTPS 加密传输
```

#### 6.2.2 数据保留策略

```python
DATA_RETENTION_POLICY = {
    "chat_messages": {
        "storage": "firestore",
        "retention": "5条最近消息",  # 超过自动删除
        "encryption": "at_rest",
        "backup": False  # 不备份聊天内容
    },
    "cost_metadata": {
        "storage": "firestore",
        "retention": "90天",
        "fields": [
            "timestamp",
            "model_used",
            "tokens",
            "cost",
            "mode"
        ],
        "excluded_fields": [
            "message_content",  # ❌ 不存储消息内容
            "response_content"  # ❌ 不存储回复内容
        ]
    },
    "user_profile": {
        "storage": "firestore",
        "retention": "永久 (用户可删除)",
        "encryption": "field_level",
        "fields": [
            "economic",
            "social",
            "diplomatic",
            "label"
        ]
    }
}
```

### 6.3 速率限制和 DDoS 防护

```python
RATE_LIMITS = {
    "by_user": {
        "free": {
            "requests_per_minute": 10,
            "requests_per_hour": 100,
            "requests_per_day": 500
        },
        "basic": {
            "requests_per_minute": 30,
            "requests_per_hour": 500,
            "requests_per_day": 5000
        },
        "premium": {
            "requests_per_minute": 100,
            "requests_per_hour": 2000,
            "requests_per_day": 20000
        }
    },
    "by_ip": {
        "requests_per_minute": 50,
        "requests_per_hour": 500
    },
    "global": {
        "max_concurrent_requests": 1000,
        "queue_size": 5000
    }
}

# 使用 Cloud Armor 防护
CLOUD_ARMOR_RULES = [
    {
        "priority": 1000,
        "action": "deny(403)",
        "match": "origin.region_code in ['CN', 'RU']",  # 按需调整
        "description": "Block high-risk regions"
    },
    {
        "priority": 2000,
        "action": "rate_based_ban",
        "match": "true",
        "rate_limit_options": {
            "conform_action": "allow",
            "exceed_action": "deny(429)",
            "rate_limit_threshold": {
                "count": 100,
                "interval_sec": 60
            }
        }
    }
]
```

---

## 7. 性能优化策略

### 7.1 缓存架构

```python
"""
三级缓存策略
"""

# Level 1: Redis 缓存 (热数据)
REDIS_CONFIG = {
    "host": "redis.cloud.google.com",
    "port": 6379,
    "db": 0,
    "ttl": {
        "common_questions": 3600,      # 1小时
        "user_context": 1800,          # 30分钟
        "model_responses": 600,        # 10分钟
        "cost_stats": 300              # 5分钟
    }
}

# Level 2: Firestore 缓存 (温数据)
FIRESTORE_CACHE = {
    "collection": "ember_cache",
    "ttl": 86400,  # 24小时
    "structure": {
        "question_hash": "md5(question + user_context)",
        "answer": "cached_response",
        "metadata": {...},
        "expires_at": "timestamp"
    }
}

# Level 3: CDN 缓存 (静态内容)
CDN_CONFIG = {
    "provider": "Cloud CDN",
    "cache_rules": [
        {
            "path": "/api/ember/models/list",
            "ttl": 3600  # 模型列表缓存1小时
        },
        {
            "path": "/api/ember/cost/pricing",
            "ttl": 86400  # 定价信息缓存24小时
        }
    ]
}

# 缓存键生成
def generate_cache_key(message: str, mode: str, user_context: dict) -> str:
    """生成缓存键"""
    import hashlib
    import json

    # 标准化 user_context (移除不影响答案的字段)
    normalized_context = {
        "economic": round(user_context.get("economic", 0), 1),
        "social": round(user_context.get("social", 0), 1),
        "diplomatic": round(user_context.get("diplomatic", 0), 1),
        "label": user_context.get("label", "")
    }

    # 组合键
    key_data = {
        "message": message.lower().strip(),
        "mode": mode,
        "context": normalized_context
    }

    # MD5 哈希
    key_str = json.dumps(key_data, sort_keys=True)
    return hashlib.md5(key_str.encode()).hexdigest()

# 缓存使用示例
async def cached_chat(message, mode, user_context):
    """带缓存的聊天"""
    cache_key = generate_cache_key(message, mode, user_context)

    # 尝试从 Redis 获取
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # 尝试从 Firestore 获取
    doc = await firestore.collection("ember_cache").document(cache_key).get()
    if doc.exists and not is_expired(doc.get("expires_at")):
        result = doc.to_dict()
        # 回写到 Redis
        await redis_client.setex(
            cache_key,
            REDIS_CONFIG["ttl"]["model_responses"],
            json.dumps(result)
        )
        return result

    # 缓存未命中,调用 Ember
    result = await ember_service.chat(message, mode, user_context)

    # 写入两级缓存
    await redis_client.setex(
        cache_key,
        REDIS_CONFIG["ttl"]["model_responses"],
        json.dumps(result)
    )
    await firestore.collection("ember_cache").document(cache_key).set({
        **result,
        "expires_at": datetime.now() + timedelta(seconds=FIRESTORE_CACHE["ttl"])
    })

    return result
```

### 7.2 并发处理

```python
"""
高并发处理架构
"""

# 使用 asyncio + concurrent.futures
import asyncio
from concurrent.futures import ThreadPoolExecutor

class ConcurrentEmberService:
    def __init__(self, max_workers=20):
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.semaphore = asyncio.Semaphore(100)  # 最多100个并发请求

    async def chat_async(self, message, mode, user_context):
        """异步聊天接口"""
        async with self.semaphore:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                self._sync_chat,
                message,
                mode,
                user_context
            )
            return result

    def _sync_chat(self, message, mode, user_context):
        """同步聊天 (调用 Ember)"""
        return ember_service.chat(message, mode, user_context)

# 批量请求处理
async def handle_batch_requests(requests: list):
    """批量处理多个请求"""
    service = ConcurrentEmberService(max_workers=50)

    tasks = [
        service.chat_async(req["message"], req["mode"], req["user_context"])
        for req in requests
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 处理异常
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"Request {i} failed: {result}")
            results[i] = {"success": False, "error": str(result)}

    return results
```

### 7.3 智能负载均衡

```python
"""
模型负载均衡策略
"""

class ModelLoadBalancer:
    """智能模型负载均衡"""

    def __init__(self):
        self.model_pools = {
            "fast": ["gemini-2.5-flash"],
            "balanced": ["gpt-4o", "gemini-2.5-pro"],
            "quality": ["gpt-5", "claude-4-sonnet"]
        }
        self.model_stats = {}  # 模型统计信息

    def select_model(self, preference: str, current_load: dict) -> str:
        """基于负载选择模型"""
        pool = self.model_pools.get(preference, self.model_pools["balanced"])

        # 计算每个模型的负载分数
        scores = {}
        for model in pool:
            load = current_load.get(model, 0)
            capacity = self._get_model_capacity(model)

            # 负载分数 = (1 - load/capacity) * 模型质量权重
            load_score = (1 - load / capacity) * self._get_quality_weight(model)
            scores[model] = load_score

        # 选择负载最低的模型
        return max(scores.items(), key=lambda x: x[1])[0]

    def _get_model_capacity(self, model: str) -> int:
        """获取模型容量 (每分钟请求数)"""
        capacities = {
            "gemini-2.5-flash": 1000,
            "gpt-4o": 500,
            "gpt-5": 200,
            "claude-4-sonnet": 300
        }
        return capacities.get(model, 100)

    def _get_quality_weight(self, model: str) -> float:
        """获取模型质量权重"""
        weights = {
            "gpt-5": 1.0,
            "claude-4-sonnet": 0.95,
            "gpt-4o": 0.90,
            "gemini-2.5-pro": 0.88,
            "gemini-2.5-flash": 0.85
        }
        return weights.get(model, 0.80)

# 使用示例
balancer = ModelLoadBalancer()

async def balanced_chat(message, preference="balanced"):
    """负载均衡的聊天"""
    current_load = await get_current_model_load()
    model = balancer.select_model(preference, current_load)

    result = models.response(model, message)
    return result
```

### 7.4 预热和预加载

```python
"""
系统预热策略
"""

class SystemWarmer:
    """系统预热器"""

    async def warmup(self):
        """预热关键路径"""
        tasks = [
            self._warmup_models(),
            self._warmup_cache(),
            self._warmup_connections()
        ]
        await asyncio.gather(*tasks)

    async def _warmup_models(self):
        """预热模型连接"""
        test_message = "Hello"

        for model in ["gpt-5", "gemini-2.5-flash", "claude-4-sonnet"]:
            try:
                _ = models(model, test_message)
                print(f"✓ Warmed up {model}")
            except Exception as e:
                print(f"✗ Failed to warm up {model}: {e}")

    async def _warmup_cache(self):
        """预加载常见问题缓存"""
        common_questions = await self._get_common_questions()

        for question in common_questions[:100]:
            cache_key = generate_cache_key(question["text"], "default", {})
            if not await redis_client.exists(cache_key):
                # 缓存未命中,预生成答案
                result = await ember_service.chat(
                    question["text"],
                    "default",
                    {}
                )
                await redis_client.setex(
                    cache_key,
                    3600,
                    json.dumps(result)
                )

    async def _warmup_connections(self):
        """预热数据库连接"""
        await firestore.collection("users").limit(1).get()
        await redis_client.ping()
        print("✓ Database connections warmed up")

# Cloud Run 启动时执行
@app.on_event("startup")
async def startup_event():
    warmer = SystemWarmer()
    await warmer.warmup()
```

---

## 8. 成本管理方案

### 8.1 成本计算模型

```python
"""
精确成本计算
"""

# 模型定价 (2026年1月价格,可能变化)
MODEL_PRICING = {
    "gpt-5": {
        "prompt": 0.000007,      # $7 / 1M tokens
        "completion": 0.000021   # $21 / 1M tokens
    },
    "gpt-4o": {
        "prompt": 0.0000025,     # $2.5 / 1M tokens
        "completion": 0.00001    # $10 / 1M tokens
    },
    "gemini-2.5-flash": {
        "prompt": 0.0000001,     # $0.1 / 1M tokens
        "completion": 0.0000003  # $0.3 / 1M tokens
    },
    "claude-4-sonnet": {
        "prompt": 0.000003,      # $3 / 1M tokens
        "completion": 0.000015   # $15 / 1M tokens
    }
}

def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """计算请求成本"""
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return 0.0

    prompt_cost = (prompt_tokens / 1_000_000) * pricing["prompt"]
    completion_cost = (completion_tokens / 1_000_000) * pricing["completion"]

    return prompt_cost + completion_cost

# 模式成本估算
MODE_COST_ESTIMATES = {
    "default": {
        "model": "auto-selected",
        "avg_tokens": 500,
        "estimated_cost": 0.0015,  # $0.0015 平均
        "range": (0.0001, 0.005)
    },
    "multi": {
        "models": 3,
        "avg_tokens_per_model": 450,
        "estimated_cost": 0.0045,  # $0.0045 平均
        "range": (0.002, 0.01)
    },
    "ensemble": {
        "models": 6,  # 5 候选 + 1 评判
        "avg_tokens_total": 2000,
        "estimated_cost": 0.018,   # $0.018 平均
        "range": (0.01, 0.03)
    },
    "batch": {
        "model": "gemini-2.5-flash",
        "cost_per_question": 0.0002,
        "estimated_cost": "0.0002 * N"  # N = 问题数
    }
}
```

### 8.2 预算控制

```python
"""
用户预算管理
"""

class BudgetManager:
    """预算管理器"""

    def __init__(self, firestore_client):
        self.db = firestore_client

    async def check_budget(self, user_id: str, estimated_cost: float) -> tuple[bool, str]:
        """检查用户预算"""
        # 获取用户预算设置
        budget_doc = await self.db.collection("user_budgets").document(user_id).get()

        if not budget_doc.exists:
            # 无预算限制
            return True, None

        budget_data = budget_doc.to_dict()
        daily_limit = budget_data.get("daily_limit", 1.0)  # 默认 $1/天

        # 获取今日已用
        today_usage = await self._get_today_usage(user_id)

        # 检查是否超预算
        if today_usage + estimated_cost > daily_limit:
            remaining = daily_limit - today_usage
            return False, f"预算不足。今日限额: ${daily_limit}, 已用: ${today_usage:.4f}, 剩余: ${remaining:.4f}"

        return True, None

    async def _get_today_usage(self, user_id: str) -> float:
        """获取今日使用量"""
        today = datetime.now().date()

        usage_docs = await self.db.collection("user_chat_costs") \
            .document(user_id) \
            .collection("sessions") \
            .where("date", "==", today) \
            .get()

        total = sum(doc.get("cost", 0.0) for doc in usage_docs)
        return total

    async def record_usage(self, user_id: str, cost: float, metadata: dict):
        """记录使用"""
        await self.db.collection("user_chat_costs") \
            .document(user_id) \
            .collection("sessions") \
            .add({
                "timestamp": datetime.now(),
                "date": datetime.now().date(),
                "cost": cost,
                "model": metadata.get("model"),
                "mode": metadata.get("mode"),
                "tokens": metadata.get("tokens"),
            })

# 使用示例
budget_manager = BudgetManager(firestore_client)

async def budget_aware_chat(user_id, message, mode):
    """带预算检查的聊天"""
    # 估算成本
    estimated_cost = MODE_COST_ESTIMATES[mode]["estimated_cost"]

    # 检查预算
    can_proceed, error_msg = await budget_manager.check_budget(user_id, estimated_cost)

    if not can_proceed:
        return {
            "success": False,
            "error": error_msg,
            "suggestion": "请升级套餐或明天再试"
        }

    # 执行聊天
    result = await ember_service.chat(message, mode, {})

    # 记录实际成本
    await budget_manager.record_usage(
        user_id,
        result["cost"],
        {
            "model": result["model_used"],
            "mode": mode,
            "tokens": result["tokens"]
        }
    )

    return result
```

### 8.3 成本优化策略

```python
"""
智能成本优化
"""

class CostOptimizer:
    """成本优化器"""

    def optimize_model_selection(
        self,
        message: str,
        user_context: dict,
        quality_requirement: str = "balanced"
    ) -> str:
        """基于成本和质量需求选择最优模型"""

        # 分析问题复杂度
        complexity = self._analyze_complexity(message)

        # 质量需求映射
        quality_map = {
            "minimum": 0.7,
            "balanced": 0.85,
            "maximum": 0.95
        }
        required_quality = quality_map.get(quality_requirement, 0.85)

        # 模型质量和成本
        model_options = [
            {
                "model": "gemini-2.5-flash",
                "quality": 0.80,
                "cost_per_token": 0.0000002,  # 平均
                "speed": "fast"
            },
            {
                "model": "gpt-4o",
                "quality": 0.90,
                "cost_per_token": 0.000006,
                "speed": "medium"
            },
            {
                "model": "gpt-5",
                "quality": 0.95,
                "cost_per_token": 0.000014,
                "speed": "slow"
            }
        ]

        # 筛选满足质量要求的模型
        qualified = [m for m in model_options if m["quality"] >= required_quality]

        if not qualified:
            # 如果无法满足,选择最高质量模型
            return max(model_options, key=lambda x: x["quality"])["model"]

        # 在满足质量的前提下,选择成本最低的
        return min(qualified, key=lambda x: x["cost_per_token"])["model"]

    def _analyze_complexity(self, message: str) -> float:
        """分析问题复杂度 (0-1)"""
        factors = []

        # 长度因素
        length_score = min(len(message) / 500, 1.0)
        factors.append(length_score * 0.3)

        # 关键词因素
        complex_keywords = [
            "为什么", "如何", "分析", "解释", "比较",
            "评价", "深入", "详细", "原因", "影响"
        ]
        keyword_count = sum(1 for kw in complex_keywords if kw in message)
        keyword_score = min(keyword_count / 3, 1.0)
        factors.append(keyword_score * 0.4)

        # 专业性因素
        professional_terms = ["政治", "经济", "哲学", "科技", "量子", "AI"]
        professional_count = sum(1 for term in professional_terms if term in message)
        professional_score = min(professional_count / 2, 1.0)
        factors.append(professional_score * 0.3)

        return sum(factors)

    def suggest_mode_downgrade(self, mode: str, question_type: str) -> str:
        """建议降级模式以节省成本"""

        # 简单问答不需要 ensemble
        if mode == "ensemble" and question_type == "simple":
            return "default"

        # 事实查询不需要多模型
        if mode == "multi" and question_type == "factual":
            return "default"

        return mode

# 使用示例
optimizer = CostOptimizer()

async def cost_optimized_chat(user_id, message, mode="default"):
    """成本优化的聊天"""

    # 分析问题类型
    question_type = classify_question(message)  # simple/complex/factual/opinion

    # 建议模式降级
    suggested_mode = optimizer.suggest_mode_downgrade(mode, question_type)

    if suggested_mode != mode:
        # 通知用户可节省成本
        print(f"建议使用 {suggested_mode} 模式,可节省约 {calculate_savings(mode, suggested_mode)}%")

    # 选择最优模型
    model = optimizer.optimize_model_selection(
        message,
        {},
        quality_requirement="balanced"
    )

    result = await ember_service.chat(message, suggested_mode, {})
    return result
```

---

## 9. 实施路线图

### 9.1 Phase 1: 基础集成 (Week 1-2)

**目标**: 实现基本的 Ember 集成,替代现有 Gemini Provider

#### 任务列表

| 任务 | 优先级 | 预计时间 | 负责模块 |
|-----|--------|---------|---------|
| 1.1 创建 Ember API Cloud Function | P0 | 2天 | Backend |
| 1.2 实现 /api/ember/chat 端点 | P0 | 1天 | Backend |
| 1.3 集成 Secret Manager | P0 | 0.5天 | Backend |
| 1.4 基础错误处理 | P0 | 0.5天 | Backend |
| 1.5 前端调用 Ember API | P0 | 1天 | Frontend |
| 1.6 成本追踪基础版 | P1 | 1天 | Backend |
| 1.7 单元测试 | P1 | 1天 | Testing |
| 1.8 集成测试 | P1 | 1天 | Testing |
| 1.9 性能测试 | P2 | 0.5天 | Testing |
| 1.10 文档更新 | P2 | 0.5天 | Docs |

**交付物**:
- ✅ Ember API 可用
- ✅ 前端成功调用
- ✅ 基础成本追踪
- ✅ 测试覆盖率 > 80%

**成功指标**:
- API 响应时间 < 3秒
- 成功率 > 99%
- 成本准确率 100%

### 9.2 Phase 2: 多模式支持 (Week 3-4)

**目标**: 添加多模型对比和 Ensemble 模式

#### 任务列表

| 任务 | 优先级 | 预计时间 | 负责模块 |
|-----|--------|---------|---------|
| 2.1 实现 multi-model 模式 | P0 | 2天 | Backend |
| 2.2 实现 ensemble 模式 | P0 | 2天 | Backend |
| 2.3 前端模式选择器 | P0 | 1天 | Frontend |
| 2.4 并发处理优化 | P1 | 1天 | Backend |
| 2.5 缓存系统 (Redis) | P1 | 1天 | Backend |
| 2.6 成本展示 UI | P1 | 1天 | Frontend |
| 2.7 性能监控 | P2 | 0.5天 | DevOps |
| 2.8 A/B 测试 | P2 | 0.5天 | Testing |

**交付物**:
- ✅ 3种聊天模式可用
- ✅ Redis 缓存集成
- ✅ 成本实时显示

**成功指标**:
- Multi-model 响应时间 < 5秒
- Ensemble 响应时间 < 10秒
- 缓存命中率 > 30%

### 9.3 Phase 3: 高级功能 (Week 5-6)

**目标**: 批量处理、智能优化、用户分层

#### 任务列表

| 任务 | 优先级 | 预计时间 | 负责模块 |
|-----|--------|---------|---------|
| 3.1 批量处理模式 | P1 | 2天 | Backend |
| 3.2 智能模型选择 | P1 | 1天 | Backend |
| 3.3 用户预算管理 | P0 | 2天 | Backend |
| 3.4 用户等级系统 | P0 | 1天 | Backend |
| 3.5 成本统计仪表板 | P1 | 2天 | Frontend |
| 3.6 自动成本优化 | P2 | 1天 | Backend |

**交付物**:
- ✅ 批量处理可用
- ✅ 用户预算控制
- ✅ 4个用户等级

**成功指标**:
- 批量处理吞吐量 > 100 req/min
- 预算超支率 = 0%
- 用户满意度 > 4.5/5

### 9.4 Phase 4: 优化和扩展 (Week 7-8)

**目标**: 性能优化、监控完善、文档完善

#### 任务列表

| 任务 | 优先级 | 预计时间 | 负责模块 |
|-----|--------|---------|---------|
| 4.1 负载均衡优化 | P1 | 1天 | Backend |
| 4.2 系统预热 | P2 | 0.5天 | Backend |
| 4.3 完整监控 | P0 | 2天 | DevOps |
| 4.4 告警系统 | P0 | 1天 | DevOps |
| 4.5 用户文档 | P1 | 1天 | Docs |
| 4.6 API 文档 | P1 | 1天 | Docs |
| 4.7 性能压测 | P1 | 1天 | Testing |
| 4.8 安全审计 | P0 | 1天 | Security |

**交付物**:
- ✅ 完整监控系统
- ✅ 告警机制
- ✅ 完整文档
- ✅ 安全审计报告

**成功指标**:
- P99 延迟 < 5秒
- 可用性 > 99.9%
- 文档完整度 100%

### 9.5 阶段性里程碑

```
Week 1-2: Phase 1 ████████████████████ 100%
├─ Day 1-2:   Ember API 开发
├─ Day 3-4:   前端集成
├─ Day 5-6:   测试和优化
└─ Day 7-10:  文档和部署

Week 3-4: Phase 2 ████████████████████ 100%
├─ Day 11-14: 多模式实现
├─ Day 15-17: 缓存和优化
└─ Day 18-20: UI 和测试

Week 5-6: Phase 3 ████████████████████ 100%
├─ Day 21-24: 高级功能
├─ Day 25-28: 用户系统
└─ Day 29-30: 集成测试

Week 7-8: Phase 4 ████████████████████ 100%
├─ Day 31-35: 优化和监控
├─ Day 36-38: 文档完善
└─ Day 39-40: 最终验收

🎯 最终交付: Week 8 结束
```

### 9.6 风险和缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **Ember API 限速** | 中 | 高 | 实施多提供商降级策略 |
| **成本超预算** | 中 | 中 | 严格预算控制 + 用户限额 |
| **性能不达标** | 低 | 高 | 提前压测 + Redis 缓存 |
| **安全漏洞** | 低 | 高 | 安全审计 + Secret Manager |
| **用户体验下降** | 中 | 中 | A/B 测试 + 渐进式发布 |

---

## 10. 附录

### 10.1 技术栈清单

#### 后端
- **语言**: Python 3.12+
- **框架**: FastAPI / Flask
- **部署**: Cloud Run
- **Ember**: 最新版本 (0.1.0+)
- **数据库**: Firestore
- **缓存**: Redis (Cloud Memorystore)
- **Secret 管理**: Google Secret Manager
- **监控**: Cloud Logging + Cloud Monitoring

#### 前端
- **语言**: TypeScript
- **框架**: React
- **UI**: Tailwind CSS
- **状态管理**: Context API
- **HTTP**: Axios / Fetch API

#### DevOps
- **CI/CD**: Cloud Build
- **版本控制**: Git
- **容器**: Docker
- **编排**: Cloud Run (serverless)

### 10.2 性能基准

| 指标 | 目标值 | 当前值 | 备注 |
|------|--------|--------|------|
| **API 响应时间** (P50) | < 2秒 | TBD | Default 模式 |
| **API 响应时间** (P99) | < 5秒 | TBD | Default 模式 |
| **Multi 模式响应** | < 5秒 | TBD | 3个模型并行 |
| **Ensemble 响应** | < 10秒 | TBD | 6个模型 |
| **吞吐量** | > 100 req/s | TBD | 单实例 |
| **缓存命中率** | > 40% | TBD | 热点问题 |
| **成本准确率** | 100% | TBD | Token 计数 |
| **可用性** | > 99.9% | TBD | 月度 |

### 10.3 成本估算

#### 基础设施成本 (月度)
```
Cloud Run:
  - 实例: n1-standard-1
  - 并发: 100
  - 估算: $50-150/月

Cloud Memorystore (Redis):
  - 实例: Basic, 1GB
  - 估算: $30/月

Firestore:
  - 读取: 1M/月
  - 写入: 100K/月
  - 存储: 10GB
  - 估算: $10-20/月

Secret Manager:
  - 访问: 100K/月
  - 估算: $0.06/月

总计: ~$90-200/月
```

#### LLM API 成本 (用户规模)
```
假设:
- 活跃用户: 1000人
- 平均每人每天: 10次请求
- 平均模式分布:
  • default: 70% → $0.0015/次
  • multi: 20% → $0.0045/次
  • ensemble: 10% → $0.018/次

日均成本:
= 1000 * 10 * (0.70 * 0.0015 + 0.20 * 0.0045 + 0.10 * 0.018)
= 1000 * 10 * (0.00105 + 0.0009 + 0.0018)
= 1000 * 10 * 0.00375
= $37.50/天

月度成本: $37.50 * 30 = $1125/月

总成本: $90 (基础设施) + $1125 (LLM) = $1215/月
```

### 10.4 相关文档链接

- [57_ember_secret_manager_integration_2026_01_24.md](57_ember_secret_manager_integration_2026_01_24.md)
- [28_api_key_security_guide.md](28_api_key_security_guide.md)
- [Ember 中文完整指南](../../ember-main/Ember中文完整指南.md)

---

**文档状态**: ✅ 设计完成
**下一步**: 开始 Phase 1 实施
**最后更新**: 2026-01-24 22:30
**审阅状态**: 待审阅
