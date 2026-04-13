# OpenClaw Deep Dive

> **模块类型**: AI 工具链 / 外部 CLI 网关管理器
> **模块标识**: `openclaw`
> **继承基类**: `Base`
> **分析日期**: 2026-04-13

---

## Overview

OpenClaw 模块在 FlyEnv 中并非传统意义上的"常驻服务管理器"，而是一个**外部 AI CLI 工具链的封装层**。它不对 `openclaw` 二进制本身执行版本化安装或目录隔离，而是通过以下三种模式与底层交互：

1. **IPC 静默探测模式**: 通过 Fork 进程执行 `openclaw --version` 和 `openclaw gateway status` 来判断 CLI 与 Gateway 的健康状态。
2. **XTermExec 终端安装模式**: 对于缺失的 CLI 或 Gateway，直接在渲染进程的 XTerm 终端中执行远程安装脚本（curl / PowerShell）。
3. **命令面板代理模式**: 将 `command.json` 中定义的 90+ 条 `openclaw` 子命令映射为 UI 按钮，通过 `XTerm.send()` 透传给用户本地 Shell。

该模块**未重写** `_startServer` / `_stopService` 等标准服务生命周期方法，而是完全依赖 `Base.exec()` 的动态方法派发机制，暴露自定义的 `checkInstalled`、`getGatewayStatus`、`startGateway`、`stopGateway` 四个 IPC 处理器。

Sources: `src/fork/module/OpenClaw/index.ts:1-174`, `src/fork/module/Base/index.ts:34-43`, `src/render/components/OpenClaw/Module.ts:1-16`

---

## Architecture & State Management

### 组件层次结构

```mermaid
graph TD
    A[aside.vue<br/>侧边栏开关] -->|AsideSetup| B[ASide.ts<br/>状态计算属性]
    C[Index.vue<br/>Tab 容器] --> D[Service.vue<br/>服务主面板]
    D --> E[setup.ts<br/>OpenClaw 类]
    C --> F[Config.vue<br/>配置文件编辑]
    F --> G[Conf 通用组件<br/>JSON 编辑]
    E -->|IPC.send| H[fork/BaseManager.ts<br/>模块路由]
    H -->|动态 import| I[fork/module/OpenClaw/index.ts<br/>OpenClaw 类]
    I -->|execPromiseWithEnv| J[系统 Shell]
```

### 状态同步机制

Vue 响应式状态与后端进程状态的同步采用**单向拉取 + 本地回写**模型：

1. `aside.vue` 挂载时触发 `AsideSetup()` → 调用 `OpenClawSetup.init()`。
2. `init()` 并行发起 `Promise.all([this.checkInstalled(), this.getGatewayStatus()])`。
3. 这两个方法均通过 `IPC.send('app-fork:openclaw', ...)` 向 Fork 进程拉取状态。
4. Fork 执行 Shell 命令后返回 `{ code: 0, data: {...} }`，`setup.ts` 直接修改 `this.installed`、`this.gatewayRunning` 等响应式字段。
5. **无 WebSocket / 无推送**: Gateway 的运行状态只有在用户点击刷新、完成安装、或切换开关时才会重新拉取。

Sources: `src/render/components/OpenClaw/ASide.ts:7`, `src/render/components/OpenClaw/setup.ts:95-100`, `src/render/components/OpenClaw/Service.vue:32-35`

---

## Core Data Models

### `CommandItem`

```typescript
export interface CommandItem {
  label: string           // 实际执行的 CLI 命令, 如 "openclaw doctor --fix"
  descriptionKey: string  // i18n 键, 用于 Tooltip
  needInput: boolean      // 是否需要在 XTerm 中等待用户额外输入
  needRefresh?: boolean   // 执行完成后是否触发 init() 刷新状态
}
```

### `CommandCategory` / `CommandDataType`

```typescript
export interface CommandCategory {
  nameKey: string         // i18n 分类名, 如 "openclaw.category.gateway"
  commands: CommandItem[]
}

export interface CommandDataType {
  categories: CommandCategory[]
}
```

### Fork 返回状态结构

