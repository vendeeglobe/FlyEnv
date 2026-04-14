<template>
  <div class="module-config">
    <el-card>
      <div class="flex gap-2 mb-3">
        <el-radio-group v-model="logType" size="small">
          <el-radio-button value="agent">agent</el-radio-button>
          <el-radio-button value="gateway">gateway</el-radio-button>
          <el-radio-button value="errors">errors</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="refreshLogs">
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': loading }"
          ></yb-icon>
        </el-button>
      </div>
      <el-input
        v-model="logContent"
        type="textarea"
        :rows="20"
        readonly
        class="font-mono text-xs"
      />
    </el-card>
  </div>
</template>

<script lang="ts" setup>
  import { ref, watch, onMounted } from 'vue'
  import { HermesSetup } from './setup'

  const logType = ref('agent')
  const logContent = ref('')
  const loading = ref(false)

  const refreshLogs = async () => {
    loading.value = true
    const content = await HermesSetup.getLogs(logType.value, 200)
    logContent.value = content
    loading.value = false
  }

  watch(logType, refreshLogs)

  onMounted(() => {
    refreshLogs()
  })
</script>
