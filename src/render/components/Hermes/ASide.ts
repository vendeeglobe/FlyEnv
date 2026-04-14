import { computed } from 'vue'
import Router from '@/router/index'
import { AppStore } from '@/store/app'
import { HermesSetup } from '@/components/Hermes/setup'

export const AsideSetup = () => {
  HermesSetup.init()
  const appStore = AppStore()

  const currentPage = computed(() => {
    return appStore.currentPage
  })

  const flag = 'hermes'

  const nav = () => {
    return new Promise((resolve, reject) => {
      const path = `/${flag}`
      if (appStore.currentPage === path) {
        reject(new Error('Path Not Change'))
        return
      }
      Router.push({
        path
      })
        .then()
        .catch()
      appStore.currentPage = path
      resolve(true)
    })
  }

  const serviceDisabled = computed(() => {
    const a = !HermesSetup.installed
    const b = HermesSetup.loading
    const c = !appStore.versionInitiated
    return a || b || c
  })

  const serviceRunning = computed({
    get(): boolean {
      return HermesSetup.gatewayRunning
    },
    set(v: boolean) {
      if (v) {
        HermesSetup.startGateway()
      } else {
        HermesSetup.stopGateway()
      }
    }
  })

  const serviceFetching = computed(() => {
    return HermesSetup.loading
  })

  const showItem = computed(() => {
    return appStore.config.setup.common.showItem?.[flag] !== false
  })

  const groupDo = (isRunning: boolean): Array<Promise<string | boolean>> => {
    const all: Array<Promise<string | boolean>> = []
    if (isRunning) {
      if (showItem?.value) {
        if (HermesSetup.gatewayRunning) {
          all.push(HermesSetup.stopGateway())
        }
      }
    } else {
      if (showItem?.value) {
        if (!HermesSetup.gatewayRunning) {
          all.push(HermesSetup.startGateway())
        }
      }
    }
    return all
  }

  const switchChange = () => {
    serviceRunning.value = !serviceRunning.value
  }

  const stopNav = () => {}

  return {
    nav,
    serviceDisabled,
    serviceRunning,
    serviceFetching,
    groupDo,
    switchChange,
    showItem,
    currentPage,
    stopNav
  }
}
