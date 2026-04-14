<template>
  <div class="soft-index-panel main-right-panel">
    <el-radio-group v-model="tab" class="mt-3">
      <template v-for="(item, _index) in tabs" :key="_index">
        <el-radio-button :label="item" :value="_index"></el-radio-button>
      </template>
    </el-radio-group>
    <div class="main-block">
      <ServiceList v-if="tab === 0"></ServiceList>
      <ConfigVM v-else-if="tab === 1"></ConfigVM>
      <ProvidersVM v-else-if="tab === 2"></ProvidersVM>
      <SkillsVM v-else-if="tab === 3"></SkillsVM>
      <SessionsVM v-else-if="tab === 4"></SessionsVM>
      <LogsVM v-else-if="tab === 5"></LogsVM>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import ServiceList from './Service.vue'
  import ConfigVM from './Config.vue'
  import ProvidersVM from './Providers.vue'
  import SkillsVM from './Skills.vue'
  import SessionsVM from './Sessions.vue'
  import LogsVM from './Logs.vue'
  import { AppModuleSetup } from '@/core/Module'
  import { I18nT } from '@lang/index'

  const { tab } = AppModuleSetup('hermes')
  const tabs = [
    I18nT('base.service'),
    I18nT('base.configFile'),
    I18nT('hermes.providers'),
    I18nT('hermes.skills'),
    I18nT('hermes.sessions'),
    I18nT('base.log')
  ]
</script>