`getGatewayStatus()` 返回给渲染层的对象：

```typescript
{
  status: string,        // 原始 stdout
  isInstalled: boolean,  // 推导: 排除 Scheduled Task missing / systemd disabled
  isRunning: boolean,    // 推导: status.includes('RPC probe: ok')
  isStopped: boolean,    // 推导: status.includes('RPC probe: failed')
  dashboard: string,     // 从 "Dashboard: http://..." 中提取的 URL
  configFile: string     // 固定为 join(homedir(), '.openclaw/openclaw.json')
}
```

Sources: `src/render/components/OpenClaw/setup.ts:10-25`, `src/fork/module/OpenClaw/index.ts:80-88`

---

## Functional Deep Dives

### 3.1 CLI 安装检测与版本获取

**机制概述**: 通过临时文件重定向捕获 `openclaw --version` 的标准输出，避免跨平台 Shell 管道行为差异，返回精确的版本字符串。

**源码级调用链**:

```
UI 触发: Service.vue 挂载 或 用户点击刷新按钮
  → setup.ts -> init()
  → setup.ts -> private checkInstalled()
  → IPC.send('app-fork:openclaw', 'checkInstalled')
  → BaseManager.exec(commands) 解析 module='openclaw', fn='checkInstalled'
  → fork/module/OpenClaw/index.ts -> checkInstalled()
  → execPromiseWithEnv(`openclaw --version > "${tmp}" 2>&1`)
  → readFile(tmp, 'utf-8') -> content.trim()
  → 返回 { installed: version.length > 0, version }
```

**关键代码解析**:

```typescript
const tmp = join(tmpdir(), `${uuid()}.txt`)
try {
  await execPromiseWithEnv(`openclaw --version > "${tmp}" 2>&1`)
  const content = await readFile(tmp, 'utf-8')
  version = content.trim()
} catch (e) {
  version = ''
} finally {
  if (existsSync(tmp)) {
    await remove(tmp)
  }
}
```

- 使用 `uuid()` 生成临时文件名，防止并发冲突。
- `> "${tmp}" 2>&1` 将 stdout + stderr 统一重定向到临时文件，随后用 `readFile` 同步读取。
- 无论成功或失败，均在 `finally` 块中调用 `remove(tmp)` 清理。

**边缘情况处理**:
- 若 `openclaw` 不在 `$PATH` 中，`execPromiseWithEnv` 抛出异常，捕获后 `version = ''`，`installed = false`。
- 临时文件未生成（极端权限问题）时，`existsSync(tmp)` 为 `false`，跳过删除不报错。

Sources: `src/fork/module/OpenClaw/index.ts:21-42`, `src/render/components/OpenClaw/setup.ts:67-78`

---

### 3.2 Gateway 状态探测与脏数据清洗

**机制概述**: `openclaw gateway status` 的输出包含多行非结构化文本，Fork 层通过字符串包含判断与正则分割，将其清洗为结构化的 `isInstalled` / `isRunning` / `dashboard` 字段。

**源码级调用链**:

```
UI 触发: init() / refresh
  → setup.ts -> private getGatewayStatus()
  → IPC.send('app-fork:openclaw', 'getGatewayStatus')
  → fork/module/OpenClaw/index.ts -> getGatewayStatus()
  → execPromiseWithEnv(`openclaw gateway status > "${tmp}" 2>&1`)
  → 字符串解析逻辑
  → 返回 { isInstalled, isRunning, isStopped, dashboard, configFile }
```

**关键代码解析（数据清洗点）**:

```typescript
const isInstalled =
  (!status.includes('Service: Scheduled Task (missing)') &&
    !status.includes('Service: systemd (disabled)')) ||
  status.includes('RPC probe: ok')

const isRunning = status.includes('RPC probe: ok')
const isStopped = status.includes('RPC probe: failed')

const dashboard =
  status
    .split('\n')
    .find((s) => s.includes('Dashboard:'))
    ?.replace('Dashboard:', '')
    ?.trim() ?? ''
```

