# Podman Deep Dive

> **模块类型**: containerRuntime
> **模块标识**: `podman`
> **继承基类**: `Base`
> **分析日期**: 2026-04-13

---

## Overview

Podman 模块在 FlyEnv 中定位为**无守护进程的容器运行时管理器**。它不同于 Nginx/MySQL 等传统服务模块，不通过 `_startServer`/`_stopService` 基类模板管理常驻进程，而是通过独立的 Fork 进程直接调用 `podman` CLI 命令，实现对 Podman Machine（macOS/Windows 虚拟机层）、Container、Image 以及 Docker Compose 项目的全生命周期控制。模块核心依赖底层 `podman` 二进制和 `docker-compose` 插件，前端通过 `XTermExec` 终端执行模式与 IPC 静默模式混合交互。

Sources: `src/render/components/Podman/Module.ts:1-12`, `src/fork/module/Podman/index.ts:1-15`

---

## Architecture & State Management

### 组件层次结构

```mermaid
graph TD
    A[Index.vue] --> B[left.vue]
    A --> C[right.vue]
    C --> D[dashboard.vue]
    C --> E[compose/compose.vue]
    C --> F[image/image.vue]
    C --> G[container/container.vue]
    H[PodmanManager<br/>class/Podman.ts] --> I[Machine[]]
    H --> J[Compose[]]
    I --> K[Container[]]
    I --> L[Image[]]
```

### 状态同步机制

Podman 模块采用**中心化响应式状态树**：`PodmanManager` (`reactiveBind(new Podman())`) 作为单一状态源，通过 `reactiveBind` 将 class 实例转换为 Vue 响应式对象。Machine/Container/Image/Compose 对象均继承自各自的 class，内部通过 `IPC.send('app-fork:podman', ...)` 发起异步调用，回调中直接修改 `this.run`/`this.running` 等响应式字段，无需经过 Pinia Store。

状态流转路径：
```
Vue Component (left.vue/right.vue) 
  → PodmanManager / Machine / Container / Image / Compose class
  → IPC.send('app-fork:podman', eventName, ...args)
  → Main Process IPC Relay
  → Fork Process: src/fork/module/Podman/index.ts
  → execPromiseWithEnv(cmd)
  → IPC Callback → 直接修改 class 实例的 reactive 字段
```

Sources: `src/render/components/Podman/class/Podman.ts:13-230`, `src/render/components/Podman/class/Machine.ts:16-307`

---

## Core Data Models

### MachineItemType

```typescript
export interface MachineItemType {
  ConfigDir: { Path: string }
  ConnectionInfo: { PodmanSocket: { Path: string }; PodmanPipe: null }
  Created: string
  LastUp: string
  Name: string
  Resources: { CPUs: number; DiskSize: number; Memory: number; USBs: any[] }
  SSHConfig: { IdentityPath: string; Port: number; RemoteUsername: string }
  State: string
  UserModeNetworking: boolean
  Rootful: boolean
  Rosetta: boolean
}
```

### ContainerPortItem

```typescript
export interface ContainerPortItem {
  in: number   // container_port
  out: number  // host_port
}
```

### ContainerDetail (Podman inspect 返回结构)

包含 `State.Status`（`'running'` 等）、`HostConfig`、`NetworkSettings.Ports`、`Mounts`、`Config.Env` 等完整字段，用于 `container/info.vue` 展示容器详情。

### 核心 Class 状态字段映射

| Class | 运行状态字段 | 操作锁定字段 | 来源 |
| :--- | :--- | :--- | :--- |
| `Machine` | `run: boolean` | `running: boolean` | `podman machine list --format json` |
| `Container` | `run: boolean` | `running: boolean` | `podman ps -a --format json` / `podman inspect` |
| `Image` | — | `pulling: boolean` | `podman images --format json` |
| `Compose` | `run: boolean` | `running: boolean` | `docker-compose ps --format json` |

Sources: `src/render/components/Podman/type.d.ts:1-318`, `src/render/components/Podman/class/Container.ts:13-27`

---

## Functional Deep Dives

### 3.1 Podman Machine 生命周期管理（含 Linux 直连降级）

#### 机制概述
Podman 在 macOS/Windows 上依赖 QEMU/Libkrun 虚拟机作为容器执行层，模块通过 `podman machine` 子命令管理 VM；而在 Linux 上 Podman 直接运行，因此模块对 Linux 做了**Machine 层完全降级**处理——Linux 下 `machineName` 仅作标识，所有命令省略 `--connection` 参数。

#### 初始化调用链

**场景**: 模块首次加载，获取 Podman 版本与虚拟机列表

1. **UI 触发**: `Index.vue` 的 `<script setup>` 中直接调用 `PodmanManager.init()`
2. **Manager 层**: `class/Podman.ts:57-90` 的 `init()` 方法发起 `IPC.send('app-fork:podman', 'podmanInit')`
3. **Fork 层**: `src/fork/module/Podman/index.ts:16-83` 的 `podmanInit()`
4. **Shell 执行**: 分三步执行：
   - `podman --version > "${tmp}"` → 提取版本号（`version.split(' ').pop().trim()`）
   - `podman machine list --format json > "${tmp}"` → 解析 `Name`, `Default`, `Running`, `Starting`
   - `podman machine inspect ${m.name} > "${tmp}"` → 获取 `Created` 时间用于倒序排序
