<template>
  <div class="flex flex-col min-h-screen bg-dark-bg">
    <header
      class="bg-dark-surface border-b border-dark-accent px-4 py-3 flex items-center justify-between gap-2 sticky top-0 z-40"
    >
      <RouterLink
        :to="{ name: 'elections' }"
        class="font-pixel text-sm text-neon-blue hover:text-neon-orange transition-colors"
      >
        VOTING
      </RouterLink>
      <div class="flex items-center gap-3">
        <button
          class="font-pixel text-[10px] text-gray-400 hover:text-neon-blue transition-colors"
          @click="toggleLocale"
        >
          {{ locale === 'fr' ? 'EN' : 'FR' }}
        </button>
        <span v-if="wallet.address" class="font-mono text-[10px] text-gray-400 hidden sm:inline">
          {{ shortAddress(wallet.address) }}
        </span>
        <button
          v-if="wallet.address"
          class="font-pixel text-[10px] text-gray-400 hover:text-neon-danger inline-flex items-center gap-1"
          @click="wallet.disconnect"
        >
          <UiIcon name="logout" size="sm" />
          <span class="hidden sm:inline">{{ t('common.disconnect') }}</span>
        </button>
      </div>
    </header>

    <main class="flex-1 max-w-screen-lg mx-auto w-full p-4">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useWalletStore } from '@/stores/wallet'
import { shortAddress } from '@/lib/format'
import UiIcon from '@/components/ui/UiIcon.vue'

const { t, locale } = useI18n()
const wallet = useWalletStore()

function toggleLocale() {
  locale.value = locale.value === 'fr' ? 'en' : 'fr'
  localStorage.setItem('voting-locale', locale.value)
}
</script>