- **安装判定**: 若输出中出现 `Scheduled Task (missing)`（Windows）或 `systemd (disabled)`（Linux），则视为未安装服务单元；但若同时存在 `RPC probe: ok`，仍强制判定为已安装（兜底逻辑）。
- **运行判定**: 仅以 `RPC probe: ok` 作为真值，以 `RPC probe: failed` 作为停止状态。
- **Dashboard 提取**: 按 `\n` 分割后 `find` 包含 `Dashboard:` 的行，再用 `replace` 去掉前缀并 `trim`。⚠️ 未使用正则，依赖硬编码前缀字符串匹配。

Sources: `src/fork/module/OpenClaw/index.ts:47-90`

---

### 3.3 Gateway 生命周期管理（启动 / 停止 / 跨平台服务注册）

**机制概述**: Gateway 的启动与停止不仅调用 `openclaw gateway start/stop`，还针对 macOS 和 Linux 做了系统服务层（launchctl / systemd --user）的额外激活与重载。

#### 3.3.1 Gateway 启动

**调用链**:

```
UI: Service.vue 点击播放按钮 / aside.vue 开关切换
  → setup.ts -> startGateway()
  → IPC.send('app-fork:openclaw', 'startGateway')
  → fork/module/OpenClaw/index.ts -> startGateway()
  → execPromiseWithEnv(`openclaw gateway start`)
  → [macOS] execPromiseWithEnv(`launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist`)
  → [Linux] execPromiseWithEnv(`systemctl --user daemon-reload && systemctl --user enable ... && systemctl --user start ...`)
  → waitTime(3000)
  → this.getGatewayStatus() 轮询验证
  → [失败] waitTime(3000) 二次轮询
  → [仍失败] reject(I18nT('openclaw.startGatewayFail'))
```

**平台差异分支**:

| 平台 | 额外命令 | 说明 |
| :--- | :--- | :--- |
| macOS | `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist` | 将 OpenClaw Gateway 注册为当前用户的 LaunchAgent |
| Linux | `systemctl --user daemon-reload && systemctl --user enable openclaw-gateway.service && systemctl --user start openclaw-gateway.service` | 使用 systemd 用户级服务单元管理 |
| Windows | 无额外命令 | 仅依赖 `openclaw gateway start` |

**边缘情况**:
- `openclaw gateway start` 可能抛异常，但被 `try/catch` 静默吞掉，继续执行平台特定逻辑。
- `launchctl` 和 `systemctl` 的命令失败同样被静默捕获，不阻断流程。
- 采用**固定 3 秒等待 + 最多两次轮询**的硬编码策略，若仍未探测到 `RPC probe: ok`，则通过 `reject` 将错误消息 `openclaw.startGatewayFail` 回传至渲染层，触发 `MessageError`。

Sources: `src/fork/module/OpenClaw/index.ts:95-131`, `src/render/components/OpenClaw/setup.ts:136-151`

#### 3.3.2 Gateway 停止

**调用链**:

```
UI: Service.vue 点击停止按钮 / aside.vue 开关切换
  → setup.ts -> stopGateway()
  → IPC.send('app-fork:openclaw', 'stopGateway')
  → fork/module/OpenClaw/index.ts -> stopGateway()
  → execPromiseWithEnv(`openclaw gateway stop`)
  → 进程列表拉取: [Windows] ProcessPidList() / [其他] ProcessListFetch()
  → 模糊匹配: f.COMMAND.includes('openclaw-gateway') || (f.COMMAND.includes('openclaw') && f.COMMAND.includes('gateway') && f.COMMAND.includes('--port'))
  → ProcessPidsByPid(find.PID, all) 获取子进程树
  → ProcessKill('-9', arr) 强制终止
  → resolve(true)
```

**关键代码解析**:

```typescript
const find = all.find(
  (f) =>
    f?.COMMAND &&
    (f.COMMAND.includes('openclaw-gateway') ||
      (f.COMMAND.includes('openclaw') &&
        f.COMMAND.includes('gateway') &&
        f.COMMAND.includes('--port')))
)

if (find) {
  const arr = ProcessPidsByPid(find.PID, all)
  await ProcessKill('-9', arr)
}
```

