# FlyEnv 模块深度分析任务 (Final v3 - 功能域驱动版)

> **系统提示词**: 请严格遵循 `docs/deepwiki/SYSTEM_PROMPT_FINAL.md` (Final v3 - 功能域驱动版) 中的全部规范
>
> **任务目标**: 摒弃八股文模板，深入指定模块的源码，挖掘其独有机制，生成体现工业级复杂度的 DeepWiki 技术剖析文档

---

## 任务前置要求

在开始分析前，请确认已完整阅读并理解：
1. `docs/deepwiki/SYSTEM_PROMPT_FINAL.md` - 系统提示词（核心准则）
2. `AGENTS.md` - FlyEnv 项目架构指南

---

## 第一阶段：源码采集与功能域发现

### Step 1: 识别模块入口文件

必须读取以下文件以建立模块全景：

```markdown
1. **模块定义文件**
   - `src/render/components/{Module}/Module.ts`
   - 提取：模块标识(typeFlag)、显示名称、依赖关系

2. **类型定义文件**
   - `src/render/core/type.ts`
   - 搜索：模块相关的 Interface 定义（如 `AppModuleType`、`SoftInstalled`）

3. **Fork 核心类**
   - `src/fork/module/{Module}/index.ts`
   - `src/fork/module/{Module}.win/index.ts` Windows版后端核心逻辑,如果存在,说明Windows版有单独的逻辑
   - 提取：类定义、继承关系、核心方法重写

4. **Store 状态管理**
   - `src/render/components/{Module}/store.ts` 文件存在则读取
   - `src/render/components/{Module}/setup.ts` 文件存在则读取
   - 提取：State 定义、Actions、与 IPC 的交互
```

### Step 2: UI 层组件分析

```markdown
读取组件目录：`src/render/components/{Module}/`

必须分析的组件：
- `Index.vue` - 主入口组件
- `aside.vue` - 侧边栏（如存在）
- `right.vue` / `main.vue` - 主内容区
- `setup.vue` / `config.vue` - 配置面板
- `class/` 目录下的类定义文件

提取：
- 用户操作触发的事件处理函数
- Store Action 的调用点
- 响应式状态的使用
- **所有 XTermExec 使用点和终端交互模式**
```

### Step 3: 功能域发现（必须最先完成）

基于 Step 1 和 Step 2 的采集结果，**明确列出本模块的全部功能域**（Functional Domains）。

思考方向示例：
- **资源隔离机制**（它是如何防止多实例冲突的？）
- **特殊进程控制**（它是否使用了 Fork、Pty、或复杂的 IPC 回调？）
- **动态配置引擎**（配置表单是如何转换为底层配置文件的？）
- **复杂环境探测**（它是如何检查依赖环境、执行 Fallback 逻辑的？）
- **脏数据清洗**（它是如何从杂乱的 Shell 输出中提取精准状态的？）

输出格式：
```markdown
### 功能域列表
1. {功能域 A}
2. {功能域 B}
3. {功能域 C}
...
```

**只有完成功能域列表，才能开始撰写文档**

### Step 4: IPC 通信映射

```markdown
在 Fork 模块文件中搜索：
- `ipcMain.on('app-fork:{module}:*')` 或类似的 IPC 事件监听
- 列出所有 IPC 事件名及对应的 Handler 函数
- 将每个 IPC 事件归类到对应的功能域中

示例输出格式：
| IPC Event | Handler Function | 文件位置 | 所属功能域 |
| :--- | :--- | :--- | :--- |
| `app-fork:nginx:startServer` | `startServer(version)` | `src/fork/module/Nginx/index.ts:156` | 服务生命周期管理 |
```

---

## 第二阶段：核心逻辑分析（按功能域组织）

### Step 5: 调用链还原（按功能域分组）

对每个功能域中的核心操作，构建完整调用链：

