# StanseAgent vs Intelligence Agent 对比分析

**文档编号**: 66
**创建日期**: 2026-01-31
**作者**: Claude Sonnet 4.5
**状态**: 分析报告
**版本**: 1.0

---

## 📋 执行摘要

本文档对比分析：
1. **现有的 StanseAgent** - 基于 E2B Sandbox 的代码生成 Agent（已实现）
2. **设计中的 Intelligence Agent** - 基于 E2B Sandbox 的数据查询 Agent（设计阶段）

**核心发现**：你已经有一个完整的 E2B Sandbox 基础设施，可以**复用 80% 的架构和代码**来实现 Intelligence Agent。

---

## 1. 现有 StanseAgent 架构分析

### 1.1 已实现的功能

#### ✅ **E2B Sandbox 集成**（完全可复用）

**前端**:
```typescript
// components/ai-chat/AgentModeChat.tsx
- E2B Sandbox 代码生成流程
- useObject hook 流式传输
- 错误处理和重试机制
- 成本追踪（集成 Ember cost_service.py）
- Chat 历史管理
```

**后端**:
```
STANSEAGENT_API_URL (Cloud Run):
- /api/chat - 代码生成
- /api/morph-chat - 增量代码编辑
- /api/sandbox - E2B Sandbox 部署
- /api/publish - 延长 Sandbox 生命周期
- /api/base-app - 基础模板
```

#### ✅ **Multi-Agent 系统雏形**

虽然 StanseAgent 主要是单一的"代码生成 Agent"，但已经有：
1. **模板选择逻辑** - 类似 Schema Agent 的意图识别
2. **代码生成** - 类似 Execution Agent 的执行
3. **Sandbox 部署** - 类似 Review Agent 的验证

#### ✅ **成本管理**（完全可复用）

```typescript
// 集成了 Ember cost_service.py
loadCostStats() - 从 Ember API 读取成本
recordCost() - 记录每次 Agent 执行的成本
```

#### ✅ **UI 框架**（完全可复用）

```typescript
- ChatModeSelector - 模式选择器（可添加 Intelligence Agent）
- ChatBubble - 消息显示
- CostTracker - 成本追踪
- Split View - 聊天/代码分屏（可改为聊天/数据分屏）
```

---

## 2. 功能对比矩阵

| 功能模块 | StanseAgent (已实现) | Intelligence Agent (设计) | 可复用度 |
|---------|---------------------|--------------------------|---------|
| **E2B Sandbox 创建** | ✅ `/api/sandbox` | 需要 | 🟢 100% |
| **Sandbox 配置** | ✅ 上传代码 + 环境变量 | 需要上传 Agent 代码 + Service Account | 🟢 90% |
| **Sandbox 执行** | ✅ 运行代码 + 返回结果 | 需要运行 Multi-Agent + 返回查询结果 | 🟢 95% |
| **Sandbox 清理** | ✅ 自动清理 | 需要 | 🟢 100% |
| **前端 UI** | ✅ AgentModeChat 组件 | 可复用并调整 | 🟢 80% |
| **成本追踪** | ✅ Ember cost_service.py | 需要 | 🟢 100% |
| **错误处理** | ✅ api-errors.ts | 需要 | 🟢 100% |
| **Chat 历史** | ✅ Firebase 存储 | 需要 | 🟢 100% |
| **Schema Agent** | ⚠️ 简单模板选择 | 需要完整的 Firestore 理解 | 🟡 30% |
| **Query Planner** | ❌ 无 | 需要新建 | 🔴 0% |
| **Execution Agent** | ⚠️ 代码执行 | 需要 Firestore 查询 | 🟡 40% |
| **Review Agent** | ⚠️ 简单验证 | 需要数据泄露检测 | 🟡 30% |
| **Synthesis Agent** | ⚠️ 代码格式化 | 需要调用 Ember API | 🟢 70% |
| **Web Browsing** | ❌ 无 | 需要新建 | 🔴 0% |
| **Firestore 查询** | ❌ 无 | 需要新建 | 🔴 0% |

**总体可复用度**: 🟢 **约 70-80%**

---

## 3. 可直接复用的组件

### 3.1 前端组件（80% 可复用）

#### ✅ **完全可复用**