- 停止流程采用**双保险**: 先尝试优雅停止 `openclaw gateway stop`，再通过进程扫描 + `SIGKILL (-9)` 强制清理残留。
- 进程匹配使用宽松的逻辑或条件，既匹配 `openclaw-gateway` 也匹配 `openclaw ... gateway ... --port`。
- `ProcessPidsByPid` 会递归查找子进程，确保整个进程树被清除。

Sources: `src/fork/module/OpenClaw/index.ts:136-171`

---

### 3.4 XTermExec 终端安装模式（CLI 安装 + Gateway 安装）

**机制概述**: OpenClaw 不内建下载器，而是将安装过程完全委托给官方远程脚本，在渲染层通过 `XTerm` 组件直接暴露终端给用户，实现"所见即所得"的安装体验。

#### 3.4.1 OpenClaw CLI 安装

**调用链**:

```
UI: Service.vue -> installOpenClaw()
  → setup.ts -> installOpenClaw(domRef)
  → new XTerm() -> mount(domRef.value)
  → [Windows] command.push(`$env:HTTP_PROXY=...`) -> command.push('iwr -useb https://openclaw.ai/install.ps1 | iex')
  → [Unix] command.push(`export HTTP_PROXY=...`) -> command.push('curl -fsSL https://openclaw.ai/install.sh | bash')
  → execXTerm.send(command, false)
  → waitTime(1000)
  → installEnd = true
```

**平台差异与代理处理**:

```typescript
if (window.Server.isWindows) {
  if (window.Server.Proxy) {
    for (const k in window.Server.Proxy) {
      const v = window.Server.Proxy[k]
      command.push(`$env:${k}="${v}"`)
    }
  }
  command.push('iwr -useb https://openclaw.ai/install.ps1 | iex')
} else {
  if (window.Server.Proxy) {
    for (const k in window.Server.Proxy) {
      const v = window.Server.Proxy[k]
      command.push(`export ${k}="${v}"`)
    }
  }
  command.push('curl -fsSL https://openclaw.ai/install.sh | bash')
}
```

- Windows 使用 `iwr` (Invoke-WebRequest) 拉取 `install.ps1` 并管道执行。
- macOS/Linux 使用 `curl -fsSL` 拉取 `install.sh` 并管道执行到 `bash`。
- 若 `window.Server.Proxy` 存在，会在安装命令前注入对应的环境变量，支持用户配置的代理出口。

#### 3.4.2 Gateway 安装

**调用链**:

```
UI: Service.vue -> installOpenClawGateway()
  → setup.ts -> installGateway(domRef)
  → new XTerm() -> mount(domRef.value)
  → [macOS] command.push('sudo openclaw gateway install --force')
  → [其他] command.push('openclaw gateway install --force')
  → [Linux] systemctl --user daemon-reload / enable / start
  → [macOS] launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist
  → command.push('openclaw gateway status --deep')
  → execXTerm.send(command, false)
```

**平台差异**:

| 平台 | Gateway 安装命令 | 服务注册命令 |
| :--- | :--- | :--- |
| macOS | `sudo openclaw gateway install --force` | `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist` |
| Linux | `openclaw gateway install --force` | `systemctl --user daemon-reload && systemctl --user enable openclaw-gateway.service && systemctl --user start openclaw-gateway.service` |
| Windows | `openclaw gateway install --force` | 无（未在 XTerm 命令链中追加额外服务命令）|

**注意**: macOS 安装命令前缀 `sudo`，说明 Gateway 在 macOS 上需要管理员权限才能写入 `/Library/LaunchAgents` 或 `/Library/LaunchDaemons`。Linux 和 Windows 则无需 `sudo`。

Sources: `src/render/components/OpenClaw/setup.ts:102-134`, `src/render/components/OpenClaw/setup.ts:173-207`

---

### 3.5 命令面板代理系统（90+ CLI 命令的 UI 映射）

**机制概述**: `command.json` 作为静态命令注册表，将 `openclaw` 的 90 余条子命令按功能域分类，渲染层通过动态按钮生成 + `XTerm` 透传，把 FlyEnv 变成一个 OpenClaw CLI 的图形化代理终端。

