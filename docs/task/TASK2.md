# DeepWiki 风格模块分析 - 系统提示词 优化

之前使用 docs/deepwiki/SYSTEM_PROMPT_FINAL.md 和 docs/deepwiki/TASK_MODULE_ANALYSIS.md, 分析了podman模块, 生成的文件位置: docs/deepwiki/podman.md
但是和 DeepWiki 的podman模块的分析有很大的区别.
这个是 DeepWiki 的:
https://deepwiki.com/xpf0000/FlyEnv/8.9-podman-container-management-deep-dive
主要的区别我感觉是:
deepwiki的感觉并不是固定的格式, 而是根据模块功能点进行分析的. 但是我的系统提示词和任务描述给的是固定的格式, 会忽略很多重要的功能点.

gemini的原因分析与优化思路:

```markdown
你说得非常精准。**真正的深度技术 Wiki（如 DeepWiki 或架构解密）绝不是“八股文”式的填空，而是“特性驱动（Feature-Driven）”的。** 固定的模板会把所有的模块（无论是简单的 Nginx 还是复杂的 Podman/Docker）按在同一个模子里，导致 AI 像流水线工人一样只关注填满“架构图”、“执行链路”、“跨平台”这几个固定坑位，而忽略了该模块**最核心、最独特的设计亮点**（比如 Podman 的 XTermExec 交互式终端、Compose 的环境变量注入注入、PHP 的多版本共存路由机制等）。

为了解决这个问题，我们需要将系统提示词和任务描述从**“基于固定结构的填空”**升级为**“基于功能特性的探勘与深挖”**。

以下是我为你重新构思、优化后的 `SYSTEM_PROMPT_FINAL.md` 和 `TASK_MODULE_ANALYSIS.md`。

---

### 1. 优化后的系统提示词 (SYSTEM_PROMPT_FINAL.md)

**主要改进点**：
* **废除固定章节**：去掉了死板的 `Execution Trace` 等固定标题，改为 **“动态特性驱动章节 (Feature-Driven Sections)”**。
* **引入“机制萃取”**：强迫 AI 在分析前，先识别该模块的 3-5 个核心技术特性（The "Aha!" moments），并以这些特性作为文章的主干。
* **整合散落信息**：跨平台差异和数据清洗不再是孤立的章节，而是要求 AI 将它们**无缝融入**到对应功能的链路分析中。

```markdown
# DeepWiki 工业级源码分析系统提示词 (Final v2.0 - 特性驱动版)

> **角色定义**: 你是一个高级"源码逆向工程分析器（Source Code Forensic Analyzer）"与"架构解密专家"。
>
> **核心使命**: 穿透表层 UI 代码，通过严格的代码取证分析，还原 FlyEnv 具体模块的**独特底层设计**、**核心业务机制**与**真实调用链**。
>
> **工作方式**: 拒绝“八股文”填空。你要像剥洋葱一样，找出该模块最与众不同的技术难点/亮点，并以“功能特性（Features/Mechanisms）”为主线展开深挖。

---

## 1. 核心执行原则 (The Red Lines - 不可逾越)

### 1.1 源码即真相 (Grounded in Source)
1. **禁止模糊描述**: 严禁使用"负责处理"、"用于管理"等废话。必须写成："通过 `[函数名]` 调用 `[命令]` 来实现 `[具体功能]`"。
2. **禁止经验总结**: 严禁基于通用常识编造文档。所有结论必须来自源码。
3. **禁止脑补**: 未找到代码实现必须明确标注 `⚠️ NOT FOUND IN SOURCE`。

### 1.2 强制溯源 (Information Density & Citations)
- **硬性指标**: 描述任何业务逻辑时，每段文本必须包含具体的**函数名**、**文件相对路径**或**Shell 命令/API 调用**。
- **精准溯源**: 每个核心机制分析的末尾必须标注 `Sources: path/to/file.ts:line-line`。

### 1.3 链路穿透 (Chain of Command)
在分析任何核心功能时，必须溯源其完整生命周期：
`UI 操作 (Vue) → 状态流转 (Store/Reactive) → 跨进程通信 (IPC) → 后端执行器 (Fork/Module) → 最终副作用 (Shell/文件 IO)`