```typescript
// components/ai-chat/
├── ChatModeSelector.tsx     ✅ 添加新模式即可
├── ChatBubble.tsx           ✅ 消息显示
├── CostTracker.tsx          ✅ 成本追踪
└── AgentModeControls.tsx    ⚠️ 需调整（去掉模板选择，添加查询选项）
```

#### ⚠️ **需要调整**

```typescript
// components/ai-chat/AgentModeChat.tsx
// 可以复制为 IntelligenceAgentChat.tsx，然后修改：

// 1. 去掉代码相关的状态
- setGeneratedCode() ❌
- setSandboxResult() ⚠️ 改为 setQueryResults()
- setCodeTab() ❌

// 2. 添加数据查询相关状态
+ setQueryPlan()
+ setDataSources()
+ setValidationReport()

// 3. 修改 API 调用
- fetch(`${STANSEAGENT_API_URL}/api/chat`) ❌
+ fetch(`${EMBER_API_URL}/intelligence-query`) ✅
```

#### ✅ **新增组件**（基于现有模式）

```typescript
// components/ai-chat/
├── IntelligenceAgentChat.tsx    // 复制 AgentModeChat.tsx 并修改
├── QueryResultsPanel.tsx        // 类似 AgentCodePanel.tsx，显示查询结果
└── DataSourcesView.tsx          // 显示数据来源
```

---

### 3.2 后端 API（70% 可复用）

#### ✅ **完全可复用的模式**

**StanseAgent 的 `/api/sandbox` 模式**:
```python
# 当前流程（代码生成）
1. 接收用户请求
2. 生成代码
3. 创建 E2B Sandbox
4. 上传代码到 Sandbox
5. 执行代码
6. 返回结果（URL）

# Intelligence Agent 流程（数据查询）
1. 接收用户问题
2. Schema Agent 分析意图         ← 新增
3. 创建 E2B Sandbox              ← 复用
4. 上传 Multi-Agent 代码         ← 调整
5. 执行查询                      ← 新增
6. 返回结果（数据 + 答案）       ← 调整
```

**可复用的代码结构**:
```python
# functions/ember-api/routes/intelligence_query.py (新建)

async def handle_intelligence_query(user_id: str, query: str):
    """
    可以参考 StanseAgent 的 /api/sandbox 流程
    """

    # 1. 创建 Sandbox（完全复用 StanseAgent 的逻辑）
    sandbox = await create_e2b_sandbox()  # ✅ 复用

    # 2. 配置 Sandbox（调整上传内容）
    await upload_agent_code(sandbox)  # ⚠️ 上传 Multi-Agent 而非代码生成器
    await upload_credentials(sandbox)  # ✅ 新增（Service Account）

    # 3. 执行（类似但不同）
    result = await execute_in_sandbox(sandbox, query)  # ⚠️ 调整

    # 4. 清理（完全复用）
    await sandbox.close()  # ✅ 复用

    return result
```

#### ⚠️ **需要新建的部分**

```python
# functions/ember-api/agents/ (新建目录)
├── schema_agent.py       # ❌ 全新
├── query_planner.py      # ❌ 全新
├── execution_agent.py    # ⚠️ 参考 StanseAgent 的执行逻辑
├── review_agent.py       # ⚠️ 参考 StanseAgent 的验证逻辑
└── synthesis_agent.py    # ⚠️ 可复用 Ember API 调用部分
```

---

### 3.3 基础设施（100% 可复用）

#### ✅ **E2B 账号和配置**

```yaml
已有:
  - E2B API Key (存储在 Secret Manager)
  - E2B Sandbox 配额
  - Cloud Function 部署配置

可直接用于 Intelligence Agent:
  - ✅ 使用相同的 E2B API Key
  - ✅ 使用相同的计费账户
  - ✅ 使用相同的 Cloud Function 基础设施
```

#### ✅ **成本管理系统**

```python
# Ember cost_service.py (完全可复用)

# 已支持的功能:
✅ /cost/record - 记录 Agent 成本
✅ /cost/stats - 获取成本统计
✅ Firebase ember_cost_sessions - 存储成本记录

# Intelligence Agent 需要做的:
只需在调用时传入正确的 mode 参数:
{
  "mode": "intelligence_agent"  # 而不是 "agent"
}
```

#### ✅ **Secret Manager**