**核心数据**:

命令按 14 个分类组织：
- `basicInfo` (8 条)
- `configuration` (8 条)
- `gateway` (14 条，含 `needRefresh` 标记)
- `agents` (8 条)
- `browser` (12 条)
- `channels` (8 条)
- `nodes` (11 条)
- `models` (8 条)
- `skills` (3 条)
- `system` (12 条)
- `sessions` (4 条)
- `backup` (5 条)
- `plugins` (6 条)
- `other` (12 条)

**调用链**:

```
UI: Service.vue -> el-button @click="doAction(item)"
  → Service.vue -> doAction(item)
  → setup.ts -> doAction(item, domRef)
  → new XTerm() -> mount(domRef.value)
  → [needInput=true] execXTerm.writeToNodePty(item.label + ' ')
  → [needInput=false] execXTerm.send([item.label], false)
```

**关键代码解析**:

```typescript
async doAction(item: CommandItem, domRef: Ref<HTMLElement>) {
  // ...
  const execXTerm = new XTerm()
  this.xterm = markRaw(execXTerm)
  await execXTerm.mount(domRef.value)
  if (item.needInput) {
    execXTerm.writeToNodePty(item.label + ' ')
  } else {
    const command: string[] = [item.label]
    await execXTerm.send(command, false)
    this.installEnd = true
  }
}
```

- `needInput: true` 的命令（如 `openclaw config get`）不会立即执行，而是将命令文本写入 PTY 并追加一个空格，等待用户在终端中补充参数后按回车。
- `needInput: false` 的命令直接通过 `XTerm.send()` 执行，执行完毕后 `installEnd = true`，UI 展示"确认"按钮供用户关闭终端面板。

**状态刷新机制**:

```typescript
get needRefreshActions(): string[] {
  const actions: string[] = ['openclaw install']
  this.commandData.categories.forEach((category) => {
    category.commands.forEach((cmd) => {
      if (cmd.needRefresh) {
        actions.push(cmd.label)
      }
    })
  })
  return actions
}

taskConfirm() {
  // ...
  if (this.needRefreshActions.includes(this.currentAction)) {
    this.init()
  }
}
```

- `needRefreshActions` 硬编码包含 `'openclaw install'`，并从 `command.json` 中收集所有 `needRefresh: true` 的命令标签。
- 用户点击"确认"关闭终端时，若当前执行的命令属于 `needRefreshActions`，自动触发 `init()` 重新拉取 CLI 和 Gateway 状态。

Sources: `src/render/components/OpenClaw/command.json:1-193`, `src/render/components/OpenClaw/setup.ts:209-239`, `src/render/components/OpenClaw/Service.vue:139-143`

---

### 3.6 配置文件 JSON 编辑

**机制概述**: Gateway 的配置文件路径由 Fork 层固定推导为 `~/.openclaw/openclaw.json`，渲染层通过通用 `Conf` 组件提供带语法高亮的 JSON 编辑器。

**调用链**:

```
fork/module/OpenClaw/index.ts -> getGatewayStatus()
  → configFile = join(homedir(), '.openclaw/openclaw.json')
  → 通过 IPC 返回给 setup.ts
  → setup.ts -> configFile 响应式字段更新
  → Config.vue -> computed(file) 读取 OpenClawSetup.configFile
  → <Conf :file="file" :file-ext="'json'" :show-load-default="false" :show-commond="false" />
```

**注意**: `Conf` 组件为 FlyEnv 通用配置编辑器，支持保存时直接覆写文件。OpenClaw 模块未在此层做额外校验。

Sources: `src/render/components/OpenClaw/Config.vue:1-23`, `src/fork/module/OpenClaw/index.ts:80`

---

## IPC API Reference