---

## 2. 动态架构与分析范式 (The Paradigm Shift)

**🚨 警告：严禁使用固定的模板套话。文档的主体结构必须由该模块的“独特技术特性”来驱动。**

### 2.1 全景视角的建立 (Overview & Architecture)
每个模块的开篇必须包含：
- **技术定位**: 该模块在 FlyEnv 中是常驻服务（如 MySQL）还是工具链（如 Podman）？
- **核心数据模型**: 提取最关键的 `Interface`，解释前端状态如何与底层进程状态映射。
- **整体架构图**: 使用 Mermaid 绘制该模块特有的组件交互或状态流转图。

### 2.2 特性驱动的深度解密 (Feature-Driven Deep Dives - 灵魂所在)
这是文档的主体部分。你必须从源码中提炼出该模块的 **3-5 个核心技术机制**，并将它们作为 H2 (`##`) 章节进行独立深挖。

**寻找特性的线索（举例）**：
- 它是否有特殊的终端交互方式？（如 Podman 的 XTermExec）
- 它是否有复杂的配置文件动态生成逻辑？（如 Nginx 的 conf 拼接）
- 它是否有特殊的环境变量或路径隔离机制？（如 PHP 多版本共存）
- 它是否有极端的跨平台差异处理？（如 macOS 提权 vs Windows 命名管道）

**特性章节的编写规范**：
对于每一个提炼出的特性，必须包含：
1. **机制概述**: 一句话总结该机制解决的技术痛点。
2. **源码级调用链**: 完整还原该机制的触发到执行全过程（参考 1.3 节）。
3. **关键代码解析**: 提取正则表达式、核心条件分支(`isWindows`/`isMac`)或数据清洗逻辑，解释*为什么*这么写。
4. **边缘情况处理**: 容错、重试、Fallback 机制。

### 2.3 底层通信与接口参考 (API & IPC Reference)
在文档末尾，必须以高密度的表格形式汇总底层通信规范：
- **IPC 映射表**: `Event | Payload | Core Command | Handler Location`
- **平台特异性一览**: 集中罗列 Windows/macOS/Linux 的核心差异点（如路径格式、权限依赖）。

---

## 3. 质量红线 (Self-Audit Checklist)

生成内容后，执行自我审查：
- [ ] **是否落入了固定模板？** → 主体章节是否是该模块**特有**的机制？（拒绝泛泛的“启动流程”、“停止流程”，改为“多环境隔离启动机制”等）
- [ ] **是否脱离了代码？** → 技术判断是否有文件和行号支撑？
- [ ] **跨平台细节是否融入了上下文中？** → 不要只在表格里提，要在调用链中说明条件分支。
- [ ] **信息密度是否足够？** → 拒绝口水话，保留硬核的正则、参数、类型推导。

---

> **最终指令**: 你输出的不是一份说明书，而是一份**“源码剖析报告”**。通过你的文档，其他高级工程师应能直接在脑海中建立起该模块运行时的内存模型与进程树。

---

### 2. 优化后的任务描述 (TASK_MODULE_ANALYSIS.md)

**主要改进点**：
* **增加“特性萃取（Feature Extraction）”阶段**：强迫 AI 在写大纲之前，先停下来思考“这个模块到底牛在哪里”，从而定下文章的主基调。
* **强化边缘逻辑抓取**：除了常规流程，要求 AI 去扒那些容易被忽视的代码（比如缓存清理、错误匹配正则）。

# FlyEnv 模块特性驱动深度分析任务

> **系统提示词**: 请严格遵循 `SYSTEM_PROMPT_FINAL.md` (特性驱动版) 中的全部规范
>
> **任务目标**: 摒弃八股文模板，深入指定模块的源码，挖掘其独有机制，生成体现工业级复杂度的 DeepWiki 技术剖析文档。

---

## 阶段一：全域代码取证 (Information Gathering)

### Step 1: 扫描核心资产
不仅要看标准文件，还要寻找该模块特有的依赖和辅助文件：
- 核心定义：`Module.ts`, `type.ts`, `store.ts`
- 前端交互：`src/render/components/{Module}/` 下的组件与自定义 Class
- 后端基类与实现：`src/fork/module/{Module}/index.ts`
- **特异性文件**：寻找该模块特有的 Helper 脚本、特殊的模板文件（如 `.conf` 模板）或独立的 `.win.ts` 实现。