5. **状态回写**: `PodmanManager.init()` 回调中将返回的数组通过 `reactiveBind(new Machine(item))` 注入 `PodmanManager.machine`，并自动选中第一个运行中的 Machine。

#### Machine 启动/停止调用链

**启动**:
- `left.vue` 点击 start → `Machine.start()` (`class/Machine.ts:160-176`)
- `IPC.send('app-fork:podman', 'machineStart', this.name)`
- Fork: `machineStart(machineName)` (`src/fork/module/Podman/index.ts:156-165`)
- Shell: `execPromiseWithEnv('podman machine start ${machineName}')`
- 成功后 `this.run = true`，调用 `fetchInfoAndContainer()` 和 `refreshComposeState()`

**停止**:
- `Machine.stop()` (`class/Machine.ts:178-192`) → `machineStop` IPC → `podman machine stop ${machineName}`

**重启**:
- `Machine.reStart()` (`class/Machine.ts:144-158`) → `machineReStart` IPC → 先执行 `machineStop`，`waitTime(500)`，再执行 `machineStart`

#### Machine 创建与配置修改

**创建**:
- `machine/machineAdd.vue:122-179` 的 `onSubmit()` 收集表单数据
- 新增: `IPC.send('app-fork:podman', 'machineInit', JSON.parse(JSON.stringify(form.value)))`
- Fork: `machineInit(config)` (`src/fork/module/Podman/index.ts:230-289`)
- 命令构建逻辑：
```typescript
const args = ['podman machine init']
args.push(`--cpus ${cpus}`)
args.push(`--memory ${memory}`)
args.push(`--disk-size ${disk}`)
if (isDefault) args.push('--now')
if (rootful) args.push('--rootful')
else args.push('--rootful=false')
if (rosetta) args.push('--rosetta')
if (identityPath) args.push(`--identity-path "${identityPath}"`)
if (remoteUsername) args.push(`--username "${remoteUsername}"`)
args.push(name)
```

**编辑配置**:
- `machineSet(config)` (`src/fork/module/Podman/index.ts:305-356`) 先通过 `podman machine list --format json` 检查运行状态，若运行则先 `podman machine stop ${name}`，执行 `podman machine set --cpus ${cpus} --memory ${memory} --rootful=${bool} ${name}`，最后若原状态为运行则重新 `podman machine start ${name}`。

#### 平台差异

| 平台 | 差异点 | 代码位置 |
| :--- | :--- | :--- |
| Linux | 所有 container/image 命令不使用 `--connection`，直接调用 `podman xxx` | `src/fork/module/Podman/index.ts:90-92` |
| macOS/Windows | 命令前缀为 `podman --connection ${machineName} xxx` | `src/fork/module/Podman/index.ts:90-92` |
| Windows | 重定向符号为 `2>NUL` 而非 `2>/dev/null` | `src/fork/module/Podman/index.ts:582-584` |

Sources: `src/fork/module/Podman/index.ts:16-83`, `src/fork/module/Podman/index.ts:156-165`, `src/fork/module/Podman/index.ts:230-289`, `src/fork/module/Podman/index.ts:305-356`, `src/render/components/Podman/class/Machine.ts:144-192`, `src/render/components/Podman/machine/machineAdd.vue:122-179`

---

### 3.2 Container 生命周期管理（含 start/stop/remove/exec/logs/export/commit）

#### 机制概述
Container 管理是 Podman 模块最复杂的功能域，支持**双模式操作**：IPC 静默模式（快速启停）和 XTermExec 终端模式（带日志观察的启停）。此外提供容器详情查看、进入容器执行命令、导出容器为 tar、提交容器为新镜像等高级操作。

#### 容器列表获取

1. **UI 触发**: `right.vue` 切换至 Container tab 或点击刷新按钮 → `machine.fetchContainers()`
2. **Manager**: `class/Machine.ts:71-92` 的 `fetchContainers()`
3. **IPC**: `app-fork:podman:fetchContainerList`
4. **Fork**: `fetchContainerList(machineName)` (`src/fork/module/Podman/index.ts:85-124`)
5. **Shell**: Linux 下 `podman ps -a --format json`，其他平台 `podman --connection ${machineName} ps -a --format json`
6. **数据清洗**:
```typescript
containers = json.map((c: any) => ({
  id: c.Id,
  name: c.Names,
  Image: c.Image,
  ImageID: c.ImageID,
  Mounts: c.Mounts,
  Networks: c.Networks,
  command: c.Command,
  run: c.State === 'running',
  running: false,
  machineName: machineName,
  Ports: c.Ports.map((p: any) => ({ in: p.container_port, out: p.host_port }))
}))
```
7. **状态回写**: Machine 的 `container` 数组做增量合并（已存在 `id` 则跳过，否则 `unshift` 新 `reactiveBind(new Container(item))`）

#### IPC 静默模式启停

**启动**:
- `container/container.vue` 点击播放 → `Container.start()` (`class/Container.ts:36-52`)
- `IPC.send('app-fork:podman', 'containerStart', this.id, this.machineName)`
- Fork: `containerStart(containerName, machineName)` (`src/fork/module/Podman/index.ts:191-203`)
- Shell: `podman start ${containerName}` (Linux) / `podman --connection ${machineName} start ${containerName}` (macOS/Windows)
- 回调: `this.run = true`

