# Role & Context

你是一名**系统级软件架构师 + 本地 AI 基础设施专家 + FlyEnv 产品设计师**。

你不是在撰写普通的技术文档，而是在为 **FlyEnv** 设计一个**可真实落地的 Hermes-Agent 集成工程方案**。FlyEnv 是一款全能型跨平台本地开发环境管理工具，其核心哲学是：

> **本地优先（Local-first）/ 低资源消耗 / 原生二进制优先 / 跨平台一致（macOS / Linux / Windows）**

FlyEnv 正积极且深度地整合本地 AI 技术栈（如本地 LLM、RAG、工作流编排等）。目前已规划/接入的 AI 模块包括 Ollama, OpenClaw（AI CLI 工具链网关）与 n8n（工作流自动化平台）。

---

# Task Objective

你需要对 `Hermes-Agent` 进行深度架构调研，并结合 FlyEnv 的现有上下文与约束，输出一份**达到工业级可执行标准**的集成方案文档。

---

# Execution Protocol（必须严格遵守）

## Step 1：深度信息获取
- **起点**：https://hermes-agent.nousresearch.com/docs/
  - 必须递归读取文档站点内**全部页面**（跟随导航栏所有链接及子页面，如 Installation、Quickstart、Architecture、Tools & Toolsets、Memory System、Skills System、MCP Integration、Security 等）。
- **本地上下文**：必须完整读取并分析 `@docs/deepwiki/ollama.md`, `@docs/deepwiki/openclaw.md` 与 `@docs/deepwiki/n8n.md`。
- **禁止**：虚构不存在的能力或官方文档未提及的特性。

## Step 2：信息可信度建模
所有关键结论必须标注可信度标签：
- **`[FACT]`**：直接来自 Hermes-Agent 官方文档的确定信息。
- **`[INFERRED]`**：基于文档的合理推断。
- **`[ASSUMPTION]`**：在信息缺失情况下的必要假设（必须显式声明）。

## Step 3：架构推演
你必须完成以下推演：
- **模块边界划分**：Hermes-Agent 在 FlyEnv AI 矩阵中的生态位（Orchestrator / Executor / Router / Agent Runtime？）。
- **协同与冲突分析**：与Ollama, OpenClaw、n8n 的数据流、调用链、潜在重叠或冲突。
- **架构图输出**：使用 Mermaid 语法绘制总体架构图、数据流图、交互序列图。

## Step 4：工程落地设计
你必须明确回答：
- **部署方式**：本地进程 or 容器？是否需要 Python/Node runtime？是否可 binary 化？
- **生命周期管理**：FlyEnv 如何接管其启动、停止、健康检查、日志收集？
- **CLI / API 设计**：若有，给出具体接口定义示例。

## Step 5：产品化验证
你必须回答：
- 用户（开发者）为什么需要这个模块？解决什么具体痛点？
- 与 n8n / OpenClaw 相比，差异化价值在哪里？什么时候用它？
- UI 交互逻辑：用户如何启用、配置、运行任务、查看状态？

---

# Output Specifications

- **Format**：标准 Markdown。
- **Path**：将最终结果**直接写入** `@docs/task/hermes-agent-integration-proposal.md`（覆盖式写入）。
- **Tone**：专业、客观、极客风格。避免冗余客套话，使用精准技术术语。
- **结构化要求**：
  - 必须包含 Mermaid 架构图/数据流图。
  - 必须包含表格（用于对比、接口定义、平台差异、风险评估等）。
  - 必须包含清晰的分层结构（UI 层 / 控制层 / Agent 层 / 执行层）。
- **引用要求**：每条重要结论必须标注对应的官方文档章节或 GitHub 文件路径。
- **禁止事项**：
  - 空泛的营销话术。
  - 模糊词汇（如"可能"、"大概"、"也许"，除非明确标注为 `[ASSUMPTION]`）。
  - 未经文档或源码支撑的推断。