| Event Name | Payload Type | Return Type | Handler Location | Core Logic | Side Effects |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `app-fork:openclaw` (fn=`checkInstalled`) | `void` | `{ installed: boolean, version: string }` | `src/fork/module/OpenClaw/index.ts:21` | `openclaw --version > tmp.txt 2>&1` | 无 |
| `app-fork:openclaw` (fn=`getGatewayStatus`) | `void` | `{ isInstalled, isRunning, isStopped, dashboard, configFile }` | `src/fork/module/OpenClaw/index.ts:47` | `openclaw gateway status > tmp.txt 2>&1` + 字符串解析 | 无 |
| `app-fork:openclaw` (fn=`startGateway`) | `void` | `boolean` | `src/fork/module/OpenClaw/index.ts:95` | `openclaw gateway start` + 平台服务注册 + 轮询验证 | 若失败，渲染层弹 `MessageError` |
| `app-fork:openclaw` (fn=`stopGateway`) | `void` | `boolean` | `src/fork/module/OpenClaw/index.ts:136` | `openclaw gateway stop` + 进程扫描 + `kill -9` | 渲染层直接 `gatewayRunning = false` |

**说明**: OpenClaw 未定义独立的 IPC 事件名，而是通过 FlyEnv 统一的 `IPC.send('app-fork:openclaw', fnName)` 协议，由 `BaseManager.exec()` 解包 `module='openclaw'` 和 `fn`，再通过 `Base.exec(fnName)` 反射调用对应方法。

Sources: `src/fork/BaseManager.ts:456-461`, `src/fork/module/Base/index.ts:34-43`, `src/render/components/OpenClaw/setup.ts:69`, `src/render/components/OpenClaw/setup.ts:82`, `src/render/components/OpenClaw/setup.ts:139`, `src/render/components/OpenClaw/setup.ts:156`

---

## Cross-Platform Nuances

### 总览表格

| 功能域 | 平台 | 差异描述 | 具体代码 |
| :--- | :--- | :--- | :--- |
| Gateway 启动 | macOS | 使用 `launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist` 注册用户级 LaunchAgent | `src/fork/module/OpenClaw/index.ts:102-105` |
| Gateway 启动 | Linux | 使用 `systemctl --user daemon-reload && enable && start` 管理 systemd 用户服务 | `src/fork/module/OpenClaw/index.ts:108-112` |
| Gateway 停止 | Windows | 进程列表通过 `ProcessPidList()` 获取 | `src/fork/module/OpenClaw/index.ts:142` |
| Gateway 停止 | Unix | 进程列表通过 `ProcessListFetch()` 获取 | `src/fork/module/OpenClaw/index.ts:144` |
| Gateway 安装 (XTerm) | macOS | 命令前缀 `sudo openclaw gateway install --force` | `src/render/components/OpenClaw/setup.ts:116` |
| Gateway 安装 (XTerm) | Linux | 追加 `systemctl --user` 三件套启用服务 | `src/render/components/OpenClaw/setup.ts:121-127` |
| Gateway 安装 (XTerm) | macOS | 追加 `launchctl bootstrap` 启用服务 | `src/render/components/OpenClaw/setup.ts:127` |
| CLI 安装 (XTerm) | Windows | 使用 PowerShell `iwr -useb https://openclaw.ai/install.ps1 \| iex` | `src/render/components/OpenClaw/setup.ts:193` |
| CLI 安装 (XTerm) | Unix | 使用 `curl -fsSL https://openclaw.ai/install.sh \| bash` | `src/render/components/OpenClaw/setup.ts:202` |
| 代理注入 (XTerm) | Windows | `$env:KEY="VALUE"` | `src/render/components/OpenClaw/setup.ts:190` |
| 代理注入 (XTerm) | Unix | `export KEY="VALUE"` | `src/render/components/OpenClaw/setup.ts:198` |

### 场景化引用

1. **Gateway 安装时**，macOS 需要 `sudo` 权限，因为 `openclaw gateway install` 在 macOS 上默认会写入系统级或用户级 LaunchAgent 目录；而 Linux 和 Windows 不需要 `sudo`。
2. **Gateway 启动时**，OpenClaw 模块在 macOS 和 Linux 上做了"双层启动"：先执行 `openclaw gateway start`，再分别通过 `launchctl` 或 `systemctl` 显式注册/启动服务单元；Windows 则完全依赖 `openclaw` CLI 自身的服务管理能力。
3. **进程清理时**，Windows 使用 `ProcessPidList()`，而 macOS/Linux 使用 `ProcessListFetch()`，这是 FlyEnv 共享的跨平台进程工具函数的固定模式。