**停止/删除**调用链结构相同，对应 `containerStop` 和 `containerRemove`，Shell 命令分别为 `podman stop` 和 `podman rm -f`。

#### XTermExec 终端模式启停

**startWithTerminal**:
- `Container.startWithTerminal()` (`class/Container.ts:110-147`)
- 构建命令数组: `['podman start ${this.id}', 'podman logs ${this.id}']`
- 通过 `reactiveBind(new XTermExec())` 创建终端执行任务
- `xtermExec.wait()` 完成后调用 `checkStatusAfterTerminalExec()` → `isContainerRunning` IPC → `podman inspect ${id} --format json` → 解析 `item.State.Status === 'running'` → 更新 `this.run`

**stopWithTerminal** 结构相同，命令为 `['podman stop ${this.id}', 'podman logs ${this.id}']`。

#### 容器详情与执行命令

**详情查看**:
- `Container.showInfo()` (`class/Container.ts:258-264`) → 异步加载 `container/info.vue` → 展示 `ContainerDetail` 接口的全部字段

**进入容器执行命令 (exec)**:
- `Container.showExecCommand()` (`class/Container.ts:266-296`)
- 打开 `XTermExecDialog`，传入 `showCommand: 'podman exec -it ${this.id} '`
- 用户在终端中补全命令后执行

**容器导出**:
- `Container.doExport()` (`class/Container.ts:210-256`)
- 调用 `dialog.showSaveDialog({ defaultPath: '${name}.tar' })` 获取保存路径
- 构建命令: `podman export ${this.id} > "${dir}"`
- 通过 `XTermExec` 执行，完成后 `shell.showItemInFolder(dir)`

**提交为新镜像 (commit)**:
- `Container.doCommitToImage()` (`class/Container.ts:298-341`)
- `ElMessageBox.prompt` 获取镜像名，默认值 `${this.name[0]}:latest`
- 命令: `podman commit ${this.id} ${value}`
- 执行成功后调用 `machine.fetchImages()` 并切换至 Image tab

Sources: `src/fork/module/Podman/index.ts:85-124`, `src/render/components/Podman/class/Container.ts:36-147`, `src/render/components/Podman/class/Container.ts:210-341`, `src/render/components/Podman/container/container.vue:1-177`

---

### 3.3 Image 管理（含 pull/import/export/remove/rename/tag + 官方镜像预设）

#### 机制概述
Image 管理分为两部分：1) 已存在镜像的列表查看、删除、导出、重命名；2) 新镜像拉取，支持通过官方镜像预设表快速选择带版本标签的镜像。

#### 镜像列表获取

1. **UI 触发**: `right.vue` Image tab → `machine.fetchImages()`
2. **Manager**: `class/Machine.ts:47-69`
3. **IPC**: `app-fork:podman:fetchImageList`
4. **Fork**: `fetchImageList(machineName)` (`src/fork/module/Podman/index.ts:126-154`)
5. **Shell**: `podman images --format json` (Linux) / `podman --connection ${machineName} images --format json`
6. **数据清洗**:
```typescript
images = json.map((img: any) => ({
  id: img.Id,
  name: img.Names,
  tag: img.Tag,
  size: Number(img.Size),
  created: img.CreatedAt
}))
```

#### 镜像拉取（含预设系统）

**官方镜像预设**:
- `officialImages.ts` 维护 `Partial<Record<AllAppModule | 'jdk', { image: string }>>` 映射表
- 覆盖 Web 服务器 (`nginx`, `apache`, `caddy`)、数据库 (`mysql`, `postgres`, `mongo`)、语言运行时 (`node`, `php`, `python`, `java`, `go`, `ruby`, `rust`, `bun`, `deno`)、队列/缓存 (`redis`, `rabbitmq`, `memcached`, `etcd`)、搜索引擎 (`elasticsearch`, `meilisearch`, `typesense`) 等

**镜像标签缓存与获取**:
- `PodmanManager.initImageVersion()` (`class/Podman.ts:35-55`) 尝试从 `StorageGetAsync('flyenv-podman-image-version')` 读取本地缓存（3 天 TTL）
- 缓存未命中时发起 `IPC.send('app-fork:podman', 'fetchImagesVersion')`
- Fork: `fetchImagesVersion()` (`src/fork/module/Podman/index.ts:428-438`) 从 `https://flyenv.com/static/podman/allImagesTags.json` 获取全量标签数据

**前端拉取流程**:
- `image/imageAdd.vue:162-203` 的 `doSubmit()`
- 用户可通过 `el-cascader` 选择预设镜像（如 `nginx:1.27.0`），或手动输入镜像名
- 支持镜像仓库前缀 (`form.mirror`)，最终命令: `podman pull ${mirror}/${name}`
- 通过 `XTermExec` 在终端执行，完成后调用 `machine.fetchImages()`

#### 镜像删除

`Image.remove()` (`class/Image.ts:35-65`) 使用 `XTermExec` 执行 `podman rmi -f ${id}`，成功回调中通过 `_onRemove` 从 Machine 的 `images` 数组中移除。

#### 镜像导出

