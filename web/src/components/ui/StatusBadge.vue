<template>
  <span
    class="inline-flex items-center gap-2 border px-2.5 py-1 font-pixel text-[9px] uppercase tracking-wider"
    :class="meta.color"
  >
    <span class="w-2 h-2" :class="meta.dot" />
    {{ t(meta.label) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { WORKFLOW_META, type WorkflowStatus } from '@/lib/contract'

interface Props {
  status: WorkflowStatus
}
const props = defineProps<Props>()
const { t } = useI18n()

const meta = computed(() => WORKFLOW_META[props.status])
</script>
