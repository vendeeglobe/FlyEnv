<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span>Hermes-Agent</span>
          <el-tooltip :content="I18nT('hermes.HermesOfficialWebsite')" :show-after="600">
            <el-button link @click.stop="HermesSetup.openURL('home')">
              <yb-icon
                style="width: 20px; height: 20px; margin-left: 10px"
                :svg="import('@/svg/http.svg?raw')"
              ></yb-icon>
            </el-button>
          </el-tooltip>
          <template v-if="HermesSetup.gatewayRunning && HermesSetup.dashboard">
            <el-tooltip :content="I18nT('hermes.HermesLocalDashboard')" :show-after="600">
              <el-button
                style="color: #01cc74"
                class="button"
                link
                @click.stop="HermesSetup.openURL('dashboard')"
              >
                <yb-icon
                  style="width: 20px; height: 20px; margin-left: 10px"
                  :svg="import('@/svg/http.svg?raw')"
                ></yb-icon>
              </el-button>
            </el-tooltip>
          </template>
        </div>
        <el-button
          class="button"
          :disabled="HermesSetup.loading || HermesSetup.installing"
          link
          @click="HermesSetup.init()"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': HermesSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden">
      <template v-if="HermesSetup.installing">
        <div class="w-full h-full overflow-hidden p-5">
          <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
        </div>
      </template>
      <template v-else-if="!HermesSetup.loading && !HermesSetup.installed">
        <div class="p-5">
          <pre class="app-html-block" v-html="I18nT('hermes.notInstalled')"></pre>
          <el-button
            type="primary"
            class="mt-5"
            :disabled="HermesSetup.installing"
            @click.stop="installHermes"
            >{{ I18nT('base.install') }}</el-button
          >
        </div>
      </template>
      <template v-else-if="HermesSetup.installed">
        <div class="p-5 h-full overflow-hidden">
          <el-form
            class="h-full overflow-hidden flex flex-col"
            label-position="top"
            @submit.prevent
          >
            <el-form-item class="flex-shrink-0" :label="'Hermes ' + I18nT('base.version')">
              <span>{{ HermesSetup.version }}</span>
            </el-form-item>
            <el-form-item class="flex-shrink-0" :label="I18nT('hermes.gatewayStatus')">
              <template v-if="HermesSetup.gatewayRunning">
                <span class="text-[#01cc74]">{{ I18nT('hermes.gatewayRunning') }}</span>
              </template>
              <template v-else>
                <span>{{ I18nT('hermes.gatewayStopped') }}</span>
              </template>
            </el-form-item>
            <el-form-item class="flex-shrink-0">
              <template v-if="HermesSetup.loading">
                <el-button link loading disabled></el-button>
              </template>
              <template v-else-if="HermesSetup.gatewayRunning">
                <el-button
                  link
                  :disabled="HermesSetup.loading"
                  @click.stop="HermesSetup.stopGateway()"
                >
                  <yb-icon
                    class="w-[20px] h-[20px] text-[#cc5441]"
                    :svg="import('@/svg/stop2.svg?raw')"
                  />
                </el-button>
              </template>
              <template v-else>
                <el-button
                  link
                  :disabled="HermesSetup.loading"
                  @click.stop="HermesSetup.startGateway()"
                >
                  <yb-icon
                    class="w-[20px] h-[20px] hover:text-yellow-500"
                    :svg="import('@/svg/play.svg?raw')"
                  />
                </el-button>
              </template>
            </el-form-item>
            <el-form-item class="flex-shrink-0" :label="I18nT('host.action')">
              <div class="flex gap-2">
                <el-button :disabled="HermesSetup.loading" @click.stop="HermesSetup.openDashboard()">
                  {{ I18nT('hermes.openDashboard') }}
                </el-button>
                <el-button :disabled="HermesSetup.loading" @click.stop="openChat">
                  {{ I18nT('hermes.openChat') }}
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </div>
      </template>
      <template v-else-if="HermesSetup.loading">
        <div v-loading class="w-full h-full"></div>
      </template>
    </div>
    <template v-if="HermesSetup.installing" #footer>
      <template v-if="HermesSetup.installEnd">
        <el-button type="primary" @click.stop="HermesSetup.taskConfirm()">{{
          I18nT('base.confirm')
        }}</el-button>
      </template>
      <template v-else>
        <el-button @click.stop="HermesSetup.taskCancel()">{{ I18nT('base.cancel') }}</el-button>
      </template>
    </template>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'
  import { nextTick, onMounted, onUnmounted } from 'vue'
  import XTerm from '@/util/XTerm'

  const xtermDom = ref()

  const installHermes = () => {
    HermesSetup.installHermes(xtermDom)
  }

  const openChat = () => {
    HermesSetup.openChat(xtermDom)
  }

  onMounted(() => {
    if (HermesSetup.installing) {
      nextTick().then(() => {
        const execXTerm: XTerm = HermesSetup.xterm as any
        if (execXTerm && xtermDom.value) {
          execXTerm.mount(xtermDom.value).then().catch()
        }
      })
    }
  })

  onUnmounted(() => {
    HermesSetup?.xterm?.unmounted?.()
  })
</script>