```markdown
**模板 - 功能域: {DomainName}**

1. UI 触发点
   - 文件: `src/render/components/{Module}/xxx.vue`
   - 函数: `handleStart()` 或类似
   - 代码片段: （提取 5-10 行核心代码）

2. Store 层处理
   - 文件: `src/render/components/{Module}/store.ts`
   - 函数: `startServer(version)`
   - 操作: 调用 `ipcRenderer.invoke('app-fork:{module}:startServer', ...)`

3. IPC 通信层
   - 事件名: `app-fork:{module}:startServer`
   - Payload 结构: `{ version: SoftInstalled, ... }`

4. Fork 处理层
   - 文件: `src/fork/module/{Module}/index.ts`
   - 函数: `startServer(version)`
   - 核心逻辑:
     - 参数处理
     - 命令构建
     - Shell 执行

5. Shell 执行层
   - 构建的命令: （完整的命令字符串）
   - 执行函数: `execPromise()` / `execPromiseWithEnv()`
   - 环境变量: （如有特殊设置）

6. 状态回写
   - 成功/失败回调
   - Vue 状态更新逻辑
```

### Step 6: 平台差异代码提取

```markdown
搜索以下关键词并提取所有条件分支：
- `isWindows()` / `isMac()` / `isLinux()`
- `process.platform`
- `isArm()` / `isAppleSilicon()`

对每个平台差异点记录，并**关联到具体功能域**：
| 平台 | 代码位置 | 所属功能域 | 差异描述 | 具体代码 |
| :--- | :--- | :--- | :--- | :--- |
| Windows | `src/fork/module/{Module}/index.ts:89` | 容器启动 | 路径分隔符处理 | 代码片段 |
| macOS | `src/fork/module/{Module}/index.ts:134` | 服务安装 | 权限命令前缀 | `sudo` 处理 |
```

### Step 7: 数据清洗点分析

