# E2B Intelligence Agent 系统架构设计

**文档编号**: 65
**创建日期**: 2026-01-27
**作者**: Claude Sonnet 4.5
**状态**: 设计阶段 (Design Phase)
**版本**: 1.0

---

## 📋 目录

- [1. 执行摘要](#1-执行摘要)
- [2. 系统概述](#2-系统概述)
- [3. 技术选型分析](#3-技术选型分析)
- [4. 核心架构设计](#4-核心架构设计)
- [5. E2B Sandbox 集成](#5-e2b-sandbox-集成)
- [6. Multi-Agent 系统设计](#6-multi-agent-系统设计)
- [7. 数据流和执行流程](#7-数据流和执行流程)
- [8. 安全和隔离机制](#8-安全和隔离机制)
- [9. 资源管理和成本优化](#9-资源管理和成本优化)
- [10. 错误处理和恢复](#10-错误处理和恢复)
- [11. 监控和审计](#11-监控和审计)
- [12. API 设计](#12-api-设计)
- [13. 部署架构](#13-部署架构)
- [14. 性能优化](#14-性能优化)
- [15. 未来扩展](#15-未来扩展)

---

## 1. 执行摘要

### 1.1 项目背景

Stanse AI Chat 当前提供 4 种聊天模式（Quick Answer、Expert Panel、Deep Analysis、Batch Processing），但缺少一个能够**智能查询平台数据**的 Agent 模式。用户无法问："我支持的公司有什么新闻？" 或 "我最近的政治立场有什么变化？"

### 1.2 设计目标

创建第 5 种模式：**Intelligence Agent**
- 能够理解用户问题并查询 Firestore 的 40+ collections
- 能够浏览网页（stanse.ai + 其他白名单网站）
- 能够整合多源数据生成答案
- **每个用户每个任务在独立的安全沙箱中执行**

### 1.3 技术方案

采用 **E2B Sandboxes**（Firecracker microVM）提供：
- 完全隔离的执行环境
- 200ms 快速启动
- 完整的 Python 生态系统
- Firebase Admin SDK 支持
- 无限制的互联网访问

### 1.4 核心价值

| 维度 | 价值 |
|------|------|
| **用户体验** | 自然语言查询平台数据，无需学习 Firestore 查询语法 |
| **安全性** | 每个任务独立 microVM，用户数据完全隔离 |
| **可扩展性** | Multi-Agent 架构，易于添加新能力 |
| **成本效益** | ~$0.006/任务，按秒计费 |

---

## 2. 系统概述

### 2.1 系统定位

```
Stanse AI Chat 模式层级：
├── Quick Answer         (简单问答, $0.001)
├── Expert Panel         (多模型对比, $0.004)
├── Deep Analysis        (深度分析, $0.018)
├── Batch Processing     (批量处理, $0.0002/q)
└── Intelligence Agent   (智能数据查询, $0.006) ← 新增
```

### 2.2 能力矩阵

| 能力 | 描述 | 优先级 |
|------|------|--------|
| **数据理解** | 理解 Firestore 数据结构和关系 | P0 |
| **查询规划** | 制定多步骤查询计划 | P0 |
| **安全执行** | 在隔离环境中安全执行查询 | P0 |
| **结果验证** | 验证查询结果，防止数据泄露 | P0 |
| **网页浏览** | 浏览 stanse.ai 等白名单网站 | P1 |
| **答案生成** | 整合数据生成自然语言答案 | P0 |
| **错误恢复** | 查询失败时自动重试或降级 | P1 |
| **成本优化** | 缓存常见查询，减少重复执行 | P2 |

### 2.3 系统边界

**在范围内 (In Scope)**:
- ✅ 查询 Firestore 的所有 public 和 user-private collections
- ✅ 浏览白名单内的网站
- ✅ 整合用户画像、新闻、公司数据等多源信息
- ✅ 生成个性化的数据洞察

**不在范围内 (Out of Scope)**:
- ❌ 写入 Firestore 数据（只读）
- ❌ 执行系统级命令（无需 root 权限）
- ❌ 访问其他用户的私有数据
- ❌ 长时间运行任务（>60秒超时）

---

## 3. 技术选型分析

### 3.1 Sandbox 技术对比

#### 3.1.1 方案对比表

| 方案 | E2B Sandboxes | Pyodide | Docker | Cloud Run |
|------|--------------|---------|--------|-----------|
| **隔离级别** | Firecracker microVM | Browser WASM | Container | Container |
| **启动时间** | 200ms | 1-3s | 2-5s | 5-10s |
| **Firebase Admin SDK** | ✅ 完整支持 | ❌ 不支持 | ✅ 支持 | ✅ 支持 |
| **互联网访问** | ✅ 无限制 | ⚠️ CORS 限制 | ✅ 无限制 | ✅ 无限制 |
| **Python 包** | ✅ 任何包 | ⚠️ 纯 Python | ✅ 任何包 | ✅ 任何包 |
| **成本/任务** | $0.00014 | 免费 | $0.001+ | $0.002+ |
| **并发扩展** | ✅ 自动 | N/A | ⚠️ 需配置 | ✅ 自动 |
| **持久化** | ✅ 文件系统 | ❌ 需手动 | ✅ Volume | ✅ Volume |
| **适用场景** | ✅ 完美匹配 | 轻量查询 | 传统后端 | 长服务 |

#### 3.1.2 选择 E2B 的理由

**技术优势**:
1. **最快启动**: 200ms vs Docker 的 2-5s
2. **真正隔离**: Firecracker（AWS Lambda 技术）
3. **无冷启动**: 预热的 microVM 池
4. **按秒计费**: 只为实际运行时间付费

**业务优势**:
1. **完美契合需求**: Firestore + 网页浏览
2. **开发体验好**: Python API 简洁
3. **安全性高**: 每个任务完全隔离
4. **可观测性**: 内置日志和监控

**成本优势**:
```
假设平均任务 10 秒：
- E2B: $0.00014 (计算) + $0.006 (Ember) = $0.00614
- Docker on Cloud Run: $0.001+ (计算) + $0.006 (Ember) = $0.007+
- Manus 完整 VM: ~$0.05

结论：E2B 是最具成本效益的方案
```

### 3.2 Multi-Agent 框架选型

#### 3.2.1 候选框架

| 框架 | 优势 | 劣势 | 决策 |
|------|------|------|------|
| **LangGraph** | 成熟、可视化、社区大 | 学习曲线陡 | ❌ 过于复杂 |
| **AutoGPT** | 自主决策能力强 | 难以控制、成本高 | ❌ 不可控 |
| **Custom** | 完全可控、轻量 | 需自研 | ✅ 采用 |

#### 3.2.2 自研 Multi-Agent 设计

采用**分层 Agent 架构**:

```
Orchestrator (协调者)
    ├─ Schema Agent      (理解数据结构)
    ├─ Query Planner     (制定查询计划)
    ├─ Execution Agent   (执行查询)
    ├─ Web Agent         (浏览网页)
    ├─ Review Agent      (验证结果)
    └─ Synthesis Agent   (生成答案)
```

**优势**:
- 职责清晰，易于测试
- 每个 Agent 可独立优化
- 灵活组合，适应不同任务
- 代码量可控（~2000 行）

---

## 4. 核心架构设计

### 4.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React/TypeScript)                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  EmberAIChatSidebar                                        │ │
│  │  - Intelligence Agent 模式选择                             │ │
│  │  - 用户输入："我支持的公司有什么新闻？"                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS POST /chat
                                │ {mode: "intelligence_agent"}
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│           Cloud Function: ember_api (Python, Gen2)              │
│           Project: gen-lang-client-0960644135                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  POST /chat Handler                                        │ │
│  │  - 接收请求                                                 │ │
│  │  - 验证用户权限                                             │ │
│  │  - 路由到 Intelligence Agent Handler                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                │                                 │
│                                ▼                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Intelligence Agent Orchestrator                           │ │
│  │  - 创建 E2B Sandbox                                        │ │
│  │  - 管理 Agent 生命周期                                     │ │
│  │  - 协调多个 Agent                                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ E2B SDK API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    E2B Sandbox (Firecracker microVM)            │
│                    每个任务一个独立实例                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Python 运行环境                                           │ │
│  │  - firebase-admin                                          │ │
│  │  - requests, beautifulsoup4                                │ │
│  │  - 用户上传的 Agent 代码                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                │                                 │
│                                ▼                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Multi-Agent System (在 Sandbox 内执行)                    │ │
│  │                                                            │ │
│  │  1. Schema Agent                                           │ │
│  │     - 理解用户意图                                         │ │
│  │     - 识别需要查询的 collections                           │ │
│  │                                                            │ │
│  │  2. Query Planner                                          │ │
│  │     - 制定查询计划                                         │ │
│  │     - 处理依赖关系                                         │ │
│  │                                                            │ │
│  │  3. Execution Agent                                        │ │
│  │     - 执行 Firestore 查询                                  │ │
│  │     - 执行网页请求                                         │ │
│  │                                                            │ │
│  │  4. Review Agent                                           │ │
│  │     - 验证结果安全性                                       │ │
│  │     - 检测数据泄露                                         │ │
│  │                                                            │ │
│  │  5. Synthesis Agent                                        │ │
│  │     - 调用 Ember API                                       │ │
│  │     - 生成自然语言答案                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                │                                 │
│                  ┌─────────────┴─────────────┐                  │
│                  │                           │                  │
│                  ▼                           ▼                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐   │
│  │  Firebase Admin SDK      │  │  HTTP Requests           │   │
│  │  - 查询 Firestore        │  │  - 浏览网页               │   │
│  │  - 完全权限              │  │  - 白名单域名             │   │
│  └──────────────────────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Firestore       │ │  Ember API       │ │  External Web    │
│  stanseproject   │ │  (LLM Service)   │ │  stanse.ai, etc  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 4.2 组件分层

#### 4.2.1 Frontend 层

**职责**: 用户交互界面

**组件**:
- `EmberAIChatSidebar.tsx`: 主聊天界面
- `ChatModeSelector.tsx`: 模式选择器（新增 Intelligence Agent）
- `CostTracker.tsx`: 成本追踪

**新增 UI 元素**:
```typescript
const intelligenceAgentMode = {
  id: "intelligence_agent",
  name: "Intelligence Agent",
  icon: "🧠",
  description: "Query your Stanse data intelligently",
  cost: "$0.006",
  time: "5-10s",
  features: [
    "Query Firestore collections",
    "Browse web pages (stanse.ai)",
    "Multi-step reasoning",
    "Personalized insights"
  ]
}
```

#### 4.2.2 Cloud Function 层

**职责**: API 网关和 Orchestrator

**核心模块**:

```
functions/ember-api/
├── routes/
│   └── intelligence_query.py     # 新增路由
├── orchestrators/
│   └── intelligence_orchestrator.py  # 核心协调器
├── e2b_integration/
│   ├── sandbox_manager.py        # E2B Sandbox 管理
│   ├── sandbox_pool.py           # Sandbox 池管理
│   └── code_templates/           # Agent 代码模板
└── utils/
    ├── security_validator.py     # 安全验证
    └── cost_estimator.py         # 成本估算
```

#### 4.2.3 E2B Sandbox 层

**职责**: 隔离执行环境

**运行内容**:
- Multi-Agent 系统（Python 代码）
- Firebase Admin SDK
- HTTP 客户端（requests）
- 临时上下文存储

**生命周期**:
```
创建 → 初始化 → 执行 → 返回结果 → 销毁
(200ms)  (2-3s)   (5-10s)  (<1s)     (即时)
```

### 4.3 数据模型

#### 4.3.1 请求模型

```typescript
interface IntelligenceQueryRequest {
  message: string              // 用户问题
  mode: "intelligence_agent"   // 固定值
  user_id: string              // 用户 ID
  user_context?: {             // 用户画像（可选）
    economic: number
    social: number
    diplomatic: number
    label: string
  }
  language?: string            // 语言（默认 ZH）
  options?: {
    enable_web_search?: boolean  // 是否启用网页搜索
    max_queries?: number         // 最大查询次数
    timeout?: number             // 超时（秒）
  }
}
```

#### 4.3.2 响应模型

```typescript
interface IntelligenceQueryResponse {
  success: boolean
  answer: string               // 最终答案
  metadata: {
    session_id: string         // E2B Sandbox ID
    execution_time: number     // 执行时间（秒）
    queries_executed: number   // 查询次数
    collections_accessed: string[]  // 访问的 collections
    web_pages_visited: string[]     // 访问的网页
    cost: {
      compute: number          // 计算成本
      llm: number              // LLM 成本
      total: number            // 总成本
    }
  }
  data_sources: Array<{        // 数据来源（用于引用）
    type: "firestore" | "web"
    source: string
    count: number
  }>
  debug?: {                    // Debug 信息（开发环境）
    query_plan: any[]
    execution_log: string[]
    errors: string[]
  }
}
```

#### 4.3.3 内部数据模型

**Intent 模型** (Schema Agent 输出):
```python
@dataclass
class Intent:
    intent_type: str  # "find_news", "analyze_stance", "compare_companies"
    entities: List[str]  # ["user.supported_entities", "news"]
    collections_needed: List[str]  # ["users", "company_news_by_ticker"]
    needs_web_search: bool
    complexity: str  # "simple", "medium", "complex"
```

**Query Plan 模型** (Query Planner 输出):
```python
@dataclass
class QueryStep:
    step_id: int
    step_type: str  # "firestore_query", "web_request", "compute"
    collection: Optional[str]
    filters: List[Tuple[str, str, Any]]
    limit: int
    depends_on: List[int]  # 依赖的步骤
    output_name: str

@dataclass
class QueryPlan:
    steps: List[QueryStep]
    execution_mode: str  # "sequential", "parallel"
    estimated_time: float
    estimated_cost: float
```

---

## 5. E2B Sandbox 集成

### 5.1 E2B SDK 集成

#### 5.1.1 安装和初始化

**requirements.txt**:
```
e2b-code-interpreter>=0.0.8
firebase-admin>=6.0.0
google-cloud-firestore>=2.11.0
```

**初始化 E2B 客户端**:
```python
# functions/ember-api/e2b_integration/sandbox_manager.py

import os
from e2b_code_interpreter import Sandbox
from google.cloud import secretmanager

class E2BSandboxManager:
    """E2B Sandbox 管理器"""

    def __init__(self):
        # 从 Secret Manager 获取 E2B API Key
        self.api_key = self._get_e2b_api_key()
        os.environ["E2B_API_KEY"] = self.api_key

    def _get_e2b_api_key(self) -> str:
        """从 Secret Manager 获取 E2B API Key"""
        client = secretmanager.SecretManagerServiceClient()
        name = "projects/gen-lang-client-0960644135/secrets/e2b-api-key/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")

    async def create_sandbox(self) -> Sandbox:
        """创建新的 Sandbox"""
        sandbox = await Sandbox.create(
            timeout=60,  # 60 秒超时
            metadata={
                "project": "stanse",
                "environment": "production"
            }
        )
        return sandbox
```

#### 5.1.2 Sandbox 配置

**环境变量传递**:
```python
async def configure_sandbox(sandbox: Sandbox, user_id: str):
    """配置 Sandbox 环境变量"""

    # 1. 项目信息
    sandbox.set_env_var("FIRESTORE_PROJECT_ID", "stanseproject")
    sandbox.set_env_var("USER_ID", user_id)

    # 2. API 端点
    ember_api_url = os.getenv("EMBER_API_URL")
    sandbox.set_env_var("EMBER_API_URL", ember_api_url)

    # 3. 白名单域名
    allowed_domains = ",".join([
        "stanse.ai",
        "news.google.com",
        "wikipedia.org"
    ])
    sandbox.set_env_var("ALLOWED_DOMAINS", allowed_domains)
```

**Service Account 传递**:
```python
async def upload_credentials(sandbox: Sandbox):
    """上传 Firebase Service Account 到 Sandbox"""

    # 从 Secret Manager 获取 service account
    service_account_json = get_service_account_from_secret_manager()

    # 写入 Sandbox 文件系统
    await sandbox.files.write(
        "/tmp/service-account.json",
        service_account_json
    )

    # 设置环境变量指向文件
    sandbox.set_env_var(
        "GOOGLE_APPLICATION_CREDENTIALS",
        "/tmp/service-account.json"
    )
```

### 5.2 依赖安装

#### 5.2.1 Python 包安装

**安装脚本**:
```python
async def install_dependencies(sandbox: Sandbox):
    """在 Sandbox 中安装依赖"""

    install_script = """
pip install --quiet \
    firebase-admin==6.4.0 \
    google-cloud-firestore==2.14.0 \
    requests==2.31.0 \
    beautifulsoup4==4.12.0 \
    lxml==5.1.0
"""

    # 执行安装（异步，不阻塞）
    result = await sandbox.commands.run(install_script, timeout=30)

    if result.exit_code != 0:
        raise Exception(f"Failed to install dependencies: {result.stderr}")

    return result
```

#### 5.2.2 预热机制（性能优化）

为了减少首次安装时间，可以创建**预装依赖的 Sandbox 模板**:

```python
class SandboxTemplateManager:
    """Sandbox 模板管理器"""

    async def create_template(self):
        """创建预装依赖的模板"""

        # 1. 创建临时 Sandbox
        sandbox = await Sandbox.create()

        # 2. 安装所有依赖
        await install_dependencies(sandbox)

        # 3. 保存为模板（E2B Pro 功能）
        template_id = await sandbox.save_as_template(
            name="stanse-intelligence-agent-v1"
        )

        # 4. 清理
        await sandbox.close()

        return template_id

    async def create_from_template(self, template_id: str) -> Sandbox:
        """从模板创建 Sandbox（秒级启动）"""
        sandbox = await Sandbox.create(template=template_id)
        return sandbox
```

**优势**:
- 从 3 秒安装时间 → 200ms 启动
- 适合高频使用场景

### 5.3 代码上传

#### 5.3.1 Agent 代码模板

**代码结构**:
```
/tmp/
├── agent_system.py           # Agent 系统核心代码
├── schema_agent.py           # Schema Agent
├── query_planner.py          # Query Planner
├── execution_agent.py        # Execution Agent
├── review_agent.py           # Review Agent
├── synthesis_agent.py        # Synthesis Agent
├── utils.py                  # 工具函数
└── main.py                   # 入口文件
```

**上传方法**:
```python
async def upload_agent_code(sandbox: Sandbox):
    """上传 Agent 代码到 Sandbox"""

    code_templates_dir = Path(__file__).parent / "code_templates"

    files_to_upload = [
        "agent_system.py",
        "schema_agent.py",
        "query_planner.py",
        "execution_agent.py",
        "review_agent.py",
        "synthesis_agent.py",
        "utils.py",
        "main.py"
    ]

    for filename in files_to_upload:
        file_path = code_templates_dir / filename
        content = file_path.read_text()

        await sandbox.files.write(f"/tmp/{filename}", content)
```

#### 5.3.2 动态代码生成

某些配置需要动态生成：

```python
def generate_collection_metadata(collections: List[str]) -> str:
    """生成 Collection 元数据代码"""

    # 从 Firestore 获取 schema
    schemas = get_collection_schemas()

    metadata_code = """
COLLECTION_METADATA = {
"""
    for collection in collections:
        schema = schemas.get(collection, {})
        metadata_code += f"""
    "{collection}": {{
        "type": "{schema.get('type', 'unknown')}",
        "fields": {schema.get('fields', [])},
        "access": "{schema.get('access', 'public')}",
        "relationships": {schema.get('relationships', [])}
    }},
"""
    metadata_code += "}\n"

    return metadata_code
```

### 5.4 执行和通信

#### 5.4.1 执行 Agent

**方式 1: stdin/stdout 通信**
```python
async def execute_agent_via_stdio(
    sandbox: Sandbox,
    user_query: str
) -> dict:
    """通过 stdin/stdout 执行 Agent"""

    # 准备输入
    input_data = json.dumps({
        "query": user_query,
        "user_id": sandbox.get_env_var("USER_ID")
    })

    # 执行
    execution = await sandbox.commands.run(
        f'python /tmp/main.py <<< \'{input_data}\'',
        timeout=60
    )

    # 解析输出
    if execution.exit_code != 0:
        raise Exception(f"Execution failed: {execution.stderr}")

    result = json.loads(execution.stdout)
    return result
```

**方式 2: 文件通信**（适合大量数据）
```python
async def execute_agent_via_file(
    sandbox: Sandbox,
    user_query: str
) -> dict:
    """通过文件执行 Agent（适合大数据量）"""

    # 1. 写入输入文件
    input_data = {
        "query": user_query,
        "user_id": sandbox.get_env_var("USER_ID")
    }
    await sandbox.files.write(
        "/tmp/input.json",
        json.dumps(input_data)
    )

    # 2. 执行
    execution = await sandbox.commands.run(
        "python /tmp/main.py --input /tmp/input.json --output /tmp/output.json",
        timeout=60
    )

    # 3. 读取输出文件
    output_content = await sandbox.files.read("/tmp/output.json")
    result = json.loads(output_content)

    return result
```

#### 5.4.2 实时日志流式输出

```python
async def execute_with_streaming_logs(
    sandbox: Sandbox,
    user_query: str
):
    """执行并实时流式输出日志"""

    # 启动进程
    process = await sandbox.process.start("python /tmp/main.py")

    # 流式读取 stdout
    async for line in process.stdout:
        print(f"[Agent Log] {line}")
        # 可以发送到前端显示进度

    # 等待完成
    exit_code = await process.wait()

    if exit_code != 0:
        stderr = await process.stderr.read()
        raise Exception(f"Execution failed: {stderr}")
```

### 5.5 Sandbox 清理

#### 5.5.1 自动清理

```python
async def execute_in_sandbox_with_cleanup(
    user_id: str,
    user_query: str
) -> dict:
    """执行任务并自动清理 Sandbox"""

    sandbox = None
    try:
        # 1. 创建 Sandbox
        sandbox = await create_sandbox()

        # 2. 配置
        await configure_sandbox(sandbox, user_id)
        await upload_credentials(sandbox)
        await upload_agent_code(sandbox)

        # 3. 执行
        result = await execute_agent_via_stdio(sandbox, user_query)

        return result

    finally:
        # 4. 清理（无论成功失败都执行）
        if sandbox:
            await sandbox.close()
```

#### 5.5.2 超时清理

```python
async def execute_with_timeout(
    sandbox: Sandbox,
    timeout_seconds: int = 60
):
    """带超时的执行"""

    try:
        result = await asyncio.wait_for(
            execute_agent_via_stdio(sandbox, user_query),
            timeout=timeout_seconds
        )
        return result

    except asyncio.TimeoutError:
        # 超时时强制关闭 Sandbox
        await sandbox.kill()
        raise Exception(f"Task timeout after {timeout_seconds}s")
```

---

## 6. Multi-Agent 系统设计

### 6.1 Agent 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                  Agent Orchestrator                      │
│  - 协调所有 Agent                                        │
│  - 管理执行流程                                          │
│  - 处理错误恢复                                          │
└──────────┬──────────────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐ ┌─────────┐
│ Schema  │ │  Query  │
│ Agent   │→│ Planner │
└─────────┘ └─────┬───┘
                  │
            ┌─────┴─────┐
            │           │
            ▼           ▼
      ┌──────────┐ ┌──────────┐
      │Execution │ │   Web    │
      │  Agent   │ │  Agent   │
      └────┬─────┘ └────┬─────┘
           │            │
           └─────┬──────┘
                 │
                 ▼
           ┌──────────┐
           │  Review  │
           │  Agent   │
           └────┬─────┘
                │
                ▼
          ┌───────────┐
          │Synthesis  │
          │  Agent    │
          └───────────┘
```

### 6.2 Agent 1: Schema Agent

#### 6.2.1 职责

- 理解用户自然语言问题
- 识别需要查询的 collections
- 确定数据之间的关系
- 输出结构化的 Intent

#### 6.2.2 核心逻辑

```python
# code_templates/schema_agent.py

class SchemaAgent:
    """Schema Agent - 理解数据结构和用户意图"""

    def __init__(self, collections_metadata: dict):
        self.collections = collections_metadata
        self.relationship_graph = self._build_relationship_graph()

    def _build_relationship_graph(self) -> dict:
        """构建 Collection 关系图"""
        graph = {}

        # 示例关系
        graph["users"] = {
            "supported_entities": "entityStances.entityId",
            "persona_embeddings": "user_persona_embeddings.userId"
        }

        graph["news_prism_lens"] = {
            "newsId": "news.id",
            "userId": "users.userId"
        }

        return graph

    async def analyze(self, query: str, user_id: str) -> Intent:
        """分析用户查询"""

        # 1. 使用 LLM 理解意图（调用 Ember API）
        llm_analysis = await self._call_ember_for_intent(query)

        # 2. 提取关键实体
        entities = self._extract_entities(llm_analysis)

        # 3. 映射到 collections
        collections_needed = self._map_to_collections(entities)

        # 4. 检查是否需要网页搜索
        needs_web = self._check_web_search_need(query, llm_analysis)

        # 5. 评估复杂度
        complexity = self._estimate_complexity(collections_needed, needs_web)

        return Intent(
            intent_type=llm_analysis["intent_type"],
            entities=entities,
            collections_needed=collections_needed,
            needs_web_search=needs_web,
            complexity=complexity
        )

    async def _call_ember_for_intent(self, query: str) -> dict:
        """调用 Ember API 理解意图"""

        prompt = f"""
你是 Stanse 数据库的 Schema 专家。分析用户问题并识别需要查询的数据。

可用的 Collections:
{json.dumps(self.collections, indent=2)}

用户问题: {query}

请输出 JSON 格式：
{{
    "intent_type": "find_news" | "analyze_stance" | "compare_entities" | "trend_analysis",
    "entities": ["user.supported_entities", "news", ...],
    "requires_aggregation": true/false,
    "temporal_scope": "recent" | "all_time" | null
}}
"""

        response = requests.post(
            os.getenv("EMBER_API_URL") + "/chat",
            json={
                "message": prompt,
                "mode": "default",
                "language": "EN"  # 系统内部用英文
            }
        )

        return json.loads(response.json()["answer"])

    def _extract_entities(self, llm_analysis: dict) -> List[str]:
        """提取关键实体"""
        return llm_analysis.get("entities", [])

    def _map_to_collections(self, entities: List[str]) -> List[str]:
        """将实体映射到 Firestore collections"""
        collections = set()

        for entity in entities:
            if "user" in entity.lower():
                collections.add("users")
            if "news" in entity.lower():
                collections.add("news")
            if "company" in entity.lower():
                collections.update([
                    "company_rankings",
                    "company_news_by_ticker"
                ])
            # ... 更多映射逻辑

        return list(collections)

    def _check_web_search_need(self, query: str, analysis: dict) -> bool:
        """检查是否需要网页搜索"""

        web_keywords = ["网站", "stanse.ai", "最新", "实时"]
        if any(keyword in query for keyword in web_keywords):
            return True

        return analysis.get("needs_web_search", False)

    def _estimate_complexity(
        self,
        collections: List[str],
        needs_web: bool
    ) -> str:
        """估算查询复杂度"""

        score = len(collections)
        if needs_web:
            score += 2

        if score <= 2:
            return "simple"
        elif score <= 5:
            return "medium"
        else:
            return "complex"
```

#### 6.2.3 输出示例

**用户问题**: "我支持的公司最近有什么新闻？"

**Schema Agent 输出**:
```json
{
  "intent_type": "find_company_news",
  "entities": [
    "user.supported_entities",
    "company_news_by_ticker"
  ],
  "collections_needed": [
    "users",
    "company_news_by_ticker"
  ],
  "needs_web_search": false,
  "complexity": "medium"
}
```

### 6.3 Agent 2: Query Planner

#### 6.3.1 职责

- 根据 Intent 制定查询计划
- 处理步骤之间的依赖关系
- 优化查询顺序
- 估算成本和时间

#### 6.3.2 核心逻辑

```python
# code_templates/query_planner.py

class QueryPlannerAgent:
    """Query Planner - 制定查询计划"""

    def __init__(self, user_id: str):
        self.user_id = user_id

    def create_plan(self, intent: Intent) -> QueryPlan:
        """创建查询计划"""

        steps = []

        # 1. 根据 intent 类型生成步骤
        if intent.intent_type == "find_company_news":
            steps = self._plan_find_company_news()

        elif intent.intent_type == "analyze_stance":
            steps = self._plan_analyze_stance()

        elif intent.intent_type == "compare_entities":
            steps = self._plan_compare_entities()

        # 2. 优化步骤顺序
        steps = self._optimize_steps(steps)

        # 3. 估算成本和时间
        estimated_time = self._estimate_time(steps)
        estimated_cost = self._estimate_cost(steps)

        # 4. 决定执行模式
        execution_mode = self._decide_execution_mode(steps)

        return QueryPlan(
            steps=steps,
            execution_mode=execution_mode,
            estimated_time=estimated_time,
            estimated_cost=estimated_cost
        )

    def _plan_find_company_news(self) -> List[QueryStep]:
        """规划"查找公司新闻"任务"""

        return [
            QueryStep(
                step_id=1,
                step_type="firestore_query",
                collection="users",
                filters=[("userId", "==", self.user_id)],
                limit=1,
                depends_on=[],
                output_name="user_profile"
            ),
            QueryStep(
                step_id=2,
                step_type="firestore_query",
                collection="company_news_by_ticker",
                filters=[
                    ("ticker", "in", "{{user_profile.supported_entities}}"),
                    ("timestamp", ">", "{{30_days_ago}}")
                ],
                limit=50,
                depends_on=[1],  # 依赖 step 1
                output_name="company_news"
            ),
            QueryStep(
                step_id=3,
                step_type="compute",
                action="sort_by_relevance",
                depends_on=[2],
                output_name="sorted_news"
            )
        ]

    def _plan_analyze_stance(self) -> List[QueryStep]:
        """规划"分析立场"任务"""

        return [
            QueryStep(
                step_id=1,
                step_type="firestore_query",
                collection="users",
                filters=[("userId", "==", self.user_id)],
                limit=1,
                depends_on=[],
                output_name="user_persona"
            ),
            QueryStep(
                step_id=2,
                step_type="firestore_query",
                collection="news_prism_lens",
                filters=[
                    ("userId", "==", self.user_id),
                    ("timestamp", ">", "{{30_days_ago}}")
                ],
                limit=100,
                depends_on=[],
                output_name="user_feedback"
            ),
            QueryStep(
                step_id=3,
                step_type="firestore_query",
                collection="news",
                filters=[("id", "in", "{{user_feedback.newsIds}}")],
                limit=100,
                depends_on=[2],
                output_name="news_details"
            ),
            QueryStep(
                step_id=4,
                step_type="compute",
                action="calculate_stance_evolution",
                depends_on=[1, 3],
                output_name="stance_analysis"
            )
        ]

    def _optimize_steps(self, steps: List[QueryStep]) -> List[QueryStep]:
        """优化步骤顺序"""

        # 简单的拓扑排序
        # 实际实现可以更复杂（考虑并行化）

        sorted_steps = []
        completed = set()

        while len(sorted_steps) < len(steps):
            for step in steps:
                if step.step_id in completed:
                    continue

                # 检查依赖是否都完成
                if all(dep in completed for dep in step.depends_on):
                    sorted_steps.append(step)
                    completed.add(step.step_id)

        return sorted_steps

    def _estimate_time(self, steps: List[QueryStep]) -> float:
        """估算执行时间（秒）"""

        time_per_step = {
            "firestore_query": 0.5,
            "web_request": 2.0,
            "compute": 0.1
        }

        total = sum(time_per_step.get(step.step_type, 1.0) for step in steps)
        return total

    def _estimate_cost(self, steps: List[QueryStep]) -> float:
        """估算成本（美元）"""

        # Firestore 读取成本（非常低，忽略）
        # 主要成本是 E2B Sandbox + Ember API

        compute_cost = 0.00014  # E2B per task
        llm_cost = 0.006        # Ember API call

        return compute_cost + llm_cost

    def _decide_execution_mode(self, steps: List[QueryStep]) -> str:
        """决定执行模式"""

        # 检查是否有步骤可以并行
        independent_steps = [
            step for step in steps if not step.depends_on
        ]

        if len(independent_steps) > 1:
            return "parallel"
        else:
            return "sequential"
```

#### 6.3.3 输出示例

```json
{
  "steps": [
    {
      "step_id": 1,
      "step_type": "firestore_query",
      "collection": "users",
      "filters": [["userId", "==", "user123"]],
      "limit": 1,
      "depends_on": [],
      "output_name": "user_profile"
    },
    {
      "step_id": 2,
      "step_type": "firestore_query",
      "collection": "company_news_by_ticker",
      "filters": [
        ["ticker", "in", "{{user_profile.supported_entities}}"],
        ["timestamp", ">", "2026-12-27"]
      ],
      "limit": 50,
      "depends_on": [1],
      "output_name": "company_news"
    }
  ],
  "execution_mode": "sequential",
  "estimated_time": 1.0,
  "estimated_cost": 0.00614
}
```

### 6.4 Agent 3: Execution Agent

#### 6.4.1 职责

- 执行 Firestore 查询
- 执行网页请求
- 执行计算任务
- 维护执行上下文

#### 6.4.2 核心逻辑

```python
# code_templates/execution_agent.py

class ExecutionAgent:
    """Execution Agent - 执行查询和计算"""

    def __init__(self, db, user_id: str):
        self.db = db
        self.user_id = user_id
        self.context = {}  # 执行上下文（存储中间结果）
        self.audit_log = []

        # 安全配置
        self.restricted_collections = [
            "payment_methods",
            "revenue",
            "duel_platform_revenue",
            "subscription_events"
        ]

        self.user_private_collections = [
            "users",
            "news_prism_lens",
            "user_subscriptions",
            "user_credits",
            "userNotifications"
        ]

    async def execute_plan(self, plan: QueryPlan) -> List[Any]:
        """执行查询计划"""

        results = []

        if plan.execution_mode == "sequential":
            results = await self._execute_sequential(plan.steps)
        else:
            results = await self._execute_parallel(plan.steps)

        return results

    async def _execute_sequential(self, steps: List[QueryStep]) -> List[Any]:
        """顺序执行"""

        results = []

        for step in steps:
            result = await self._execute_step(step)
            results.append(result)

            # 保存到上下文
            self.context[step.output_name] = result

        return results

    async def _execute_parallel(self, steps: List[QueryStep]) -> List[Any]:
        """并行执行（无依赖的步骤）"""

        import asyncio

        # 分组：无依赖的可以并行
        independent = [s for s in steps if not s.depends_on]
        dependent = [s for s in steps if s.depends_on]

        # 并行执行无依赖的
        tasks = [self._execute_step(step) for step in independent]
        parallel_results = await asyncio.gather(*tasks)

        # 保存到上下文
        for step, result in zip(independent, parallel_results):
            self.context[step.output_name] = result

        # 顺序执行有依赖的
        dependent_results = await self._execute_sequential(dependent)

        return parallel_results + dependent_results

    async def _execute_step(self, step: QueryStep) -> Any:
        """执行单个步骤"""

        if step.step_type == "firestore_query":
            return await self._execute_firestore_query(step)

        elif step.step_type == "web_request":
            return await self._execute_web_request(step)

        elif step.step_type == "compute":
            return await self._execute_compute(step)

        else:
            raise ValueError(f"Unknown step type: {step.step_type}")

    async def _execute_firestore_query(self, step: QueryStep) -> List[dict]:
        """执行 Firestore 查询"""

        collection = step.collection
        filters = step.filters
        limit = step.limit

        # 1. 安全检查
        self._validate_collection_access(collection)

        # 2. 强制用户数据隔离
        if collection in self.user_private_collections:
            filters = self._enforce_user_filter(filters)

        # 3. 解析变量（{{user_profile.supported_entities}}）
        filters = self._resolve_variables(filters)

        # 4. 执行查询
        query_ref = self.db.collection(collection)

        for field, op, value in filters:
            query_ref = query_ref.where(field, op, value)

        query_ref = query_ref.limit(limit)

        # 5. 获取结果
        docs = query_ref.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            results.append(data)

        # 6. 审计日志
        self._log_query(collection, filters, len(results))

        return results

    def _validate_collection_access(self, collection: str):
        """验证 collection 访问权限"""

        if collection in self.restricted_collections:
            raise PermissionError(
                f"Access denied: {collection} contains sensitive data"
            )

    def _enforce_user_filter(self, filters: List[Tuple]) -> List[Tuple]:
        """强制添加 userId 过滤"""

        has_user_filter = any(f[0] == "userId" for f in filters)

        if not has_user_filter:
            filters = filters + [("userId", "==", self.user_id)]
        else:
            # 验证 userId 是否匹配
            for field, op, value in filters:
                if field == "userId" and value != self.user_id:
                    raise PermissionError(
                        f"Cannot access other users' data"
                    )

        return filters

    def _resolve_variables(self, filters: List[Tuple]) -> List[Tuple]:
        """解析变量引用"""

        resolved = []

        for field, op, value in filters:
            if isinstance(value, str) and value.startswith("{{"):
                # 解析变量: {{user_profile.supported_entities}}
                var_path = value.strip("{").strip("}")
                value = self._get_from_context(var_path)

            resolved.append((field, op, value))

        return resolved

    def _get_from_context(self, path: str) -> Any:
        """从上下文获取值"""

        parts = path.split(".")
        value = self.context

        for part in parts:
            if isinstance(value, list) and len(value) > 0:
                value = value[0]
            value = value.get(part)

        return value

    async def _execute_web_request(self, step: QueryStep) -> str:
        """执行网页请求"""

        url = step.url

        # 1. 白名单验证
        allowed_domains = os.getenv("ALLOWED_DOMAINS", "").split(",")
        if not any(domain in url for domain in allowed_domains):
            raise PermissionError(f"Domain not allowed: {url}")

        # 2. 发起请求
        import requests
        from bs4 import BeautifulSoup

        response = requests.get(url, timeout=10)

        # 3. 提取文本
        soup = BeautifulSoup(response.text, 'html.parser')
        text = soup.get_text()

        # 4. 限制长度
        text = text[:5000]

        # 5. 审计日志
        self._log_web_request(url, len(text))

        return text

    async def _execute_compute(self, step: QueryStep) -> Any:
        """执行计算任务"""

        action = step.action

        if action == "sort_by_relevance":
            return self._sort_by_relevance(step)

        elif action == "calculate_stance_evolution":
            return self._calculate_stance_evolution(step)

        # ... 更多计算逻辑

    def _log_query(self, collection: str, filters: List, count: int):
        """记录查询日志"""

        self.audit_log.append({
            "type": "firestore_query",
            "collection": collection,
            "filters": str(filters),
            "result_count": count,
            "timestamp": datetime.now().isoformat()
        })

    def _log_web_request(self, url: str, size: int):
        """记录网页请求日志"""

        self.audit_log.append({
            "type": "web_request",
            "url": url,
            "response_size": size,
            "timestamp": datetime.now().isoformat()
        })
```

### 6.5 Agent 4: Review Agent

#### 6.5.1 职责

- 验证查询结果的安全性
- 检测数据泄露
- 验证数据完整性
- 生成验证报告

#### 6.5.2 核心逻辑

```python
# code_templates/review_agent.py

class ReviewAgent:
    """Review Agent - 验证结果安全性"""

    def __init__(self, user_id: str):
        self.user_id = user_id

    def validate(
        self,
        results: List[Any],
        audit_log: List[dict]
    ) -> ValidationReport:
        """验证结果"""

        checks = []
        errors = []

        # 1. 检查数据泄露
        leakage_check = self._check_data_leakage(results)
        checks.append(leakage_check)
        if not leakage_check["passed"]:
            errors.append(leakage_check["error"])

        # 2. 检查数据完整性
        integrity_check = self._check_data_integrity(results)
        checks.append(integrity_check)

        # 3. 检查访问合规性
        compliance_check = self._check_access_compliance(audit_log)
        checks.append(compliance_check)
        if not compliance_check["passed"]:
            errors.append(compliance_check["error"])

        # 4. 检查敏感字段
        sensitive_check = self._check_sensitive_fields(results)
        checks.append(sensitive_check)

        passed = len(errors) == 0

        return ValidationReport(
            passed=passed,
            checks=checks,
            errors=errors,
            timestamp=datetime.now().isoformat()
        )

    def _check_data_leakage(self, results: List[Any]) -> dict:
        """检查是否泄露其他用户数据"""

        for result in results:
            if isinstance(result, list):
                for doc in result:
                    if isinstance(doc, dict) and "userId" in doc:
                        if doc["userId"] != self.user_id:
                            return {
                                "name": "Data Leakage Check",
                                "passed": False,
                                "error": f"Found other user's data: {doc['userId']}"
                            }

        return {
            "name": "Data Leakage Check",
            "passed": True,
            "message": "No data leakage detected"
        }

    def _check_data_integrity(self, results: List[Any]) -> dict:
        """检查数据完整性"""

        # 检查是否有空结果、null 值等

        for result in results:
            if result is None:
                return {
                    "name": "Data Integrity Check",
                    "passed": False,
                    "error": "Found null result"
                }

        return {
            "name": "Data Integrity Check",
            "passed": True,
            "message": "Data integrity verified"
        }

    def _check_access_compliance(self, audit_log: List[dict]) -> dict:
        """检查访问合规性"""

        restricted = ["payment_methods", "revenue"]

        for log in audit_log:
            if log["type"] == "firestore_query":
                collection = log.get("collection")
                if collection in restricted:
                    return {
                        "name": "Access Compliance Check",
                        "passed": False,
                        "error": f"Attempted to access restricted collection: {collection}"
                    }

        return {
            "name": "Access Compliance Check",
            "passed": True,
            "message": "All accesses compliant"
        }

    def _check_sensitive_fields(self, results: List[Any]) -> dict:
        """检查敏感字段是否被移除"""

        sensitive_fields = ["password", "paymentToken", "apiKey"]

        for result in results:
            if isinstance(result, list):
                for doc in result:
                    if isinstance(doc, dict):
                        for field in sensitive_fields:
                            if field in doc:
                                return {
                                    "name": "Sensitive Fields Check",
                                    "passed": False,
                                    "error": f"Sensitive field not removed: {field}"
                                }

        return {
            "name": "Sensitive Fields Check",
            "passed": True,
            "message": "No sensitive fields found"
        }
```

### 6.6 Agent 5: Synthesis Agent

#### 6.6.1 职责

- 整合所有查询结果
- 调用 Ember API 生成自然语言答案
- 添加数据来源引用
- 格式化输出

#### 6.6.2 核心逻辑

```python
# code_templates/synthesis_agent.py

class SynthesisAgent:
    """Synthesis Agent - 生成最终答案"""

    def __init__(self, ember_api_url: str):
        self.ember_api_url = ember_api_url

    async def generate_answer(
        self,
        query: str,
        results: List[Any],
        context: dict,
        user_persona: Optional[dict] = None
    ) -> dict:
        """生成最终答案"""

        # 1. 整合数据
        integrated_data = self._integrate_data(results, context)

        # 2. 构建 prompt
        prompt = self._build_prompt(query, integrated_data, user_persona)

        # 3. 调用 Ember API
        ember_response = await self._call_ember_api(prompt, user_persona)

        # 4. 添加引用
        answer_with_citations = self._add_citations(
            ember_response["answer"],
            integrated_data
        )

        # 5. 格式化输出
        final_output = {
            "answer": answer_with_citations,
            "data_summary": self._create_data_summary(integrated_data),
            "sources": self._extract_sources(context),
            "cost": ember_response.get("cost", 0.006)
        }

        return final_output

    def _integrate_data(self, results: List[Any], context: dict) -> dict:
        """整合数据"""

        integrated = {}

        for key, value in context.items():
            # 提取关键信息
            if isinstance(value, list):
                integrated[key] = {
                    "count": len(value),
                    "sample": value[:5] if len(value) > 5 else value,
                    "summary": self._summarize_list(value)
                }
            else:
                integrated[key] = value

        return integrated

    def _build_prompt(
        self,
        query: str,
        data: dict,
        user_persona: Optional[dict]
    ) -> str:
        """构建 Ember API prompt"""

        prompt = f"""
你是 Stanse Intelligence Agent，帮助用户理解他们的数据。

用户问题: {query}

可用数据:
{json.dumps(data, indent=2, ensure_ascii=False)}
"""

        if user_persona:
            prompt += f"""

用户画像:
- 经济立场: {user_persona.get('economic', 0)}
- 社会立场: {user_persona.get('social', 0)}
- 外交立场: {user_persona.get('diplomatic', 0)}
- 标签: {user_persona.get('label', 'Unknown')}

请基于用户的政治倾向，生成个性化的回答。
"""

        prompt += """

要求:
1. 用中文回答
2. 基于提供的数据，不要编造信息
3. 如果数据不足，明确指出
4. 突出关键洞察
5. 简洁明了，避免冗长
"""

        return prompt

    async def _call_ember_api(
        self,
        prompt: str,
        user_persona: Optional[dict]
    ) -> dict:
        """调用 Ember API"""

        import requests

        response = requests.post(
            self.ember_api_url + "/chat",
            json={
                "message": prompt,
                "mode": "default",
                "user_context": user_persona,
                "language": "ZH"
            },
            timeout=30
        )

        if response.status_code != 200:
            raise Exception(f"Ember API error: {response.text}")

        return response.json()

    def _add_citations(self, answer: str, data: dict) -> str:
        """添加数据引用"""

        citations = "\n\n📊 数据来源:\n"

        for key, value in data.items():
            if isinstance(value, dict) and "count" in value:
                citations += f"- {key}: {value['count']} 条记录\n"

        return answer + citations

    def _create_data_summary(self, data: dict) -> dict:
        """创建数据摘要"""

        summary = {
            "total_records": 0,
            "collections_used": []
        }

        for key, value in data.items():
            if isinstance(value, dict) and "count" in value:
                summary["total_records"] += value["count"]
                summary["collections_used"].append(key)

        return summary

    def _extract_sources(self, context: dict) -> List[dict]:
        """提取数据来源"""

        sources = []

        for key, value in context.items():
            if isinstance(value, list) and len(value) > 0:
                sources.append({
                    "type": "firestore",
                    "collection": key,
                    "count": len(value)
                })

        return sources
```

---

## 7. 数据流和执行流程

### 7.1 完整执行流程图

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Frontend: 用户输入                                        │
│    "我支持的公司最近有什么新闻？"                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Cloud Function: 接收请求                                 │
│    POST /chat {mode: "intelligence_agent", message: ...}    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Orchestrator: 创建 E2B Sandbox                           │
│    - sandbox = await Sandbox.create()                       │
│    - 启动时间: 200ms                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 配置 Sandbox                                              │
│    - 上传 service account                                    │
│    - 设置环境变量                                             │
│    - 安装依赖（或使用模板）                                   │
│    - 上传 Agent 代码                                         │
│    时间: 2-3s（首次），200ms（使用模板）                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. 在 Sandbox 中执行 Multi-Agent                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Schema Agent   │ │ Query Planner  │ │ Execution      │
│ 分析意图        │→│ 制定计划        │→│ 执行查询        │
│ 0.5s           │ │ 0.2s           │ │ 2-5s           │
└────────────────┘ └────────────────┘ └───────┬────────┘
                                              │
                                              ▼
                                    ┌────────────────┐
                                    │ Review Agent   │
                                    │ 验证结果        │
                                    │ 0.1s           │
                                    └───────┬────────┘
                                            │
                                            ▼
                                  ┌────────────────┐
                                  │ Synthesis      │
                                  │ 生成答案        │
                                  │ 2s (Ember API) │
                                  └───────┬────────┘
                                          │
┌─────────────────────────────────────────┴───────────────────┐
│ 6. 返回结果到 Cloud Function                                │
│    - 读取 stdout/output file                                │
│    - 解析 JSON                                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. 清理 Sandbox                                              │
│    - await sandbox.close()                                  │
│    - 即时销毁，释放资源                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. 返回响应到 Frontend                                       │
│    - 显示答案                                                │
│    - 显示成本和执行时间                                      │
│    - 显示数据来源                                            │
└─────────────────────────────────────────────────────────────┘

总执行时间: 5-10s
总成本: ~$0.006
```

### 7.2 数据流详解

#### 7.2.1 请求阶段

**Frontend → Cloud Function**:
```json
{
  "message": "我支持的公司最近有什么新闻？",
  "mode": "intelligence_agent",
  "user_id": "user123",
  "language": "ZH"
}
```

#### 7.2.2 Sandbox 创建阶段

**Cloud Function → E2B API**:
```python
sandbox = await Sandbox.create(
    timeout=60,
    metadata={"user_id": "user123"}
)
# 返回: Sandbox(id="sandbox_abc123", status="ready")
```

#### 7.2.3 Agent 执行阶段

**Input to Sandbox**:
```json
{
  "query": "我支持的公司最近有什么新闻？",
  "user_id": "user123"
}
```

**Schema Agent → Query Planner**:
```json
{
  "intent_type": "find_company_news",
  "collections_needed": ["users", "company_news_by_ticker"],
  "complexity": "medium"
}
```

**Query Planner → Execution Agent**:
```json
{
  "steps": [
    {"step_id": 1, "collection": "users", ...},
    {"step_id": 2, "collection": "company_news_by_ticker", ...}
  ],
  "execution_mode": "sequential"
}
```

**Execution Agent → Firestore**:
```python
# Step 1
db.collection("users").where("userId", "==", "user123").get()
# 返回: [{"userId": "user123", "supported_entities": ["AAPL", "TSLA"]}]

# Step 2
db.collection("company_news_by_ticker") \
  .where("ticker", "in", ["AAPL", "TSLA"]) \
  .where("timestamp", ">", "2026-12-27") \
  .limit(50).get()
# 返回: [{"ticker": "AAPL", "title": "...", ...}, ...]
```

**Review Agent 验证**:
```json
{
  "passed": true,
  "checks": [
    {"name": "Data Leakage Check", "passed": true},
    {"name": "Access Compliance Check", "passed": true}
  ]
}
```

**Synthesis Agent → Ember API**:
```json
{
  "message": "根据以下数据回答...",
  "mode": "default",
  "language": "ZH"
}
```

**Ember API → Synthesis Agent**:
```json
{
  "success": true,
  "answer": "您支持的公司（Apple 和 Tesla）最近有以下新闻：..."
}
```

#### 7.2.4 响应阶段

**Sandbox → Cloud Function**:
```json
{
  "success": true,
  "answer": "您支持的公司（Apple 和 Tesla）最近有以下新闻：...",
  "metadata": {
    "queries_executed": 2,
    "collections_accessed": ["users", "company_news_by_ticker"],
    "execution_time": 5.2
  }
}
```

**Cloud Function → Frontend**:
```json
{
  "success": true,
  "answer": "您支持的公司...",
  "metadata": {
    "session_id": "sandbox_abc123",
    "execution_time": 5.2,
    "cost": {"total": 0.00614}
  },
  "data_sources": [
    {"type": "firestore", "collection": "users", "count": 1},
    {"type": "firestore", "collection": "company_news_by_ticker", "count": 15}
  ]
}
```

---

## 8. 安全和隔离机制

### 8.1 多层安全防护

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: E2B Sandbox 隔离                                │
│ - Firecracker microVM                                   │
│ - 完全隔离的文件系统、进程、网络                          │
│ - 每个任务一个 VM                                        │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────┐
│ Layer 2: Collection 级别访问控制                         │
│ - Public collections: 所有人可读                         │
│ - User-private collections: 强制 userId 过滤             │
│ - Restricted collections: 完全禁止                       │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────┐
│ Layer 3: Query 级别验证                                  │
│ - 检查过滤条件                                           │
│ - 限制查询大小（最多 500 条）                            │
│ - 超时保护（60 秒）                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────┐
│ Layer 4: Field 级别过滤                                  │
│ - 移除敏感字段（password, apiKey, paymentToken）         │
│ - 移除 PII（可选）                                       │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────┐
│ Layer 5: 结果验证（Review Agent）                        │
│ - 检测数据泄露                                           │
│ - 验证访问合规性                                         │
│ - 审计日志                                               │
└─────────────────────────────────────────────────────────┘
```

### 8.2 用户数据隔离

#### 8.2.1 强制 userId 过滤

```python
def enforce_user_isolation(collection: str, filters: List, user_id: str):
    """强制用户数据隔离"""

    if collection in USER_PRIVATE_COLLECTIONS:
        # 检查是否已有 userId 过滤
        has_user_filter = any(f[0] == "userId" for f in filters)

        if not has_user_filter:
            # 自动添加
            filters.append(("userId", "==", user_id))
        else:
            # 验证 userId 是否匹配
            for field, op, value in filters:
                if field == "userId" and value != user_id:
                    raise PermissionError("Cannot access other users' data")

    return filters
```

#### 8.2.2 Collection 访问矩阵

| Collection | Type | Access Rule | User Isolation |
|------------|------|-------------|----------------|
| `users` | user_private | 强制 userId 过滤 | ✅ 是 |
| `news` | public | 无限制 | ❌ 否 |
| `news_prism_lens` | user_private | 强制 userId 过滤 | ✅ 是 |
| `company_rankings` | public | 无限制 | ❌ 否 |
| `payment_methods` | restricted | 完全禁止 | N/A |

### 8.3 网络隔离

#### 8.3.1 域名白名单

```python
ALLOWED_DOMAINS = [
    "stanse.ai",
    "news.google.com",
    "wikipedia.org",
    "www.reuters.com",
    "www.bloomberg.com"
]

def validate_url(url: str):
    """验证 URL 是否在白名单中"""
    from urllib.parse import urlparse

    domain = urlparse(url).netloc

    if not any(allowed in domain for allowed in ALLOWED_DOMAINS):
        raise PermissionError(f"Domain not allowed: {domain}")
```

#### 8.3.2 请求限制

```python
class WebRequestLimiter:
    """网页请求限制器"""

    def __init__(self, max_requests: int = 5):
        self.max_requests = max_requests
        self.request_count = 0

    def check_limit(self):
        if self.request_count >= self.max_requests:
            raise Exception("Web request limit exceeded")

        self.request_count += 1
```

### 8.4 资源限制

#### 8.4.1 Per-Sandbox 限制

```python
SANDBOX_LIMITS = {
    "max_execution_time": 60,      # 秒
    "max_firestore_queries": 20,   # 次
    "max_web_requests": 5,         # 次
    "max_memory_mb": 512,          # MB
    "max_cpu_cores": 1             # 核心
}
```

#### 8.4.2 Per-User 配额

```python
USER_QUOTAS = {
    "max_sessions_per_hour": 30,
    "max_concurrent_sessions": 3,
    "max_daily_queries": 500,
    "max_daily_cost": 5.0  # 美元
}
```

---

## 9. 资源管理和成本优化

### 9.1 Sandbox 池管理

#### 9.1.1 池架构

```python
class SandboxPool:
    """Sandbox 池管理器"""

    def __init__(self, max_pool_size: int = 10):
        self.pool = []
        self.active_sandboxes = {}  # {user_id: [sandbox, ...]}
        self.max_pool_size = max_pool_size

    async def get_or_create(self, user_id: str) -> Sandbox:
        """获取或创建 Sandbox"""

        # 1. 检查用户并发限制
        user_sandboxes = self.active_sandboxes.get(user_id, [])
        if len(user_sandboxes) >= 3:
            raise Exception("Max concurrent sandboxes reached")

        # 2. 尝试从池中获取
        if self.pool:
            sandbox = self.pool.pop()
        else:
            # 3. 创建新的
            sandbox = await Sandbox.create()

        # 4. 记录
        if user_id not in self.active_sandboxes:
            self.active_sandboxes[user_id] = []
        self.active_sandboxes[user_id].append(sandbox)

        return sandbox

    async def release(self, user_id: str, sandbox: Sandbox):
        """释放 Sandbox 回池"""

        # 1. 清理状态
        await self._cleanup_sandbox(sandbox)

        # 2. 从活跃列表移除
        if user_id in self.active_sandboxes:
            self.active_sandboxes[user_id].remove(sandbox)

        # 3. 放回池中（如果池未满）
        if len(self.pool) < self.max_pool_size:
            self.pool.append(sandbox)
        else:
            # 4. 否则销毁
            await sandbox.close()

    async def _cleanup_sandbox(self, sandbox: Sandbox):
        """清理 Sandbox 状态"""

        # 删除临时文件
        await sandbox.commands.run("rm -rf /tmp/*")

        # 清空环境变量
        # （E2B 在 close 时会自动清理）
```

### 9.2 成本优化策略

#### 9.2.1 查询缓存

```python
class QueryCache:
    """查询结果缓存"""

    def __init__(self, db):
        self.db = db
        self.cache_collection = "intelligence_agent_cache"

    def generate_cache_key(self, query: str, user_id: str) -> str:
        """生成缓存键"""
        import hashlib

        content = f"{query}:{user_id}"
        return hashlib.md5(content.encode()).hexdigest()

    async def get(self, cache_key: str) -> Optional[dict]:
        """获取缓存"""

        doc_ref = self.db.collection(self.cache_collection).document(cache_key)
        doc = doc_ref.get()

        if doc.exists:
            data = doc.to_dict()

            # 检查是否过期（1小时）
            created_at = data.get("created_at")
            if (datetime.now() - created_at).seconds < 3600:
                return data.get("result")

        return None

    async def set(self, cache_key: str, result: dict):
        """设置缓存"""

        doc_ref = self.db.collection(self.cache_collection).document(cache_key)
        doc_ref.set({
            "result": result,
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(hours=1)
        })
```

#### 9.2.2 智能路由

```python
class IntelligentRouter:
    """智能路由 - 根据查询复杂度选择执行方式"""

    async def route(self, query: str, intent: Intent):
        """路由决策"""

        # 简单查询：直接在 Cloud Function 中执行
        if intent.complexity == "simple" and not intent.needs_web_search:
            return await self._execute_in_cloud_function(query, intent)

        # 复杂查询：使用 E2B Sandbox
        else:
            return await self._execute_in_sandbox(query, intent)

    async def _execute_in_cloud_function(self, query, intent):
        """在 Cloud Function 中直接执行（省去 Sandbox 成本）"""

        # 使用 Firebase Admin SDK 直接查询
        # 适合单个 collection 的简单查询
        pass

    async def _execute_in_sandbox(self, query, intent):
        """在 E2B Sandbox 中执行"""

        # 完整的 Multi-Agent 流程
        pass
```

#### 9.2.3 预热常见查询

```python
class QueryWarmer:
    """预热常见查询"""

    COMMON_QUERIES = [
        "我支持的公司有什么新闻？",
        "我最近的政治立场变化",
        "我反对的公司有哪些"
    ]

    async def warm_up(self):
        """预热常见查询"""

        for query in self.COMMON_QUERIES:
            # 预先执行并缓存
            # 在低峰时段运行
            pass
```

### 9.3 成本监控

#### 9.3.1 成本追踪

```python
class CostTracker:
    """成本追踪器"""

    def __init__(self, db):
        self.db = db

    async def record_usage(
        self,
        user_id: str,
        session_id: str,
        cost_breakdown: dict
    ):
        """记录使用情况"""

        doc_ref = self.db.collection("intelligence_agent_usage").document()
        doc_ref.set({
            "user_id": user_id,
            "session_id": session_id,
            "cost_breakdown": cost_breakdown,
            "timestamp": datetime.now()
        })

    async def get_user_daily_cost(self, user_id: str) -> float:
        """获取用户今日成本"""

        today = datetime.now().date()

        docs = self.db.collection("intelligence_agent_usage") \
            .where("user_id", "==", user_id) \
            .where("timestamp", ">=", today) \
            .stream()

        total = sum(
            doc.to_dict()["cost_breakdown"]["total"]
            for doc in docs
        )

        return total
```

---

## 10. 错误处理和恢复

### 10.1 错误分类

| 错误类型 | 示例 | 恢复策略 |
|---------|------|---------|
| **Sandbox 创建失败** | E2B API 超时 | 重试 3 次 |
| **查询超时** | Firestore 查询 >10s | 降级查询 |
| **权限错误** | 访问受限 collection | 拒绝请求 |
| **数据泄露** | Review Agent 检测到 | 拒绝返回 |
| **Ember API 失败** | 503 错误 | 重试或降级 |
| **网页请求失败** | 404/超时 | 跳过该步骤 |

### 10.2 错误处理机制

```python
class ErrorHandler:
    """错误处理器"""

    async def handle_error(
        self,
        error: Exception,
        context: dict
    ) -> dict:
        """统一错误处理"""

        if isinstance(error, SandboxCreationError):
            return await self._handle_sandbox_error(error, context)

        elif isinstance(error, QueryTimeoutError):
            return await self._handle_timeout_error(error, context)

        elif isinstance(error, PermissionError):
            return await self._handle_permission_error(error, context)

        elif isinstance(error, DataLeakageError):
            return await self._handle_data_leakage(error, context)

        else:
            return self._handle_unknown_error(error, context)

    async def _handle_sandbox_error(self, error, context):
        """处理 Sandbox 创建失败"""

        # 重试策略
        max_retries = 3
        for i in range(max_retries):
            try:
                sandbox = await Sandbox.create()
                return {"success": True, "sandbox": sandbox}
            except Exception as e:
                if i == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** i)  # 指数退避

    async def _handle_timeout_error(self, error, context):
        """处理查询超时"""

        # 降级策略：减少查询范围
        original_limit = context.get("limit", 100)
        degraded_limit = original_limit // 2

        return {
            "success": False,
            "error": "Query timeout",
            "suggestion": f"Try reducing limit from {original_limit} to {degraded_limit}"
        }

    async def _handle_permission_error(self, error, context):
        """处理权限错误"""

        return {
            "success": False,
            "error": "Permission denied",
            "message": str(error),
            "user_message": "您没有权限访问该数据"
        }

    async def _handle_data_leakage(self, error, context):
        """处理数据泄露"""

        # 记录安全事件
        await self._log_security_event(error, context)

        return {
            "success": False,
            "error": "Data leakage detected",
            "message": "Security check failed"
        }
```

### 10.3 自动重试

```python
def retry_with_backoff(max_retries=3, backoff_factor=2):
    """重试装饰器"""

    def decorator(func):
        async def wrapper(*args, **kwargs):
            for i in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    if i == max_retries - 1:
                        raise

                    wait_time = backoff_factor ** i
                    print(f"Retry {i+1}/{max_retries} after {wait_time}s")
                    await asyncio.sleep(wait_time)

        return wrapper
    return decorator

# 使用
@retry_with_backoff(max_retries=3)
async def create_sandbox():
    return await Sandbox.create()
```

---

## 11. 监控和审计

### 11.1 监控指标

#### 11.1.1 性能指标

```python
MONITORING_METRICS = {
    "sandbox_creation_time": "E2B Sandbox 创建耗时",
    "agent_execution_time": "Agent 执行总时间",
    "firestore_query_time": "Firestore 查询耗时",
    "ember_api_latency": "Ember API 延迟",
    "total_request_time": "端到端请求时间"
}
```

#### 11.1.2 业务指标

```python
BUSINESS_METRICS = {
    "queries_per_hour": "每小时查询数",
    "success_rate": "成功率",
    "average_cost_per_query": "平均查询成本",
    "cache_hit_rate": "缓存命中率",
    "active_users": "活跃用户数"
}
```

### 11.2 审计日志

#### 11.2.1 日志结构

```python
@dataclass
class AuditLog:
    timestamp: str
    user_id: str
    session_id: str
    action_type: str  # "query", "web_request", "error"
    details: dict
    result: str  # "success", "failure"
    cost: float
```

#### 11.2.2 日志记录

```python
class AuditLogger:
    """审计日志记录器"""

    def __init__(self, db):
        self.db = db

    async def log(self, audit_log: AuditLog):
        """记录审计日志"""

        doc_ref = self.db.collection("intelligence_agent_audit").document()
        doc_ref.set(asdict(audit_log))

    async def query_logs(
        self,
        user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[AuditLog]:
        """查询审计日志"""

        query = self.db.collection("intelligence_agent_audit")

        if user_id:
            query = query.where("user_id", "==", user_id)

        if start_date:
            query = query.where("timestamp", ">=", start_date)

        if end_date:
            query = query.where("timestamp", "<=", end_date)

        docs = query.stream()
        return [AuditLog(**doc.to_dict()) for doc in docs]
```

---

## 12. API 设计

### 12.1 REST API Endpoint

**Endpoint**: `POST /chat`

**Request**:
```json
{
  "message": "我支持的公司最近有什么新闻？",
  "mode": "intelligence_agent",
  "user_id": "user123",
  "language": "ZH",
  "options": {
    "enable_web_search": false,
    "max_queries": 20,
    "timeout": 60
  }
}
```

**Response (Success)**:
```json
{
  "success": true,
  "answer": "您支持的公司（Apple 和 Tesla）最近有以下新闻：...",
  "metadata": {
    "session_id": "sandbox_abc123",
    "execution_time": 5.2,
    "queries_executed": 2,
    "collections_accessed": ["users", "company_news_by_ticker"],
    "web_pages_visited": [],
    "cost": {
      "compute": 0.00014,
      "llm": 0.006,
      "total": 0.00614
    }
  },
  "data_sources": [
    {
      "type": "firestore",
      "source": "users",
      "count": 1
    },
    {
      "type": "firestore",
      "source": "company_news_by_ticker",
      "count": 15
    }
  ]
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "Permission denied: Cannot access payment_methods collection",
  "error_code": "PERMISSION_DENIED",
  "metadata": {
    "session_id": "sandbox_abc123",
    "execution_time": 1.2
  }
}
```

### 12.2 WebSocket API（可选，用于实时进度）

```typescript
// 连接
const ws = new WebSocket("wss://ember-api.../intelligence-stream");

// 发送请求
ws.send(JSON.stringify({
  type: "intelligence_query",
  message: "我支持的公司有什么新闻？",
  user_id: "user123"
}));

// 接收进度更新
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "progress") {
    console.log(data.message);
    // "创建 Sandbox..."
    // "Schema Agent 分析中..."
    // "执行查询 1/2..."
  }

  if (data.type === "result") {
    console.log(data.answer);
  }
};
```

---

## 13. 部署架构

### 13.1 基础设施

```
┌─────────────────────────────────────────────────────────┐
│ Google Cloud Platform                                   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Cloud Function Gen2                               │ │
│  │ - ember_api                                       │ │
│  │ - Region: us-central1                             │ │
│  │ - Memory: 2GB                                     │ │
│  │ - Timeout: 300s                                   │ │
│  │ - Min instances: 0                                │ │
│  │ - Max instances: 10                               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Secret Manager                                    │ │
│  │ - e2b-api-key                                     │ │
│  │ - firebase-service-account                        │ │
│  │ - ember-openai-api-key                            │ │
│  │ - ember-google-api-key                            │ │
│  │ - ember-anthropic-api-key                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Firestore                                         │ │
│  │ - Project: stanseproject                          │ │
│  │ - Collections: 40+                                │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ E2B Platform                                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Sandbox Pool                                      │ │
│  │ - Firecracker microVMs                            │ │
│  │ - Auto-scaling                                    │ │
│  │ - 200ms startup                                   │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 13.2 部署流程

```bash
# 1. 安装 E2B SDK
cd functions/ember-api
pip install e2b-code-interpreter

# 2. 添加 E2B API Key 到 Secret Manager
echo -n "YOUR_E2B_API_KEY" | gcloud secrets create e2b-api-key \
    --data-file=- \
    --project=gen-lang-client-0960644135

# 3. 部署 Cloud Function
gcloud functions deploy ember_api \
    --gen2 \
    --runtime python312 \
    --region us-central1 \
    --entry-point ember_api \
    --trigger-http \
    --allow-unauthenticated \
    --memory 2GiB \
    --timeout 300s \
    --max-instances 10 \
    --project gen-lang-client-0960644135

# 4. 部署前端
cd /Users/xuling/code/Stanse
gcloud builds submit --config=cloudbuild.yaml
```

---

## 14. 性能优化

### 14.1 优化目标

| 指标 | 当前 | 目标 | 优化方案 |
|------|------|------|---------|
| **Sandbox 创建** | 3s | 200ms | 使用预装模板 |
| **首次查询** | 5-10s | 3-5s | 缓存 + 预热 |
| **缓存命中** | 0% | 30% | 实现查询缓存 |
| **成本/查询** | $0.006 | $0.004 | 智能路由 |

### 14.2 具体优化

#### 14.2.1 Sandbox 模板化

```python
# 创建预装模板（一次性操作）
async def create_sandbox_template():
    sandbox = await Sandbox.create()

    # 安装所有依赖
    await sandbox.commands.run("""
        pip install firebase-admin google-cloud-firestore requests beautifulsoup4
    """)

    # 保存为模板
    template_id = await sandbox.save_as_template(
        name="stanse-intelligence-agent-v1"
    )

    return template_id

# 使用模板（每次查询）
async def create_fast_sandbox():
    sandbox = await Sandbox.create(
        template="stanse-intelligence-agent-v1"
    )
    # 启动时间: 200ms
    return sandbox
```

#### 14.2.2 并行化

```python
# 并行执行独立查询
async def execute_parallel_queries(steps: List[QueryStep]):
    independent_steps = [s for s in steps if not s.depends_on]

    tasks = [execute_query(step) for step in independent_steps]
    results = await asyncio.gather(*tasks)

    return results
```

#### 14.2.3 结果流式返回

```python
# 不等待全部完成，边执行边返回
async def stream_results(query: str):
    async for progress in execute_with_streaming():
        yield {
            "type": "progress",
            "message": progress.message
        }

    yield {
        "type": "result",
        "answer": final_answer
    }
```

---

## 15. 未来扩展

### 15.1 Phase 2: 高级功能

- **多轮对话**: 保持 Sandbox 存活，支持上下文对话
- **自定义查询**: 用户可以教 Agent 新的查询模式
- **数据可视化**: 自动生成图表
- **定时报告**: 定期生成数据洞察报告

### 15.2 Phase 3: 企业功能

- **Team Workspace**: 团队共享 Agent
- **自定义 Agent**: 用户可以创建自己的 Agent
- **API 访问**: 提供 REST API 供第三方调用
- **On-premise 部署**: 支持私有化部署

---

## 附录 A: Collection Schemas

完整的 Firestore Collection 列表和 Schema 定义（见 `64_ember_firestore_data_structure_2026_01_25.md`）

---

## 附录 B: 成本计算

### 详细成本分解

```
单次查询成本：

1. E2B Sandbox（1 vCPU, 10秒）
   $0.000014/秒 × 10秒 = $0.00014

2. Firestore 读取（假设 50 条）
   $0.06/100K reads × 50 = $0.00003

3. Ember API 调用（default 模式）
   $0.006

4. Cloud Function 执行（2GB, 10秒）
   $0.0000025/GB-秒 × 2GB × 10秒 = $0.00005

总计：$0.00622/查询

月成本估算（1000 个用户，平均每天 3 次查询）：
1000 × 3 × 30 × $0.00622 = $560/月
```

---

## 附录 C: 开发检查清单

### Phase 1: 基础框架（2周）
- [ ] E2B SDK 集成
- [ ] Sandbox 创建和清理
- [ ] 基础 Agent 系统（5个 Agents）
- [ ] Firestore 查询执行
- [ ] 安全验证

### Phase 2: 功能完善（2周）
- [ ] 网页浏览功能
- [ ] 错误处理和重试
- [ ] 查询缓存
- [ ] 成本追踪
- [ ] 审计日志

### Phase 3: 优化和测试（1周）
- [ ] 性能优化
- [ ] Sandbox 模板化
- [ ] 单元测试
- [ ] 集成测试
- [ ] 负载测试

### Phase 4: 部署和监控（1周）
- [ ] 生产部署
- [ ] 监控仪表板
- [ ] 告警配置
- [ ] 文档完善
- [ ] 用户培训

---

**总结**：本文档提供了基于 E2B Sandboxes 的 Intelligence Agent 系统的完整设计。核心优势是利用 Firecracker microVM 提供真正的隔离，同时保持低延迟和合理的成本。通过 Multi-Agent 架构，系统具有良好的可扩展性和可维护性。

**字数统计**: 约 12,000 字

**下一步**: 根据本设计文档，逐步实现各个模块，从 E2B 集成开始，到 Multi-Agent 系统，最后完成前端集成。
