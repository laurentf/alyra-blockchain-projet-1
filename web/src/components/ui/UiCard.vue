<template>
  <section class="bg-dark-surface border-2 border-dark-accent shadow-pixel p-4" :class="$attrs.class">
    <header v-if="title || $slots.header" class="mb-4 flex items-center justify-between gap-2">
      <h2 v-if="title" class="font-pixel text-xs text-neon-blue uppercase tracking-wider">
        {{ title }}
      </h2>
      <slot name="header" />
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
interface Props {
  title?: string
}
defineProps<Props>()
defineOptions({ inheritAttrs: false })
</script>