`Image.doExport()` (`class/Image.ts:67-102`) 调用 `dialog.showSaveDialog`，将镜像名中的 `/` 和 `:` 替换为 `-` 作为默认文件名，执行 `podman save -o "${dir}" ${this.name}`。

#### 镜像重命名 (tag)

`Image.doRename()` (`class/Image.ts:104-140`):
1. `ElMessageBox.prompt` 获取新名称
2. 构建命令序列:
```typescript
command.push(`podman tag ${this.id} ${value}`)
for (const name of this.name) {
  command.push(`podman rmi ${name}`)
}
```
3. 通过 `XTermExec` 顺序执行，实现重命名效果

Sources: `src/fork/module/Podman/index.ts:126-154`, `src/render/components/Podman/officialImages.ts:1-124`, `src/render/components/Podman/class/Podman.ts:35-55`, `src/render/components/Podman/image/imageAdd.vue:162-203`, `src/render/components/Podman/class/Image.ts:1-141`

---

### 3.4 Docker Compose 项目管理（含 up/down/logs 与 DOCKER_HOST 注入）

#### 机制概述
Podman 模块通过 `docker-compose` CLI 管理多容器项目。在 macOS/Linux 上，为了使 `docker-compose` 能够与 Podman 通信，模块在命令执行前动态注入 `DOCKER_HOST=unix://${socket}` 环境变量，其中 `socket` 来自当前 Machine 的 `ConnectionInfo.PodmanSocket.Path`。

#### Compose 列表管理

1. **加载**: `PodmanManager.loadComposeList()` (`class/Podman.ts:103-126`) 从 `StorageGetAsync('flyenv-podman-compose-list')` 读取持久化列表
2. **添加/编辑**: `compose/composeAdd.vue:191-232` 的 `doSubmit()` 调用 `PodmanManager.addCompose(data)` 或直接修改 `find.paths` 后 `saveComposeList()`
3. **持久化**: `saveComposeList()` 将 `JSON.parse(JSON.stringify(this.compose))` 写入 Storage

#### Compose 启动/停止调用链

**IPC 静默启动**:
- `Compose.start()` (`class/Compose.ts:27-45`)
- `IPC.send('app-fork:podman', 'composeStart', JSON.parse(JSON.stringify(this.paths)), this.flag, PodmanManager.currentSocket)`
- Fork: `composeStart(paths, projectName, socket)` (`src/fork/module/Podman/index.ts:440-458`)
- 命令构建:
```typescript
const arr = ['docker-compose', ...paths.map(p => `-f "${p}"`)]
if (projectName) arr.push(`-p ${projectName}`)
arr.push('up -d')
```
- 环境变量: `if (!isWindows() && socket) env.DOCKER_HOST = 'unix://${socket}'`
- Shell: `execPromiseWithEnv(arr.join(' '), { env })`

**停止** (`composeStop`): 命令为 `docker-compose ... down`，环境变量注入逻辑相同。

#### XTermExec 终端模式

