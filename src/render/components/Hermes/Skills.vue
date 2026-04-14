<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('hermes.skills') }}</span>
        <el-button link :disabled="HermesSetup.loading" @click="HermesSetup.refreshSkills()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': HermesSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="p-5 h-full overflow-hidden flex flex-col">
      <el-form inline @submit.prevent>
        <el-form-item>
          <el-input v-model="search" :placeholder="I18nT('hermes.searchSkill')" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="installSkill">{{ I18nT('base.install') }}</el-button>
        </el-form-item>
      </el-form>
      <el-scrollbar class="flex-1">
        <div class="flex flex-wrap gap-2">
          <el-tag v-for="skill in filteredSkills" :key="skill" type="info" effect="plain">
            {{ skill }}
          </el-tag>
          <el-empty v-if="filteredSkills.length === 0" :description="I18nT('base.noData')" />
        </div>
      </el-scrollbar>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup } from './setup'

  const search = ref('')

  const filteredSkills = computed(() => {
    if (!search.value) return HermesSetup.skills
    return HermesSetup.skills.filter((s) => s.toLowerCase().includes(search.value.toLowerCase()))
  })

  const installSkill = () => {
    if (!search.value) return
    HermesSetup.installSkill(search.value)
  }

  onMounted(() => {
    HermesSetup.refreshSkills()
  })
</script>