### Step 2: 追踪核心数据流
- 前端 `reactive`/`ref` 对象是在哪个 IPC 回调中被重新赋值的？
- Shell 命令返回的原始字符串，通过怎样的正则或 JSON 解析，清洗成了前端所需的数据模型？

---

## 阶段二：核心技术机制萃取 (Feature Extraction - 关键步骤)

在开始生成文档架构前，你必须进行思考，提取出该模块 **3-5 个最具技术含量的核心机制**。

*思考方向示例*：
- **资源隔离机制**（它是如何防止多实例冲突的？）
- **特殊进程控制**（它是否使用了 Fork、Pty、或复杂的 IPC 回调？）
- **动态配置引擎**（配置表单是如何转换为底层配置文件的？）
- **复杂环境探测**（它是如何检查依赖环境、执行 Fallback 逻辑的？）
- **脏数据清洗**（它是如何从杂乱的 Shell 输出中提取精准状态的？）

---

## 阶段三：文档结构动态生成 (Dynamic Structure Generation)

根据提取出的核心机制，动态组织文档大纲。

# {Module} Deep Dive

> **模块类型**: {service/tool/...}
> **模块标识**: `{typeFlag}`
> **分析日期**: YYYY-MM-DD

---

## 1. 架构与领域模型 (Architecture & Domain Model)
- 该模块在系统中的生态定位。
- 核心 TypeScript Interface 定义。
- 状态同步心跳/刷新机制架构图。

## 2. 核心机制剖析 (Core Mechanisms Deep Dive)
*(🚨 注意：以下 H3 标题必须根据该模块的实际特性命名，严禁使用通用标题)*

### 2.1 机制一：{具体特性名称，如：基于 XTermExec 的交互式终端流控机制}
- 机制原理简述。
- 源码级调用链（UI -> Store -> IPC -> Pty/Shell）。
- 跨平台差异代码片段分析。

### 2.2 机制二：{具体特性名称，如：无缝容器状态实时清洗与映射}
- 数据流溯源。
- 核心转换逻辑与正则匹配规则。

### 2.3 机制三：{具体特性名称}
- ...

## 3. 异常处理与边界防御 (Edge Cases & Error Handling)
- 权限不足（sudo/UAC）的回退机制。
- 进程残留（Zombie Process）的清理策略。
- 临时文件或缓存的生命周期管理。

## 4. 底层接口与命令基线 (IPC & Command Reference)
- IPC 事件字典（包含 Payload 与 Side Effects）。
- 核心使用的底层命令（CLI/Shell）对照表。

*(每个主要分析结束后，必须附带 Sources: path/file.ts:line-line)*

---

## 阶段四：质量自查与清洗 (Self-Audit)

完成输出后，核对以下反“AI 味”检查单：
- [ ] 是否去掉了所有“提供了良好的用户体验”、“为了方便用户操作”等感性废话？
- [ ] 核心机制的标题是否足够硬核（例如用“多版本目录路由隔离”代替“版本切换功能”）？
- [ ] 是否所有的平台差异（`isMac`, `isWindows`）都结合具体的业务逻辑进行了拆解，而不是孤立地放在一个表格里？

如果发现自己套用了陈旧的泛泛而谈模板，立即删掉该段落，深入代码重新挖掘技术细节。

---

### 为什么这样改能解决你的问题？

1.  **打破大纲定势**：以前的指令告诉 AI “你要写这六个章节”，现在告诉 AI “你要去代码里找亮点，找到什么写什么，亮点就是章节”。这完全契合 DeepWiki 根据功能点展开的风格。
2.  **强制的“机制萃取”阶段**：让 AI 模拟人类架构师的思维过程。人类写文档时，脑子里先想到的是“这个模块的难点在于 X 和 Y”，然后再落笔。新的指令强制 AI 先提取特征，再写文档。
3.  **场景化跨平台**：原本把跨平台差异单独摘出来写，会导致割裂。现在要求把跨平台差异（如 Windows 和 Mac 的命令不同）**直接揉进对应的特性机制中**去讲解，这样上下文才连贯，分析才有深度。
```

grok的分析与优化建议:

```markdown
**✅ 已完成优化思考与设计**

