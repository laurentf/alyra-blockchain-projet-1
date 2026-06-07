<template>
  <div class="space-y-8">
    <div class="text-center space-y-3">
      <div class="vote-logo inline-flex items-center justify-center w-20 h-20 border-2 border-neon-blue shadow-pixel-neon bg-dark-surface mx-auto">
        <UiIcon name="ballot" size="xl" class="text-neon-blue" />
      </div>
      <h1 class="font-pixel text-xl text-neon-blue">VOTING</h1>
      <p class="font-sans text-gray-400 text-sm">{{ t('connect.tagline') }}</p>
    </div>

    <p class="text-gray-300 text-sm text-center leading-relaxed">
      {{ t('connect.description') }}
    </p>

    <div v-if="FACTORY_ADDRESS" class="text-center">
      <div class="font-pixel text-[8px] text-gray-500 uppercase mb-1">
        {{ t('connect.factory') }}
      </div>
      <a
        :href="addressUrl(FACTORY_ADDRESS)"
        target="_blank"
        rel="noopener noreferrer"
        class="font-mono text-xs text-neon-blue underline hover:no-underline break-all"
      >
        {{ FACTORY_ADDRESS }}
      </a>
    </div>

    <div class="flex flex-col items-center gap-3">
      <UiButton variant="primary" size="lg" @click="wallet.connect">
        {{ t('connect.connectWallet') }}
      </UiButton>

      <UiButton
        v-if="wallet.isConnected && !wallet.isCorrectChain"
        variant="secondary"
        size="md"
        @click="wallet.switchChain"
      >
        {{ t('connect.switchChain') }} ({{ CHAIN_NAME }})
      </UiButton>

      <p v-if="wallet.error" class="text-neon-danger text-xs text-center">
        {{ wallet.error }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWalletStore } from '@/stores/wallet'
import { FACTORY_ADDRESS, CHAIN_NAME, addressUrl } from '@/lib/constants'
import UiButton from '@/components/ui/UiButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

const { t } = useI18n()
const router = useRouter()
const wallet = useWalletStore()

watch(
  () => [wallet.isConnected, wallet.isCorrectChain] as const,
  ([connected, ok]) => {
    if (connected && ok) router.push({ name: 'elections' })
  },
)
</script>

<style scoped>
@keyframes gentle-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
.vote-logo {
  animation: gentle-bounce 2s ease-in-out infinite;
}
</style>