```yaml
已有 Secrets:
  - firebase-service-account ✅ Intelligence Agent 需要
  - e2b-api-key ✅ Intelligence Agent 需要
  - ember-openai-api-key ✅ Synthesis Agent 需要
  - ember-google-api-key ✅ Synthesis Agent 需要
  - ember-anthropic-api-key ✅ Synthesis Agent 需要

结论: 无需添加新 Secret
```

---

## 4. 需要新建的功能

### 4.1 Multi-Agent 系统（40% 工作量）

虽然 StanseAgent 有简单的 Agent 逻辑，但 Intelligence Agent 需要更复杂的 Multi-Agent 协作：

#### ❌ **Schema Agent（全新）**

**功能**: 理解 Firestore 数据结构和用户意图

**需要做的**:
```python
# functions/ember-api/agents/schema_agent.py

class SchemaAgent:
    def __init__(self):
        # 加载所有 Collection 的 Schema
        self.collections_metadata = load_firestore_schemas()

    async def analyze(self, query: str) -> Intent:
        # 调用 Ember API 理解用户意图
        intent = await call_ember_for_intent(query)

        # 映射到需要查询的 collections
        collections = map_to_collections(intent)

        return Intent(
            intent_type=intent["type"],
            collections_needed=collections,
            needs_web_search=check_web_need(query)
        )
```

**数据依赖**:
```python
# 需要维护 Collection Schema 元数据
COLLECTION_SCHEMAS = {
    "users": {
        "type": "user_private",
        "fields": ["userId", "supported_entities", "persona_coordinates"],
        "relationships": {
            "supported_entities": "entityStances.entityId"
        }
    },
    "news": {
        "type": "public",
        "fields": ["id", "title", "content", "category"]
    },
    # ... 40+ collections
}
```

#### ❌ **Query Planner（全新）**

**功能**: 制定查询计划

**需要做的**:
```python
# functions/ember-api/agents/query_planner.py

class QueryPlannerAgent:
    def create_plan(self, intent: Intent) -> QueryPlan:
        # 根据 intent 生成查询步骤
        steps = []

        if intent.intent_type == "find_company_news":
            steps = [
                QueryStep(
                    step_id=1,
                    collection="users",
                    filters=[("userId", "==", user_id)]
                ),
                QueryStep(
                    step_id=2,
                    collection="company_news_by_ticker",
                    filters=[("ticker", "in", "{{step1.supported_entities}}")]
                )
            ]

        return QueryPlan(steps=steps)
```

#### ⚠️ **Execution Agent（可参考 StanseAgent）**

**功能**: 执行 Firestore 查询

**可复用**:
```python
# StanseAgent 的执行模式可以参考:
# - 在 Sandbox 中执行代码
# - 捕获错误
# - 返回结果

# Intelligence Agent 需要调整为:
# - 在 Sandbox 中执行 Firestore 查询
# - 强制安全检查
# - 返回数据
```

**需要新建**:
```python
class ExecutionAgent:
    def execute_firestore_query(self, collection, filters):
        # 安全检查
        validate_collection_access(collection)

        # 强制用户隔离
        if collection in USER_PRIVATE:
            filters = enforce_user_filter(filters, user_id)

        # 执行查询
        results = db.collection(collection).where(...).get()

        return results
```

#### ⚠️ **Review Agent（可参考 StanseAgent）**

**功能**: 验证结果安全性

**可复用**:
```python
# StanseAgent 有简单的验证逻辑
# Intelligence Agent 需要更严格的数据泄露检测

class ReviewAgent:
    def validate(self, results, user_id):
        # 检查是否泄露其他用户数据
        for result in results:
            if "userId" in result and result["userId"] != user_id:
                raise DataLeakageError()

        return ValidationReport(passed=True)
```

#### ⚠️ **Synthesis Agent（70% 可复用）**

**功能**: 生成最终答案

**可复用**:
```python
# StanseAgent 已经有调用 LLM 的逻辑
# Intelligence Agent 只需改为调用 Ember API

class SynthesisAgent:
    async def generate_answer(self, query, results):
        # 调用 Ember API（和 StanseAgent 类似）
        response = await fetch(`${EMBER_API_URL}/chat`, {
            "message": f"根据数据回答: {query}\n数据: {results}",
            "mode": "default"
        })

        return response.json()
```

---

### 4.2 网页浏览功能（20% 工作量）

#### ❌ **Web Agent（全新）**

**功能**: 浏览白名单网站