```markdown
寻找以下代码模式并分析，按功能域归类：

1. **正则表达式解析**
   - 搜索: `new RegExp`, `.match(`, `.replace(/.../`
   - 记录: 正则用途、匹配目标、提取字段

2. **JSON 解析**
   - 搜索: `JSON.parse(`, `JSON.stringify(`
   - 记录: 解析的数据来源、结构定义

3. **字符串分割/提取**
   - 搜索: `.split(`, `.substring(`, `.slice(`
   - 记录: 处理 Shell 输出的关键逻辑

4. **错误码处理**
   - 搜索: `try {`, `catch (`, `if (code !== 0)`
   - 记录: 错误处理流程、重试机制
```

---

## 第三阶段：文档生成

### Step 8: 按规范生成文档

根据 `SYSTEM_PROMPT_FINAL.md` 第 3 节的**新结构规范**，生成：

```markdown
# {Module} Deep Dive

> **模块类型**: {service/tool/...}
> **模块标识**: `{typeFlag}`
> **继承基类**: `{Base/BaseManager}`
> **分析日期**: YYYY-MM-DD

---

## Overview
（禁止泛泛而谈，必须指明技术定位）

---

## Architecture & State Management
（包含 Mermaid 流程图）

---

## Core Data Models
（提取所有关键 Interface）

---

## Functional Deep Dives
（**文档核心** - 按 Step 3 发现的功能域组织，每一个功能域一个二级标题）

每个功能域子节必须包含：
- 机制概述
- 完整调用链（UI → Manager → IPC → Fork → Shell）
- 关键代码片段 + 数据清洗逻辑
- 平台差异分支（isLinux / isWindows 等）
- XTermExec / 终端模式（如果涉及）
- 边缘情况与错误处理

---

## IPC API Reference
（完整 IPC 映射表格，覆盖所有事件）

---

## Cross-Platform Nuances
（总览表格 + 每个功能域中已提及的平台差异总结）

---

## Data Flow & Error Handling
（整体数据流 + 统一错误处理模板 + 临时文件清理）

---

## 各章节必须包含 Sources
（每个 Section 末尾标注 `Sources: path/to/file.ts:line-line`）
```

---

## 第四阶段：质量检查

### Step 9: 自检清单（强制执行）

生成文档后，逐项检查：

```markdown
### 内容质量检查
- [ ] **信息密度**: 每 5 行文本包含 2 函数 + 1 路径 + 1 命令/Interface
- [ ] **精准溯源**: 每个 Section 末尾都有 `Sources: path/to/file.ts:line-line`
- [ ] **无模糊描述**: 没有"负责..."、"用于..."、"相关逻辑"等词汇
- [ ] **调用链完整**: UI → Manager → IPC → Fork → Shell 链路清晰

### 结构完整性检查
- [ ] **Overview**: 包含模块技术定位，非功能描述
- [ ] **Architecture**: 包含组件层次 + 状态同步机制
- [ ] **Data Models**: 包含核心 Interface 定义
- [ ] **Functional Deep Dives**: 按 Step 1 发现的功能域顺序撰写，而非固定 Execution Trace 模板
- [ ] **IPC API**: 表格包含 Event/Payload/Handler/Command/Side Effects
- [ ] **Cross-Platform**: 表格对比 Windows/macOS/Linux 差异，且差异已融入功能域分析
- [ ] **Data Flow**: 回答数据来源、转换、返回、错误处理四个问题

### 功能域驱动专项检查（新增关键项）
- [ ] **是否按发现的功能域组织了 `Functional Deep Dives` 而不是强制 Execution Trace 大章节？**
- [ ] **是否覆盖了所有 Class 以及 XTermExec 模式？**
- [ ] **是否每个功能域都包含独立的调用链 + 平台差异 + 数据清洗？**
- [ ] **功能域标题是否足够硬核**（例如用"多版本目录路由隔离"代替"版本切换功能"）？

### 技术准确性检查
- [ ] **函数名拼写**: 与源码完全一致
- [ ] **文件路径**: 使用相对路径 `src/...` 格式
- [ ] **行号范围**: Sources 标注准确的行号范围
- [ ] **NOT FOUND 标注**: 未找到的代码明确标注 `⚠️ NOT FOUND IN SOURCE`

### 反偷懒检查（关键）
- [ ] **非产品描述**: 没有"提供...能力"、"支持...功能"等营销语言
- [ ] **非 API 手册**: 不是简单罗列方法，而是解释实现机制
- [ ] **代码细节**: 包含具体的命令参数构建、正则解析、错误处理逻辑
```

### Step 10: 修正与完善

对于检查中发现的问题，必须修正：

```markdown
**问题分类与处理:**

1. **信息密度不足**
   → 补充具体函数名、文件路径、Shell 命令

2. **缺少 Sources**
   → 回溯源码，补充 `Sources: path/file.ts:line-line`

3. **描述模糊**
   → 替换为: "通过 `[函数]` 调用 `[命令]` 实现 `[功能]`"

4. **调用链断链**
   → 补充中间环节，确保 UI → ... → Shell 完整

5. **未找到代码**
   → 明确标注 `⚠️ NOT FOUND IN SOURCE: {具体描述}`

6. **落入固定模板**
   → 立即删除泛泛而谈的段落，按功能域重新组织到对应子节中
```

---

## 输出要求

### 文档保存位置

```markdown
生成的文档保存至: `docs/deepwiki/{module}.md`

文件名规范:
- 全小写
- 使用模块标识名（如 podman, nginx, mysql）
- 后缀 `.md`
```

### 文档格式要求

```markdown
1. **标题层级**: 使用 `#`, `##`, `###` 三级结构
2. **代码块**: 所有代码片段使用 ```typescript 或 ```bash 标注语言
3. **表格**: 使用 Markdown 表格呈现结构化数据
4. **流程图**: 使用 Mermaid 语法绘制架构图和调用链
5. **Sources**: 每个 Section 末尾独立一行，格式: `Sources: src/...`
```

---

## 执行指令模板

当收到模块分析指令时，按以下模板执行：

```markdown
用户指令: "分析 {Module} 模块"

执行步骤:
1. 确认系统提示词: 已阅读 `docs/deepwiki/SYSTEM_PROMPT_FINAL.md`
2. 执行第一阶段: 读取 Module.ts, type.ts, fork module, store.ts, class/ 下所有文件
3. 执行功能域发现: 明确列出本模块全部功能域
4. 执行第二阶段: 按功能域分组构建调用链、提取平台差异、分析数据清洗点
5. 执行第三阶段: 按新结构规范生成完整文档
6. 执行第四阶段: 自检清单逐项检查并修正，特别注意功能域驱动专项检查
7. 输出结果: 保存至 `docs/deepwiki/{module}.md`
```

---

## 特别提醒

> **你是在做一次严格的源码逆向分析（Forensic Analysis），不是写一篇技术博客。**
>
> **每一句话都必须能追溯到具体的代码行。**
>
> **禁止基于经验推测，禁止模糊描述，禁止脑补。**
>
> **文档主体结构必须由模块的真实功能域驱动，严禁使用固定模板。**

---

**任务文件版本**: 3.0
**配套系统提示词**: `docs/deepwiki/SYSTEM_PROMPT_FINAL.md`
**最后更新**: 2026-04-13
