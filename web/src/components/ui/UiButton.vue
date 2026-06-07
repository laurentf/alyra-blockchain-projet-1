<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="px-4 py-3 font-pixel text-xs border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    :class="[variantClass, sizeClass, blockClass]"
  >
    <span class="inline-flex items-center justify-center gap-2">
      <UiIcon v-if="loading" name="loader" size="sm" class="animate-spin" />
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  block?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false,
  block: false,
})

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-dark-surface text-neon-blue border-neon-blue shadow-pixel-neon hover:bg-neon-blue hover:text-dark-bg'
    case 'secondary':
      return 'bg-dark-surface text-neon-orange border-neon-orange shadow-pixel-orange hover:bg-neon-orange hover:text-dark-bg'
    case 'success':
      return 'bg-dark-surface text-neon-green border-neon-green shadow-pixel-green hover:bg-neon-green hover:text-dark-bg'
    case 'danger':
      return 'bg-dark-surface text-neon-danger border-neon-danger shadow-pixel hover:bg-neon-danger hover:text-dark-bg'
    case 'ghost':
    default:
      return 'bg-transparent text-gray-300 border-dark-accent hover:border-neon-blue hover:text-neon-blue'
  }
})

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-[10px] px-3 py-2'
    case 'lg':
      return 'text-sm px-6 py-4'
    case 'md':
    default:
      return ''
  }
})

const blockClass = computed(() => (props.block ? 'w-full' : ''))
</script>