**需要做的**:
```python
# functions/ember-api/agents/web_agent.py

class WebAgent:
    ALLOWED_DOMAINS = ["stanse.ai", "news.google.com"]

    async def browse(self, url: str) -> str:
        # 验证域名
        if not self._is_allowed(url):
            raise PermissionError()

        # 获取内容
        import requests
        from bs4 import BeautifulSoup

        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.text)

        return soup.get_text()[:5000]
```

**集成到 Execution Agent**:
```python
class ExecutionAgent:
    def execute_plan(self, plan):
        for step in plan.steps:
            if step.type == "firestore_query":
                result = self.execute_firestore_query(...)
            elif step.type == "web_request":
                result = self.web_agent.browse(step.url)  # ← 新增
```

---

## 5. 实施建议

### 5.1 Phase 1: 复用现有基础设施（1周）

#### ✅ **目标**: 让 Intelligence Agent 能在 E2B Sandbox 中运行

**步骤**:
1. **复制 AgentModeChat.tsx → IntelligenceAgentChat.tsx**
   - 去掉代码生成相关逻辑
   - 保留 E2B Sandbox 调用逻辑
   - 保留成本追踪
   - 保留 Chat 历史

2. **在 ChatModeSelector 中添加新模式**
   ```typescript
   {
     id: "intelligence_agent",
     name: "Intelligence Agent",
     icon: "🧠",
     description: "Query your Stanse data"
   }
   ```

3. **创建基础 API 端点**
   ```python
   # functions/ember-api/routes/intelligence_query.py

   @app.post("/intelligence-query")
   async def intelligence_query(request):
       # 先实现最简单的流程:
       # 1. 创建 Sandbox
       # 2. 执行简单的 Firestore 查询
       # 3. 返回结果
       pass
   ```

4. **测试 E2B Sandbox 能否访问 Firestore**
   - 上传 Service Account
   - 执行简单查询
   - 验证结果

**成功标准**:
- ✅ 能在 Sandbox 中查询 Firestore
- ✅ 前端能显示查询结果
- ✅ 成本正确追踪

---

### 5.2 Phase 2: 实现 Multi-Agent 系统（2周）

#### ⚠️ **目标**: 实现 5 个 Agent 的核心逻辑

**步骤**:
1. **创建 Collection Schema 元数据**
   ```python
   # 手动整理 40+ collections 的 schema
   # 或者编写脚本从 Firestore 自动生成
   ```

2. **实现 Schema Agent**
   - 调用 Ember API 理解意图
   - 映射到 collections

3. **实现 Query Planner**
   - 为常见问题预设查询模板
   - 处理依赖关系

4. **实现 Execution Agent**
   - Firestore 查询
   - 安全验证
   - 用户隔离

5. **实现 Review Agent**
   - 数据泄露检测
   - 结果验证

6. **实现 Synthesis Agent**
   - 调用 Ember API
   - 格式化输出

**成功标准**:
- ✅ 能回答："我支持的公司有什么新闻？"
- ✅ 能检测数据泄露
- ✅ 答案质量好

---

### 5.3 Phase 3: 添加高级功能（1周）

#### ⚠️ **目标**: 网页浏览、错误恢复、优化

**步骤**:
1. **实现 Web Agent**
   - 白名单域名
   - 内容提取

2. **错误处理**
   - 重试机制
   - 降级策略

3. **性能优化**
   - 查询缓存
   - Sandbox 模板化

**成功标准**:
- ✅ 能浏览 stanse.ai
- ✅ 错误能自动恢复
- ✅ 查询速度 <5s

---

## 6. 工作量估算

### 6.1 开发工作量

| 任务 | 复用度 | 新建工作量 | 总工作量 |
|------|--------|-----------|---------|
| **前端 UI** | 80% | 2 天 | 2 天 |
| **E2B Sandbox 集成** | 95% | 0.5 天 | 0.5 天 |
| **Schema Agent** | 0% | 3 天 | 3 天 |
| **Query Planner** | 0% | 2 天 | 2 天 |
| **Execution Agent** | 40% | 2 天 | 2 天 |
| **Review Agent** | 30% | 1 天 | 1 天 |
| **Synthesis Agent** | 70% | 1 天 | 1 天 |
| **Web Agent** | 0% | 2 天 | 2 天 |
| **测试和调优** | - | 3 天 | 3 天 |
| **文档** | - | 1 天 | 1 天 |

**总计**: **约 17-18 天**（3-4 周）

