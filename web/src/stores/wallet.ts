import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from 'ethers'
import { getAppKit, SUPPORTED_NETWORKS } from '@/lib/appkit'
import { CHAIN_ID } from '@/lib/constants'

/**
 * Pinia adapter on top of Reown AppKit.
 *
 * Goes straight through the AppKit instance methods rather than the Vue
 * composables, whose return shape has drifted across AppKit versions; the kit
 * instance's method signatures are far more stable.
 */
type Kit = {
  open: (opts?: { view?: string }) => void
  close: () => void
  disconnect: () => Promise<void>
  getProvider?: (ns: string) => unknown
  getWalletProvider?: () => unknown
  getAddress?: () => string | undefined
  getChainId?: () => number | string | undefined
  getCaipNetworkId?: () => string | undefined
  getIsConnectedState?: () => boolean
  switchNetwork?: (network: unknown) => void
  subscribeAccount?: (
    cb: (state: { address?: string; isConnected?: boolean }) => void,
  ) => (() => void) | undefined
  subscribeNetwork?: (
    cb: (state: { chainId?: number | string; caipNetworkId?: string }) => void,
  ) => (() => void) | undefined
  subscribeProviders?: (cb: () => void) => (() => void) | undefined
}

function parseChainId(raw: unknown): number | null {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const last = raw.includes(':') ? raw.split(':').pop() ?? raw : raw
    const n = parseInt(last, 10)
    return Number.isNaN(n) ? null : n
  }
  return null
}

export const useWalletStore = defineStore('wallet', () => {
  const kit = getAppKit() as unknown as Kit

  // shallowRef so Vue doesn't deep-proxify these — ethers v6 uses #private
  // fields and internal WeakMaps that break under a reactive Proxy receiver.
  const provider = shallowRef<BrowserProvider | null>(null)
  const signer = shallowRef<JsonRpcSigner | null>(null)
  const error = ref<string | null>(null)

  const internalAddress = ref<string | null>(null)
  const internalChainId = ref<number | null>(null)
  const internalConnected = ref(false)

  const address = computed(() => internalAddress.value)
  const chainId = computed(() => internalChainId.value)
  const isConnected = computed(() => internalConnected.value && !!internalAddress.value)
  const isCorrectChain = computed(() => internalChainId.value === CHAIN_ID)

  // Bootstrap from current AppKit state.
  internalAddress.value = kit.getAddress?.() ?? null
  internalChainId.value = parseChainId(kit.getChainId?.() ?? kit.getCaipNetworkId?.())
  internalConnected.value = kit.getIsConnectedState?.() ?? !!internalAddress.value

  const unsubs: Array<(() => void) | undefined> = []

  unsubs.push(
    kit.subscribeAccount?.((state) => {
      internalAddress.value = state.address ?? null
      internalConnected.value = !!state.isConnected
    }),
  )
  unsubs.push(
    kit.subscribeNetwork?.((state) => {
      internalChainId.value = parseChainId(state.chainId ?? state.caipNetworkId)
    }),
  )
  unsubs.push(
    kit.subscribeProviders?.(() => {
      void syncProvider()
    }),
  )

  onScopeDispose(() => {
    for (const u of unsubs) u?.()
    detachProviderListeners()
  })

  function readEip1193(): Eip1193Provider | null {
    const candidate = kit.getProvider?.('eip155') ?? kit.getWalletProvider?.() ?? null
    return (candidate as Eip1193Provider | null) ?? null
  }

  type EvtProvider = Eip1193Provider & {
    on?: (event: string, handler: (...args: unknown[]) => void) => void
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  }
  let currentEvtProvider: EvtProvider | null = null
  let onAccountsChanged: ((...args: unknown[]) => void) | null = null
  let onChainChanged: ((...args: unknown[]) => void) | null = null

  function detachProviderListeners() {
    if (!currentEvtProvider) return
    if (onAccountsChanged) currentEvtProvider.removeListener?.('accountsChanged', onAccountsChanged)
    if (onChainChanged) currentEvtProvider.removeListener?.('chainChanged', onChainChanged)
    currentEvtProvider = null
    onAccountsChanged = null
    onChainChanged = null
  }

  function attachProviderListeners(wp: EvtProvider) {
    if (currentEvtProvider === wp) return
    detachProviderListeners()
    currentEvtProvider = wp

    onAccountsChanged = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? []
      internalAddress.value = accounts[0] ?? null
      internalConnected.value = accounts.length > 0
    }
    onChainChanged = (...args: unknown[]) => {
      internalChainId.value = parseChainId(args[0])
    }

    wp.on?.('accountsChanged', onAccountsChanged)
    wp.on?.('chainChanged', onChainChanged)
  }

  async function syncProvider() {
    if (!internalAddress.value) {
      detachProviderListeners()
      provider.value = null
      signer.value = null
      return
    }
    const wp = readEip1193() as EvtProvider | null
    if (!wp) {
      detachProviderListeners()
      provider.value = null
      signer.value = null
      return
    }
    attachProviderListeners(wp)
    try {
      const bp = new BrowserProvider(wp)
      provider.value = bp
      signer.value = await bp.getSigner()
    } catch (err) {
      console.error('[wallet] failed to derive provider/signer', err)
      provider.value = null
      signer.value = null
    }
  }

  watch(
    () => [internalAddress.value, internalChainId.value] as const,
    () => {
      void syncProvider()
    },
    { immediate: true },
  )

  async function initialize() {
    // AppKit auto-restores the previous session; nothing to do.
  }

  function connect() {
    error.value = null
    kit.open()
  }

  async function disconnect() {
    try {
      await kit.disconnect()
    } catch (err) {
      console.error('[wallet] disconnect failed', err)
    }
  }

  async function switchChain() {
    try {
      const target = SUPPORTED_NETWORKS.find((n) => Number(n.id) === CHAIN_ID)
      if (target && kit.switchNetwork) {
        kit.switchNetwork(target)
      } else {
        kit.open({ view: 'Networks' })
      }
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  return {
    provider,
    signer,
    address,
    chainId,
    error,
    isConnected,
    isCorrectChain,
    initialize,
    connect,
    switchChain,
    disconnect,
  }
})
