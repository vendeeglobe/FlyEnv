<template>
  <Conf
    ref="conf"
    :type-flag="'hermes'"
    :show-load-default="false"
    :file="file"
    :file-ext="'yaml'"
    :config-language="'yaml'"
    :show-commond="true"
  >
    <template #common>
      <div class="p-4">
        <el-form label-position="top">
          <el-form-item :label="'.env ' + I18nT('base.configFile')">
            <div class="flex items-center gap-2">
              <el-input v-model="envFile" readonly class="flex-1" />
              <el-button @click="openEnv">
                <FolderOpened class="w-4 h-4" />
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </template>
  </Conf>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import Conf from '@/components/Conf/index.vue'
  import { HermesSetup } from '@/components/Hermes/setup'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { shell } from '@/util/NodeFn'
  import { I18nT } from '@lang/index'

  const conf = ref()

  const file = computed(() => {
    return HermesSetup.configFile
  })

  const envFile = computed(() => {
    return HermesSetup.envFile
  })

  const openEnv = () => {
    if (HermesSetup.envFile) {
      shell.showItemInFolder(HermesSetup.envFile)
    }
  }
</script>
