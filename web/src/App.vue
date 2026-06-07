<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWalletStore } from '@/stores/wallet'

const walletStore = useWalletStore()
const router = useRouter()

onMounted(async () => {
  await walletStore.initialize()
})

// Bounce to /connect if the wallet disconnects or the chain becomes wrong.
watch(
  () => [walletStore.isConnected, walletStore.isCorrectChain] as const,
  ([connected, ok]) => {
    if (router.currentRoute.value.name === 'connect') return
    if (!connected || !ok) router.push({ name: 'connect' })
  },
)
</script>
