import IPC from '@/util/IPC'
import { reactiveBind, waitTime } from '@/util/Index'
import { shell } from '@/util/NodeFn'
import { markRaw, nextTick, Ref } from 'vue'
import XTerm from '@/util/XTerm'
import { MessageError, MessageSuccess } from '@/util/Element'
import { I18nT } from '@lang/index'

export interface ProviderItem {
  name: string
  baseUrl: string
}

export interface SessionItem {
  name: string
}

class Hermes {
  xterm: XTerm | undefined
  installing = false
  installEnd = false
  installed: boolean = false
  version: string = ''
  gatewayRunning: boolean = false
  loading: boolean = true
  gatewayStatus: string = ''
  dashboard = ''
  configFile = ''
  envFile = ''
  skills: string[] = []
  sessions: SessionItem[] = []
  providers: ProviderItem[] = [
    { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
    { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'Anthropic', baseUrl: 'https://api.anthropic.com' }
  ]
  currentProvider = ''
  chatQuery = ''

  constructor() {}

  private checkInstalled() {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'checkInstalled').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.installed = res?.data?.installed ?? false
          this.version = res?.data?.version ?? ''
        }
        resolve(true)
      })
    })
  }

  private getGatewayStatus() {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getGatewayStatus').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayRunning = res?.data?.isRunning ?? false
          this.dashboard = res?.data?.dashboard ?? ''
        }
        resolve(true)
      })
    })
  }

  private getConfigPath() {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getConfigPath').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.configFile = res?.data?.config ?? ''
          this.envFile = res?.data?.env ?? ''
        }
        resolve(true)
      })
    })
  }

  init() {
    this.loading = true
    Promise.all([this.checkInstalled(), this.getGatewayStatus(), this.getConfigPath()]).then(() => {
      this.loading = false
    })
  }

  startGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:hermes', 'startGateway').then((key: string, res: any) => {
        IPC.off(key)
        if (res?.code === 0) {
          this.gatewayRunning = true
          MessageSuccess(I18nT('hermes.gatewayRunning'))
        } else {
          this.gatewayRunning = false
          MessageError(res?.msg ?? I18nT('hermes.startGatewayFail'))
        }
        this.loading = false
        resolve(true)
      })
    })
  }

  stopGateway(): Promise<boolean> {
    return new Promise((resolve) => {
      this.loading = true
      IPC.send('app-fork:hermes', 'stopGateway').then((key: string) => {
        IPC.off(key)
        this.gatewayRunning = false
        this.loading = false
        resolve(true)
      })
    })
  }

  openURL(flag: 'home' | 'dashboard') {
    if (flag === 'home') {
      shell.openExternal('https://hermes-agent.nousresearch.com/').catch()
      return
    }
    if (this.dashboard) {
      shell.openExternal(this.dashboard).catch()
    }
  }

  async openDashboard() {
    this.loading = true
    IPC.send('app-fork:hermes', 'openDashboard', 9119).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        waitTime(1500).then(() => {
          shell.openExternal('http://localhost:9119').catch()
        })
      } else {
        MessageError(res?.msg ?? I18nT('hermes.startDashboardFail'))
      }
    })
  }

  async installHermes(domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command: string[] = []
    if (window.Server.Proxy) {
      for (const k in window.Server.Proxy) {
        const v = window.Server.Proxy[k]
        command.push(`export ${k}="${v}"`)
      }
    }
    command.push('curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash')
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  async openChat(domRef: Ref<HTMLElement>) {
    if (this.installing) {
      return
    }
    this.installEnd = false
    this.installing = true
    await nextTick()

    const execXTerm = new XTerm()
    this.xterm = markRaw(execXTerm)
    await execXTerm.mount(domRef.value)
    const command = ['hermes chat']
    await execXTerm.send(command, false)
    this.installEnd = true
  }

  refreshSkills() {
    IPC.send('app-fork:hermes', 'listSkills').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.skills = res?.data ?? []
      }
    })
  }

  installSkill(name: string) {
    this.loading = true
    IPC.send('app-fork:hermes', 'installSkill', name).then((key: string, res: any) => {
      IPC.off(key)
      this.loading = false
      if (res?.code === 0) {
        MessageSuccess(I18nT('hermes.skillInstallSuccess'))
        this.refreshSkills()
      } else {
        MessageError(res?.msg ?? I18nT('hermes.skillInstallFail'))
      }
    })
  }

  refreshSessions() {
    IPC.send('app-fork:hermes', 'listSessions').then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        this.sessions = res?.data ?? []
      }
    })
  }

  getLogs(type: string, lines = 100): Promise<string> {
    return new Promise((resolve) => {
      IPC.send('app-fork:hermes', 'getLogs', type, lines).then((key: string, res: any) => {
        IPC.off(key)
        resolve(res?.data ?? '')
      })
    })
  }

  taskConfirm() {
    this.installing = false
    this.installEnd = false
    this.xterm?.destroy()
    delete this.xterm
    this.init()
  }

  taskCancel() {
    this.installing = false
    this.installEnd = false
    this.xterm?.stop()?.then(() => {
      this.xterm?.destroy()
      delete this.xterm
    })
  }
}

export const HermesSetup = reactiveBind(new Hermes())