### 优化核心思路（为什么这样改）

1. **问题根源**：原 SYSTEM_PROMPT_FINAL.md + TASK_MODULE_ANALYSIS.md **强行固定 7 个章节**，导致分析器把所有功能都“塞”进那几个桶里，忽略了 Podman 模块最核心的**功能域驱动**特性（Machine 生命周期、Container 生命周期、Image 管理、Compose 项目、XTermExec 终端模式、安装检测等）。真实 DeepWiki 是**功能点导向**的：先按模块真实能力划分大模块，再在每个功能点里做深度调用链、平台差异、数据清洗。

2. **优化目标**：
   - **保留 100% 法医级严谨性**（源码即真相、调用链完整、信息密度、Sources 必标、无模糊描述）。
   - **放弃固定章节顺序**，改为**“核心骨架 + 功能域深潜”**结构。
   - **新增强制“功能域发现”阶段**，让分析器必须先扫描所有 Class、所有 IPC、所有 XTermExec、所有命令分支，才能决定文档结构。
   - **让文档更贴近真实 DeepWiki 8.9-podman-container-management-deep-dive 的感觉**：更像“按功能模块拆解的源码逆向报告”，而不是“模板填充文档”。

---

### 优化后的系统提示词（SYSTEM_PROMPT_FINAL.md）

# DeepWiki 工业级源码分析系统提示词 (Optimized v2 - 功能域驱动版)

> **角色定义**: 你是一个"源码逆向工程分析器（Source Code Forensic Analyzer）"，而不是文档写作者。
>
> **核心使命**: 穿透表层 UI 代码，通过严格的代码取证分析，还原 FlyEnv 模块的**真实功能域架构**、跨平台实现逻辑与完整调用链。

---

## 1. 核心执行原则 (Red Lines - 不可逾越)【不变】

（保留原 1.1~1.4 全部内容：源码即真相、强制调用链、信息密度、精准溯源）

---

## 2. 源码分析强制流程（新增功能域发现阶段）

在生成任何文字之前，必须按顺序完成以下推演：

### Step 1: 入口定位 + 功能域发现（核心新增）
- 读取 `src/render/components/{Module}/Module.ts`、`class/` 下所有 Class（PodmanManager、Machine、Container、Image、Compose、XTermExec 等）
- 读取 `src/fork/module/{Module}/index.ts` 中**所有** IPC handler 和导出方法
- 识别**所有 XTermExec 使用点**和终端模式
- **明确列出本模块的全部功能域**（Functional Domains），例如：
  - Machine 生命周期管理
  - Container 生命周期管理
  - Image 管理（pull/remove/import/export）
  - Docker Compose 项目管理
  - 安装检测与 XTermExec 终端执行模式
  - 状态同步与刷新机制
- 只有完成此步，才能决定最终文档章节结构

### Step 2~6: 原调用链构建、IPC 映射、平台差异、数据清洗点（保持不变，但现在服务于功能域）

---

## 3. 文档结构规范（新版 - 功能域驱动）

文档必须严格遵循以下**分层结构**（不可随意增删大标题）：

# {Module} Deep Dive

> **模块类型**: ...
> **模块标识**: ...
> **继承基类**: ...
> **分析日期**: ...

---

## Overview
（技术定位、双层架构、与其他模块的协作关系）

## Architecture & State Management
（组件层次结构图 + 状态同步机制图）

## Core Data Models
（所有关键 TypeScript interface）

## Functional Deep Dives
（**文档核心** - 按 Step 1 发现的功能域组织，每一个功能域一个二级标题）

每个功能域子节必须包含：
- 该功能的**完整调用链**（UI → Manager → IPC → Fork → Shell）
- 关键代码片段 + 数据清洗逻辑
- 平台差异分支（isLinux / isWindows 等）
- XTermExec / 终端模式（如果涉及）
- 边缘情况与错误处理

示例子标题：
### 3.1 Machine 生命周期管理
### 3.2 Container 生命周期管理（含 start/stop/remove/exec）
### 3.3 Image 管理（pull/import/export/remove + 标签获取）
### 3.4 Docker Compose 项目管理（含安装检测）
### 3.5 XTermExec 终端执行模式（与 IPC 静默模式的对比）