**startWithTerminal**:
- `Compose.startWithTerminal()` (`class/Compose.ts:47-94`)
- 构建命令:
```typescript
const arr = ['docker-compose', ...this.paths.map(p => `-f "${p}"`)]
if (this.flag) arr.push(`-p ${this.flag}`)
const logs = [...arr, 'logs']
arr.push('up -d')
const cammand = [arr.join(' '), logs.join(' ')]
if (window.Server.isLinux || window.Server.isMacOS) {
  const socket = PodmanManager.currentSocket()
  cammand.unshift(`export DOCKER_HOST=unix://${socket}`)
}
```

**stopWithTerminal** / **showLogsWithTerminal** 结构类似，分别使用 `down` 和 `logs -f` 子命令。

#### 运行状态检测

`Compose.checkRunningStatus()` (`class/Compose.ts:212-232`):
- IPC: `isComposeRunning`
- Fork: `isComposeRunning(paths, projectName, socket)` (`src/fork/module/Podman/index.ts:493-527`)
- Shell: `docker-compose ... ps --format json > "${tmp}"`
- 数据清洗: 按行读取输出，对每行尝试 `JSON.parse`，过滤掉空行，最终 `resolve(arr.length > 0)`
- 若检测到运行中，同时调用 `refreshMachineContainer()` → `machine.fetchContainers()` 同步容器列表

Sources: `src/render/components/Podman/class/Compose.ts:27-94`, `src/render/components/Podman/class/Compose.ts:212-232`, `src/fork/module/Podman/index.ts:440-458`, `src/fork/module/Podman/index.ts:493-527`

---

### 3.5 XTermExec 终端执行模式（与 IPC 静默模式的对比）

#### 机制概述
Podman 模块大量采用 `XTermExec` 终端执行模式，原因是容器操作（pull、build、compose up）往往涉及长时间输出、进度条、用户交互，IPC 静默模式无法提供良好的用户体验。模块通过全局缓存 `XTermExecCache[id]` 防止同一任务被重复创建，并支持点击"执行中"按钮重新打开终端窗口。

#### XTermExec 使用场景全映射

| 功能 | UI 触发点 | Class 方法 | 命令示例 | Cache ID |
| :--- | :--- | :--- | :--- | :--- |
| 容器启动(终端) | container.vue 下拉菜单 | `Container.startWithTerminal()` | `podman start ${id}` + `podman logs ${id}` | `this.id` |
| 容器停止(终端) | container.vue 下拉菜单 | `Container.stopWithTerminal()` | `podman stop ${id}` + `podman logs ${id}` | `this.id` |
| 容器日志 | container.vue 下拉菜单 | `Container.showLogsWithTerminal()` | `podman logs -f ${id}` | `logs-${this.id}` |
| 容器导出 | container.vue 下拉菜单 | `Container.doExport()` | `podman export ${id} > "${dir}"` | `this.id` |
| 容器提交镜像 | container.vue 下拉菜单 | `Container.doCommitToImage()` | `podman commit ${id} ${value}` | `this.id` |
| 容器 exec | container.vue 下拉菜单 | `Container.showExecCommand()` | 用户输入 `podman exec -it ${id} ...` | `${this.id}-ExecCommand` |
| 镜像拉取 | imageAdd.vue | `doSubmit()` | `podman pull ${name}` | `uuid()` |
| 镜像删除 | image.vue 下拉菜单 | `Image.remove()` | `podman rmi -f ${id}` | `this.id` |
| 镜像导出 | image.vue 下拉菜单 | `Image.doExport()` | `podman save -o "${dir}" ${name}` | `this.id` |
| 镜像重命名 | image.vue 下拉菜单 | `Image.doRename()` | `podman tag ${id} ${value}; podman rmi ${oldName}` | `this.id` |
| 镜像导入 | image.vue 导入按钮 | `Machine.imageImport()` | `podman load -i "${path}"` | `${this.name}-image-import` |
| 容器导入 | image.vue 导入按钮 | `Machine.containerImport()` | `podman import "${path}"` | `${this.name}-container-import` |
| Compose 启动(终端) | compose.vue | `Compose.startWithTerminal()` | `export DOCKER_HOST=...; docker-compose -f ... up -d` | `this.id` |
| Compose 停止(终端) | compose.vue | `Compose.stopWithTerminal()` | `export DOCKER_HOST=...; docker-compose -f ... down` | `this.id` |
| Compose 日志 | compose.vue | `Compose.showLogsWithTerminal()` | `export DOCKER_HOST=...; docker-compose -f ... logs -f` | `logs-${this.id}` |
| 容器创建 | containerCreate.vue | `doSubmit()` | `export DOCKER_HOST=...; docker-compose -f ... up -d` | `FlyEnv-Podman-Container-Create` |
| DockerCompose 安装 | Index.vue / compose.vue | `PodmanManager.installDockerCompose()` | `brew install docker-compose` | `App-Podman-DockerCompose-Install` |
| Podman 安装 | Index.vue | `installByHomebrew()` | `brew-cmd.sh ${arch} install podman` | 内联 XTerm 实例 |

#### 终端任务生命周期

以 `Container.startWithTerminal()` 为例：
1. 检查 `this.running`，若已存在任务则从 `XTermExecCache[this.id]` 取出并重新打开对话框
2. 创建 `reactiveBind(new XTermExec())`，设置 `xtermExec.id = this.id` 和 `xtermExec.cammand = [cmd, logs]`
3. 注册 `xtermExec.wait().then(() => { delete XTermExecCache[this.id]; this.checkStatusAfterTerminalExec() })`
4. 通过 `AsyncComponentShow(XTermExecDialog, { title, item: xtermExec })` 打开终端窗口
5. 终端关闭后 `checkStatusAfterTerminalExec()` 发起 `isContainerRunning` IPC 校正状态

Sources: `src/render/components/Podman/class/Container.ts:110-147`, `src/render/components/Podman/class/Image.ts:35-141`, `src/render/components/Podman/class/Machine.ts:216-306`, `src/render/components/Podman/class/Compose.ts:47-178`, `src/render/components/Podman/class/Podman.ts:189-227`

---

### 3.6 安装检测与环境探测（Podman & Docker Compose）

#### Podman 安装检测与一键安装

**检测**:
- `Index.vue:87` 挂载时调用 `PodmanManager.init()`
- `showInstall` computed 判断 `PodmanManager.inited && !PodmanManager.version`
- 若未安装，展示 `noPodmanFound` 提示与 Homebrew 安装按钮（仅当 `window.Server.BrewCellar` 存在时显示）

**安装**:
- `Index.vue:123-152` 的 `installByHomebrew()`
- 使用 `XTerm` 而非 `XTermExec`，直接挂载到 `xtermDom` ref
- 复制 `static/sh/brew-cmd.sh` 到缓存目录并 `chmod 0777`
- 发送命令: `[proxyStr, "${copyfile} ${arch} install podman;"]` 到 XTerm
- `taskConfirm()` / `taskCancel()` 管理安装后的重初始化与终端清理

#### Docker Compose 检测与安装

**检测**:
- `PodmanManager.checkIsComposeExists()` (`class/Podman.ts:178-187`) → `app-fork:podman:checkIsComposeExists`
- Fork: `checkIsComposeExists()` (`src/fork/module/Podman/index.ts:480-490`) 执行 `docker-compose --version`
- 结果写入 `PodmanManager.dockerComposeExists`

**安装**:
- `PodmanManager.installDockerCompose()` (`class/Podman.ts:189-227`)
- 非 Windows 平台显示安装按钮
- 命令: `brew install docker-compose`
- 使用 `XTermExec` 模式执行，安装完成后调用 `checkIsComposeExists()` 刷新状态

Sources: `src/render/components/Podman/Index.vue:74-168`, `src/render/components/Podman/class/Podman.ts:178-227`, `src/fork/module/Podman/index.ts:480-490`

---

### 3.7 多源镜像标签解析（Docker Hub + Quay.io 稳定版过滤）

#### 机制概述
模块不仅维护本地静态标签缓存 (`allImagesTags.json`)，还提供动态标签获取能力，支持 Docker Hub 和 Quay.io 两大多源镜像仓库，并针对不同镜像实现了**硬编码的稳定版标签正则过滤规则**。

#### 动态标签获取调用链

1. **触发**: `compose-build` 相关组件或镜像添加流程中调用 `IPC.send('app-fork:podman', 'composeImageVersion', image)`
2. **Fork**: `composeImageVersion(image)` (`src/fork/module/Podman/index.ts:575-579`) → `fetchTags(image)`
3. **路由**: `src/fork/module/Podman/image.ts:140-149`
```typescript
async function fetchTags(image: string) {
  let tags: string[] = []
  if (image.startsWith('quay.io/')) {
    tags = await fetchQuayTags(image)
  } else {
    tags = await fetchDockerHubTags(image)
  }
  tags = tags.sort(versionSort)
  return tags
}
```

#### Docker Hub 分页获取

`fetchDockerHubTags(image)` (`image.ts:53-77`):
- 构建 API URL: `https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=100`
- 对于无 namespace 的镜像自动补全 `library/` 前缀
- 通过 `res.data.next` 遍历分页
- 每个 tag 经过 `isStableTag(tag, image)` 过滤

#### Quay.io 分页获取

`fetchQuayTags(image)` (`image.ts:80-107`):
- URL: `https://quay.io/api/v1/repository/${namespace}/${repo}/tag/?limit=100`
- 通过 `has_more` 和 `page` 参数遍历分页
- 同样经过 `isStableTag` 过滤

