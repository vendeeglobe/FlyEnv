import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, remove, existsSync, waitTime } from '../../Fn'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuid } from '../../Fn'
import { appDebugLog, isWindows } from '@shared/utils'
import { PItem, ProcessKill, ProcessListFetch, ProcessPidsByPid } from '@shared/Process'
import { ProcessPidList } from '@shared/Process.win'
import { I18nT } from '@lang/index'

class Hermes extends Base {
  constructor() {
    super()
    this.type = 'hermes'
  }

  private hermesHome() {
    return join(global.Server.BaseDir!, 'hermes')
  }

  private hermesBin() {
    return 'hermes'
  }

  private execWithEnv(cmd: string) {
    const hermesHome = this.hermesHome()
    const envCmd = `HERMES_HOME="${hermesHome}" ${cmd}`
    return execPromiseWithEnv(envCmd)
  }

  checkInstalled() {
    return new ForkPromise(async (resolve) => {
      let version = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await this.execWithEnv(`${this.hermesBin()} --version > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        version = content.trim()
      } catch (e) {
        console.log('hermes --version error: ', e)
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve({
        installed: version.length > 0,
        version
      })
    })
  }

  getGatewayStatus() {
    return new ForkPromise(async (resolve) => {
      let status = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await this.execWithEnv(`${this.hermesBin()} gateway status > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        status = content.trim()
      } catch (e) {
        console.log('hermes gateway status error: ', e)
        status = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }

      appDebugLog('[Hermes][getGatewayStatus]', status).catch()

      const isRunning = status.includes('RPC probe: ok')
      const isInstalled = isRunning || status.includes('gateway') || status.includes('Dashboard')
      const dashboard =
        status
          .split('\n')
          .find((s) => s.includes('Dashboard:'))
          ?.replace('Dashboard:', '')
          ?.trim() ?? ''

      resolve({
        status,
        isInstalled,
        isRunning,
        dashboard
      })
    })
  }

  startGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.execWithEnv(`${this.hermesBin()} gateway start`)
      } catch {}

      try {
        await waitTime(3000)
        let res: any = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        await waitTime(3000)
        res = await this.getGatewayStatus()
        if (res?.isRunning) {
          return resolve(true)
        }
        reject(I18nT('hermes.startGatewayFail'))
      } catch (e: any) {
        reject(e?.message ?? I18nT('hermes.startGatewayFail'))
      }
    })
  }

  stopGateway() {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.execWithEnv(`${this.hermesBin()} gateway stop`)
        let all: PItem[] = []
        if (isWindows()) {
          all = await ProcessPidList()
        } else {
          all = await ProcessListFetch()
        }

        if (!all.length) {
          resolve(true)
          return
        }

        const find = all.find(
          (f) =>
            f?.COMMAND &&
            (f.COMMAND.includes('hermes-gateway') ||
              (f.COMMAND.includes('hermes') && f.COMMAND.includes('gateway')))
        )

        if (find) {
          const arr = ProcessPidsByPid(find.PID, all)
          await ProcessKill('-9', arr)
        }

        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getConfigPath() {
    return new ForkPromise(async (resolve) => {
      const hermesHome = this.hermesHome()
      const config = join(hermesHome, 'config.yaml')
      const env = join(hermesHome, '.env')
      resolve({ config, env })
    })
  }

  listSessions() {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let list: any[] = []
      try {
        await this.execWithEnv(`${this.hermesBin()} sessions list > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        const lines = content.trim().split('\n').filter((l) => l.trim().length > 0)
        list = lines.map((line) => ({ name: line.trim() }))
      } catch (e) {
        console.log('hermes sessions list error: ', e)
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(list)
    })
  }

  listSkills() {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let list: string[] = []
      try {
        await this.execWithEnv(`${this.hermesBin()} skills list > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        list = content.trim().split('\n').filter((l) => l.trim().length > 0)
      } catch (e) {
        console.log('hermes skills list error: ', e)
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(list)
    })
  }

  installSkill(name: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.execWithEnv(`${this.hermesBin()} skills install "${name}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  openDashboard(port = 9119) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.execWithEnv(`${this.hermesBin()} dashboard --port ${port} --no-open`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  runChat(query: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        await this.execWithEnv(`${this.hermesBin()} chat -q "${query}"`)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }

  getLogs(type: string, lines = 100) {
    return new ForkPromise(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      let logs = ''
      try {
        await this.execWithEnv(`${this.hermesBin()} logs ${type} -n ${lines} > "${tmp}" 2>&1`)
        logs = await readFile(tmp, 'utf-8')
      } catch (e) {
        const hermesHome = this.hermesHome()
        const fallback = join(hermesHome, 'logs', `${type}.log`)
        if (existsSync(fallback)) {
          logs = await readFile(fallback, 'utf-8')
        }
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      resolve(logs)
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }

  allInstalledVersions() {
    return new ForkPromise(async (resolve) => {
      resolve([])
    })
  }
}

export default new Hermes()