### 6.2 关键依赖

**数据准备**:
- ⚠️ **Collection Schema 元数据** - 需要 2-3 天整理
- ⚠️ **常见查询模板** - 需要 1 天设计

**技术依赖**:
- ✅ E2B API Key - 已有
- ✅ Firebase Service Account - 已有
- ✅ Ember API - 已有

---

## 7. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|-------|------|---------|
| **Schema 理解不准确** | 中 | 高 | 预设常见查询模板 |
| **数据泄露** | 低 | 极高 | 多层安全验证 |
| **E2B 成本过高** | 低 | 中 | 查询缓存 + 限流 |
| **查询速度慢** | 中 | 中 | Sandbox 模板化 |
| **Firestore 权限问题** | 低 | 高 | Service Account 测试 |

---

## 8. 推荐实施路线

### 🎯 **最小可行产品（MVP）路线**

**Week 1: 基础设施**
- ✅ 复制 AgentModeChat → IntelligenceAgentChat
- ✅ 创建 /intelligence-query API
- ✅ 测试 E2B + Firestore 集成
- ✅ 实现最简单的查询（单个 collection）

**Week 2: Core Agents**
- ⚠️ Schema Agent（简化版：预设意图映射）
- ⚠️ Query Planner（支持 3-5 个常见问题）
- ⚠️ Execution Agent（基础查询 + 安全检查）

**Week 3: Polish**
- ⚠️ Review Agent（数据泄露检测）
- ⚠️ Synthesis Agent（Ember API 集成）
- ✅ 错误处理和重试
- ✅ 前端 UI 完善

**Week 4: Advanced（可选）**
- ❌ Web Agent
- ⚠️ 查询缓存
- ⚠️ Sandbox 模板化

---

## 9. 成本对比

### 9.1 开发成本

| 方案 | 从零开始 | 基于 StanseAgent |
|------|---------|-----------------|
| **基础设施** | 5 天 | ✅ 0.5 天（复用 95%） |
| **前端 UI** | 5 天 | ✅ 2 天（复用 80%） |
| **E2B 集成** | 3 天 | ✅ 0.5 天（复用 95%） |
| **Multi-Agent** | 10 天 | ⚠️ 8 天（需新建） |
| **测试部署** | 3 天 | ✅ 2 天（复用流程） |
| **总计** | **26 天** | **13 天** |

**节省**: **50% 开发时间**

### 9.2 运营成本

```
单次查询成本（Intelligence Agent）:
- E2B Sandbox (10s): $0.00014
- Firestore 读取 (50 docs): $0.00003
- Ember API (Synthesis): $0.006
总计: ~$0.00617

单次查询成本（StanseAgent）:
- E2B Sandbox (10s): $0.00014
- LLM 代码生成: $0.01-0.02
总计: ~$0.01-0.02

结论: Intelligence Agent 更便宜
```

---

## 10. 总结和建议

### ✅ **可以直接复用的（70-80%）**

1. **E2B Sandbox 基础设施** - 100% 复用
2. **前端 UI 框架** - 80% 复用
3. **成本追踪系统** - 100% 复用
4. **错误处理** - 100% 复用
5. **Chat 历史管理** - 100% 复用

### ⚠️ **需要调整的（10-15%）**

1. **API 端点** - 新建但参考现有模式
2. **Sandbox 上传内容** - 从代码改为 Agent 系统
3. **UI 显示** - 从代码预览改为数据显示

### ❌ **需要新建的（10-15%）**

1. **Multi-Agent 系统**（核心逻辑）
2. **Collection Schema 元数据**
3. **Web Agent**（可选）

### 🎯 **最终建议**

**推荐方案**: 基于 StanseAgent 快速迭代

**理由**:
1. ✅ 节省 50% 开发时间
2. ✅ 复用成熟的 E2B 集成
3. ✅ 统一的成本管理
4. ✅ 一致的用户体验

**实施顺序**:
1. **Week 1**: 复用基础设施，实现简单查询
2. **Week 2**: 实现核心 Multi-Agent
3. **Week 3**: 完善和测试
4. **Week 4**: 高级功能（可选）

**关键成功因素**:
- ⚠️ Collection Schema 元数据质量
- ⚠️ 安全验证的严格性
- ⚠️ Ember API 调用质量（Synthesis Agent）

---

**下一步**: 是否开始 Phase 1 的实施（复用基础设施）？