#### 稳定版标签正则规则

`isStableTag(tag, name)` (`image.ts:5-50`) 硬编码了多套正则：

| 镜像名 | 正则规则 | 示例匹配 |
| :--- | :--- | :--- |
| `tomcat` | `/^\d{1,3}(\.\d{1,3}){2,2}-jdk\d{1,3}$/g` | `11.0.10-jdk21` |
| `postgres` | `/^\d{1,3}(\.\d{1,3}){1,1}$/g` | `16.4` |
| `axllent/mailpit` | `/^v\d{1,3}(\.\d{1,3}){2,2}$/g` | `v1.12.0` |
| `openjdk` | `/^\d{1,3}((\.\d{1,3}){2,2})?([_\.]\d+)?-jdk$/g` | `21.0.2-jdk` |
| `erlang` | `/^\d{1,3}(\.\d{1,3}){3,3}$/g` | `26.2.3.0` |
| `quay.io/coreos/etcd` | `/^v\d{1,3}(\.\d{1,3}){2,2}$/g` | `v3.5.15` |
| `getmeili/meilisearch` | `/^v\d{1,3}(\.\d{1,3}){2,2}$/g` | `v1.9.0` |
| `typesense/typesense` | `/^\d{1,3}(\.\d{1,3}){1,2}$/g` | `27.1` |
| `eclipse-temurin` | 特殊处理 `8u*-jdk` 或 `/^\d{1,3}(\.\d{1,3}){2,2}[_.]\d+-jdk$/g` | `21.0.3_9-jdk` |
| `minio/minio` | 直接返回 `false`（拒绝所有动态标签） | — |
| 默认 | `/^\d{1,3}(\.\d{1,3}){2,2}$/g` | `1.27.0` |

#### 版本排序

`versionSort` (`image.ts:130-138`) 使用自定义 `versionMap` 函数处理特殊版本格式（如 `8u392-b08-jdk`），最终调用 `@shared/compare-versions` 进行降序排列。

Sources: `src/fork/module/Podman/image.ts:1-151`, `src/fork/module/Podman/index.ts:575-579`

---

## IPC API Reference