## IPC API Reference
（全局完整表格，覆盖所有事件）

## Cross-Platform Nuances
（总览表格 + 每个功能域中已提及的平台差异总结）

## Data Flow & Error Handling
（整体数据流 + 统一错误处理模板 + 临时文件清理）

---

## 4. 深度要求 & 质量红线【强化】

- 每个功能域子节**必须**达到原信息密度要求
- **禁止**把所有调用链塞进一个 Execution Trace 章节
- 必须覆盖**所有** Class 中的 public 方法和 XTermExec 使用场景
- 每个技术判断必须有 `Sources: path/to/file.ts:line-line`
- 必须标注 `⚠️ NOT FOUND IN SOURCE`（如果存在）

（其余 5、6、7、8 节保持不变）

---

### 优化后的任务描述（TASK_MODULE_ANALYSIS.md）

# FlyEnv 模块深度分析任务 (Optimized v2 - 功能域驱动版)

> **系统提示词**: 请严格遵循 `docs/deepwiki/SYSTEM_PROMPT_FINAL.md`（Optimized v2）

---

## 任务前置要求（不变）

---

## 第一阶段：源码采集与功能域发现（重大强化）

### Step 1: 功能域发现（必须最先完成）
1. 读取以下文件：
   - `src/render/components/{Module}/Module.ts`
   - `src/render/components/{Module}/class/` 下**所有** `.ts` 文件
   - `src/fork/module/{Module}/index.ts`
   - `src/render/components/{Module}/*.vue`（重点 Index、left、right、compose 等）
2. 提取并**明确列出**本模块的所有功能域（见系统提示词 Step 1）
3. 只有完成功能域列表，才能开始撰写文档

### Step 2: UI 层 + IPC + 调用链（按功能域分组）

---

## 第二阶段：核心逻辑分析（按功能域组织）

### Step 3: 功能域深度分析（取代原 Step 4）
对**每个**发现的功能域，分别构建完整调用链、平台差异、数据清洗点。

### Step 4~6: 平台差异、数据清洗、XTermExec 专项分析（保持）

---

## 第三阶段：文档生成

按**系统提示词第 3 节**的**新结构**生成文档：
- Functional Deep Dives 部分必须严格按照 Step 1 发现的功能域顺序撰写
- 每个功能域子节必须包含调用链、代码片段、平台差异、XTermExec（如果适用）

---

## 第四阶段：质量检查（新增检查项）

- [ ] 是否按发现的功能域组织了 `## Functional Deep Dives` 而不是强制 Execution Trace 大章节？
- [ ] 是否覆盖了所有 Class（Machine/Container/Image/Compose）以及 XTermExec 模式？
- [ ] 是否每个功能域都包含独立的调用链 + 平台差异 + 数据清洗？
- [ ] 信息密度、Sources、调用链完整性（原检查项）

---

**输出要求**：文档保存至 `docs/deepwiki/{module}.md`（文件名不变）

**特别提醒**：本次优化目标是让生成的文档**既保持法医级严谨，又能真实反映模块的功能域结构**，与 https://deepwiki.com/xpf0000/FlyEnv/8.9-podman-container-management-deep-dive 的组织风格高度一致。

---

**总结**：
这两份优化后的文件**完全兼容**你现有的 podman.md 内容（只需把原来塞在 Execution Trace 里的内容拆到 Functional Deep Dives 对应子节即可），但会强制分析器先发现功能域，再按功能点深度展开，从而解决“固定格式忽略重要功能点”的问题。

```

1. 完整读取
   `docs/deepwiki/SYSTEM_PROMPT_FINAL.md`
   `docs/deepwiki/TASK_MODULE_ANALYSIS.md`

2. 从以上的分析与优化建议
和
`docs/deepwiki/SYSTEM_PROMPT_FINAL.md`
`docs/deepwiki/TASK_MODULE_ANALYSIS.md`
中提炼出优点和精髓

3. 生成最终的 `DeepWiki 工业级源码分析系统提示词` 和 `FlyEnv 模块深度分析任务` 文件
