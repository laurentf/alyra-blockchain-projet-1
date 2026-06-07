<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="onBackdrop"
    >
      <div class="bg-dark-surface border-2 border-neon-blue shadow-pixel-neon max-w-md w-full p-6">
        <header v-if="title" class="flex items-center justify-between mb-4">
          <h3 class="font-pixel text-sm text-neon-blue uppercase">{{ title }}</h3>
          <button
            type="button"
            class="text-gray-400 hover:text-neon-pink"
            aria-label="Close"
            @click="$emit('close')"
          >
            <UiIcon name="close" size="md" />
          </button>
        </header>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import UiIcon from './UiIcon.vue'

interface Props {
  open: boolean
  title?: string
  closeOnBackdrop?: boolean
}

const props = withDefaults(defineProps<Props>(), { closeOnBackdrop: true })

const emit = defineEmits<{ (e: 'close'): void }>()

function onBackdrop() {
  if (props.closeOnBackdrop) emit('close')
}
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