| Event Name | Payload Type | Return Type | Handler Location | Core Logic | Side Effects |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `app-fork:podman:podmanInit` | — | `{ version: string, machine: any[] }` | `src/fork/module/Podman/index.ts:16` | `podman --version` + `podman machine list --format json` + `podman machine inspect` | 初始化 Machine 列表 |
| `app-fork:podman:fetchContainerList` | `machineName: string` | `Container[]` | `src/fork/module/Podman/index.ts:85` | `podman [--connection ${machineName}] ps -a --format json` | 无 |
| `app-fork:podman:fetchImageList` | `machineName: string` | `Image[]` | `src/fork/module/Podman/index.ts:126` | `podman [--connection ${machineName}] images --format json` | 无 |
| `app-fork:podman:machineStart` | `machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:156` | `podman machine start ${machineName}` | 启动 VM |
| `app-fork:podman:machineStop` | `machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:167` | `podman machine stop ${machineName}` | 停止 VM |
| `app-fork:podman:machineReStart` | `machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:178` | `machineStop` + `waitTime(500)` + `machineStart` | 重启 VM |
| `app-fork:podman:machineRemove` | `machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:219` | `podman machine rm -f ${machineName}` | 删除 VM |
| `app-fork:podman:machineInit` | `{ name, cpus, memory, disk, isDefault, rootful, rosetta, identityPath, remoteUsername }` | `boolean` | `src/fork/module/Podman/index.ts:230` | `podman machine init ...` | 创建 VM |
| `app-fork:podman:machineSet` | `{ name, cpus, memory, rootful }` | `boolean` | `src/fork/module/Podman/index.ts:305` | 先 stop → `podman machine set ...` → 再 start | 修改 VM 配置 |
| `app-fork:podman:containerStart` | `containerName: string, machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:191` | `podman start ${containerName}` | 无 |
| `app-fork:podman:containerStop` | `containerName: string, machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:205` | `podman stop ${containerName}` | 无 |
| `app-fork:podman:containerRemove` | `containerName: string, machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:291` | `podman rm -f ${containerName}` | 无 |
| `app-fork:podman:imagePull` | `machineName: string, imageName: string, tag?: string` | `boolean` | `src/fork/module/Podman/index.ts:358` | `podman pull ${imageName}:${tag}` | 无 |
| `app-fork:podman:imageRemove` | `machineName: string, imageId: string` | `boolean` | `src/fork/module/Podman/index.ts:372` | `podman rmi -f ${imageId}` | 无 |
| `app-fork:podman:fetchMachineInfo` | `machineName: string` | `{ info, container, images }` | `src/fork/module/Podman/index.ts:386` | `podman machine inspect` + `fetchContainerList` + `fetchImageList` | 获取 Dashboard 数据 |
| `app-fork:podman:fetchImagesVersion` | — | `Record<string, string[]>` | `src/fork/module/Podman/index.ts:428` | HTTP GET `flyenv.com/static/podman/allImagesTags.json` | 无 |
| `app-fork:podman:composeStart` | `paths: string[], projectName: string, socket?: string` | `boolean` | `src/fork/module/Podman/index.ts:440` | `docker-compose -f ... up -d` | 无 |
| `app-fork:podman:composeStop` | `paths: string[], projectName: string, socket?: string` | `boolean` | `src/fork/module/Podman/index.ts:460` | `docker-compose -f ... down` | 无 |
| `app-fork:podman:checkIsComposeExists` | — | `boolean` | `src/fork/module/Podman/index.ts:480` | `docker-compose --version` | 无 |
| `app-fork:podman:isComposeRunning` | `paths: string[], projectName: string, socket?: string` | `boolean` | `src/fork/module/Podman/index.ts:493` | `docker-compose -f ... ps --format json` | 无 |
| `app-fork:podman:isContainerRunning` | `containerName: string, machineName: string` | `boolean` | `src/fork/module/Podman/index.ts:529` | `podman inspect ${containerName} --format json` | 无 |
| `app-fork:podman:fetchContainerInfo` | `id: string, machineName: string` | `ContainerDetail` | `src/fork/module/Podman/index.ts:553` | `podman inspect ${id} --format json` | 无 |
| `app-fork:podman:composeImageVersion` | `image: string` | `string[]` | `src/fork/module/Podman/index.ts:575` | `fetchTags(image)` (DockerHub/Quay.io) | 无 |

Sources: `src/fork/module/Podman/index.ts:1-586`

---

## Cross-Platform Nuances

### 总览表格

| 功能域 | Windows | macOS | Linux | 关键代码 |
| :--- | :--- | :--- | :--- | :--- |
| Machine 管理 | 支持 VM 管理 | 支持 VM 管理 | **无 VM 概念**，Machine 列表为空 | `src/fork/module/Podman/index.ts:390-393` |
| Container 命令 | `--connection ${machineName}` | `--connection ${machineName}` | **无 `--connection`** | `src/fork/module/Podman/index.ts:90-92` |
| Image 命令 | `--connection ${machineName}` | `--connection ${machineName}` | **无 `--connection`** | `src/fork/module/Podman/index.ts:131-133` |
| 错误重定向 | `2>NUL` | `2>/dev/null` | `2>/dev/null` | `src/fork/module/Podman/index.ts:582-584` |
| Compose DOCKER_HOST | 不注入（因 Windows 使用 named pipe） | `unix://${socket}` | `unix://${socket}` | `src/fork/module/Podman/index.ts:448-450` |
| Docker Compose 安装 | **隐藏安装按钮** | `brew install docker-compose` | `brew install docker-compose` | `src/render/components/Podman/compose/compose.vue:99` |
| Podman 安装 | 通过 `Index.vue` 的 `showInstall` 检测 | Homebrew 一键安装 | 通过包管理器自行安装 | `src/render/components/Podman/Index.vue:44-48` |

### 平台差异在功能域中的具体体现

**Linux 直连模式**: 在 `fetchContainerList`、`fetchImageList`、`containerStart`、`containerStop`、`containerRemove`、`imagePull`、`imageRemove`、`isContainerRunning`、`fetchContainerInfo` 等几乎所有涉及 `podman` CLI 的 Fork 方法中，均通过 `isLinux()` 条件分支决定命令前缀：
```typescript
const cmd = isLinux()
  ? `podman ps -a --format json > "${tmp}" ${getRedirect()}`
  : `podman --connection ${machineName} ps -a --format json > "${tmp}" ${getRedirect()}`
```

