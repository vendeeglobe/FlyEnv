<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span>{{ I18nT('hermes.sessions') }}</span>
        <el-button link :disabled="HermesSetup.loading" @click="HermesSetup.refreshSessions()">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': HermesSetup.loading }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <div class="p-5 h-full overflow-hidden flex flex-col">
      <el-input v-model="search" :placeholder="I18nT('hermes.searchSession')" clearable class="mb-3" />
      <el-scrollbar class="flex-1">
        <el-table :data="filteredSessions" stripe style="width: 100%">
          <el-table-column prop="name" :label="I18nT('hermes.sessionName')" />
          <el-table-column width="120">
            <template #default="{ row }">
              <el-button link type="danger" @click="deleteSession(row)">
                {{ I18nT('base.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="filteredSessions.length === 0" :description="I18nT('base.noData')" />
      </el-scrollbar>
    </div>
  </el-card>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue'
  import { I18nT } from '@lang/index'
  import { HermesSetup, SessionItem } from './setup'

  const search = ref('')

  const filteredSessions = computed(() => {
    if (!search.value) return HermesSetup.sessions
    return HermesSetup.sessions.filter((s) =>
      s.name.toLowerCase().includes(search.value.toLowerCase())
    )
  })

  const deleteSession = (row: SessionItem) => {
    HermesSetup.sessions = HermesSetup.sessions.filter((s) => s.name !== row.name)
  }

  onMounted(() => {
    HermesSetup.refreshSessions()
  })
</script>