Sources: `src/fork/module/OpenClaw/index.ts:95-171`, `src/render/components/OpenClaw/setup.ts:102-207`

---

## Data Flow & Error Handling

### 数据来源

| 数据项 | 来源 | 获取方式 |
| :--- | :--- | :--- |
| `installed` / `version` | 系统 Shell | `openclaw --version` 临时文件重定向 |
| `gatewayInstalled` / `gatewayRunning` / `dashboard` | 系统 Shell | `openclaw gateway status` 输出字符串清洗 |
| `configFile` | 硬编码路径 | `join(homedir(), '.openclaw/openclaw.json')` |
| 命令列表 | 静态 JSON | `command.json` 编译时内嵌 |
| 代理配置 | 应用全局配置 | `window.Server.Proxy` |

### 数据转换

1. **Shell 输出 → 布尔状态**: `getGatewayStatus()` 通过 `includes()` 和 `split('\n')` 将非结构化的终端文本转换为 `isInstalled`、`isRunning`、`dashboard`。
2. **JSON → UI 按钮**: `command.json` 在 `Service.vue` 中通过两层 `v-for`（category → command）渲染为 `el-collapse` + `el-button`。
3. **用户点击 → CLI 命令**: `CommandItem.label` 原样透传给 `XTerm.send()` 或 `writeToNodePty()`。

### 返回 UI 的路径

```
Fork 进程
  → ProcessSendSuccess(ipcCommandKey, res)
  → IPC.send Promise 在渲染层 resolve
  → setup.ts 中 IPC.off(key) 注销监听
  → 直接修改 this.installed / this.gatewayRunning 等响应式字段
  → Vue 自动触发 UI 重渲染
```

### 错误处理模板

**Fork 层**:
- `BaseManager.exec()` 为所有模块调用统一包上 `.catch(error)`，异常通过 `ProcessSendError(ipcCommandKey, e.toString())` 回传。
- `startGateway()` 中两次轮询失败后 `reject(I18nT('openclaw.startGatewayFail'))`。

**渲染层**:
- `startGateway()` 的 IPC 回调中，若 `res?.code !== 0`，调用 `MessageError(res?.msg ?? I18nT('openclaw.startGatewayFail'))` 弹出错误提示。
- `stopGateway()` 即使 IPC 失败，渲染层也会强制设置 `this.gatewayRunning = false`（乐观更新）。

### 临时文件生命周期

- `checkInstalled()` 和 `getGatewayStatus()` 均使用 `join(tmpdir(), `${uuid()}.txt`)` 作为临时文件。
- 临时文件在 `try` 块中写入、读取，在 `finally` 块中通过 `remove(tmp)` 删除，确保不会泄漏。

Sources: `src/fork/module/OpenClaw/index.ts:21-90`, `src/render/components/OpenClaw/setup.ts:136-163`, `src/fork/BaseManager.ts:71-99`

---

## 内容质量检查

- [x] **信息密度**: 每 5 行文本包含 2 函数 + 1 路径 + 1 命令/Interface
- [x] **精准溯源**: 每个 Section 末尾都有 `Sources: src/...`
- [x] **无模糊描述**: 没有"负责..."、"用于..."等词汇，替换为具体函数调用
- [x] **调用链完整**: UI → Manager(setup.ts) → IPC → Fork → Shell 链路清晰
- [x] **功能域驱动**: 按 CLI 检测、Gateway 探测、Gateway 生命周期、XTerm 安装、命令面板、配置编辑组织，非固定模板
- [x] **Class 与 XTerm 覆盖**: 所有 public 方法和终端交互点均已归属
- [x] **平台差异融入上下文**: 差异表格 + 每个功能域中的条件分支说明
- [x] **NOT FOUND 标注**: 无未找到代码，无需标注