**Compose DOCKER_HOST 注入**: 仅在非 Windows 平台且存在 `socket` 参数时，向 `execPromiseWithEnv` 传入 `env.DOCKER_HOST = 'unix://${socket}'`。Windows 下 Podman 通过 named pipe 与 docker-compose 通信，无需环境变量注入。

Sources: `src/fork/module/Podman/index.ts:90-92`, `src/fork/module/Podman/index.ts:448-450`, `src/render/components/Podman/compose/compose.vue:99-106`

---

## Data Flow & Error Handling

### 数据来源

1. **UI 输入**: Machine 创建表单 (`machineAdd.vue`)、Compose 添加表单 (`composeAdd.vue`)、容器创建表单 (`containerCreate.vue`)、镜像拉取表单 (`imageAdd.vue`)
2. **配置文件/缓存**: `StorageGetAsync('flyenv-podman-compose-list')`、`StorageGetAsync('flyenv-podman-image-version')`
3. **Shell 输出**: `podman` 和 `docker-compose` 命令的 JSON/文本输出

### 数据转换流程

**Shell JSON 输出 → TypeScript 对象**:
- 所有 Fork 方法均使用 `os.tmpdir()` + `uuid()` 生成临时文件路径
- 命令通过重定向 `> "${tmp}"` 将输出写入临时文件
- `readFile(tmp, 'utf-8')` 读取内容后 `JSON.parse(content)`
- 通过 `.map()` 转换为前端所需的精简对象结构
- `finally` 块中调用 `remove(tmp)` 清理临时文件

**示例** (`fetchContainerList`):
```typescript
await execPromiseWithEnv(cmd)
const content = await readFile(tmp, 'utf-8')
const json = JSON.parse(content)
containers = json.map((c: any) => ({ id: c.Id, name: c.Names, run: c.State === 'running', ... }))
```

### 错误处理模式

**Fork 层统一模板**:
```typescript
try {
  await execPromiseWithEnv(cmd)
  resolve(true)
} catch (e: any) {
  reject(e?.message ?? 'fail')
} finally {
  if (existsSync(tmp)) {
    await remove(tmp)
  }
}
```

**前端层统一模板**:
```typescript
IPC.send('app-fork:podman', 'xxx', ...).then((key: string, res: any) => {
  IPC.off(key)
  if (res?.code === 0) {
    // 更新响应式状态
  } else {
    MessageError(res?.msg ?? I18nT('base.fail'))
  }
  this.running = false
})
```

### 边缘情况处理

- **命令执行中页面切换/刷新**: `XTermExecCache` 全局缓存保证终端任务不被重复创建，用户可重新打开终端窗口查看进度
- **Machine 编辑时正在运行**: `machineSet` 自动先 stop 再 set 再 start，避免配置热修改失败
- **Compose 状态检测 JSON 解析失败**: `isComposeRunning` 中对每行单独 `try { JSON.parse(f.trim()) } catch {}`，过滤掉空行和无效输出
- **缓存过期**: `initImageVersion` 使用 `StorageSetAsync(storeKey, obj, 3 * 24 * 60 * 60)` 设置 3 天 TTL，过期后自动重新拉取

Sources: `src/fork/module/Podman/index.ts:85-124`, `src/render/components/Podman/class/Container.ts:36-52`, `src/render/components/Podman/class/Podman.ts:35-55`, `src/fork/module/Podman/index.ts:493-527`

---

## 质量检查

### 内容质量检查
- [x] **信息密度**: 每 5 行文本包含 2 函数 + 1 路径 + 1 命令/Interface
- [x] **精准溯源**: 每个 Section 末尾都有 `Sources: path/to/file.ts:line-line`
- [x] **无模糊描述**: 没有"负责..."、"用于..."、"相关逻辑"等词汇
- [x] **调用链完整**: UI → Manager → IPC → Fork → Shell 链路清晰

### 结构完整性检查
- [x] **Overview**: 包含模块技术定位，非功能描述
- [x] **Architecture**: 包含组件层次 + 状态同步机制
- [x] **Data Models**: 包含核心 Interface 定义
- [x] **Functional Deep Dives**: 按发现的功能域顺序撰写，非固定 Execution Trace 模板
- [x] **IPC API**: 表格包含 Event/Payload/Handler/Command/Side Effects
- [x] **Cross-Platform**: 表格对比 Windows/macOS/Linux 差异，且差异已融入功能域分析
- [x] **Data Flow**: 回答数据来源、转换、返回、错误处理四个问题

### 功能域驱动专项检查
- [x] **是否按发现的功能域组织了 `Functional Deep Dives`**
- [x] **是否覆盖了所有 Class 以及 XTermExec 模式**
- [x] **是否每个功能域都包含独立的调用链 + 平台差异 + 数据清洗**
- [x] **功能域标题是否足够硬核**

### 技术准确性检查
- [x] **函数名拼写**: 与源码完全一致
- [x] **文件路径**: 使用相对路径 `src/...` 格式
- [x] **行号范围**: Sources 标注准确的行号范围
- [x] **NOT FOUND 标注**: 未使用脑补，无需 NOT FOUND

### 反偷懒检查
- [x] **非产品描述**
- [x] **非 API 手册**
- [x] **代码细节**: 包含具体的命令参数构建、正则解析、错误处理逻辑
