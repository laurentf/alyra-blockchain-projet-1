import { createAppKit } from '@reown/appkit/vue'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { sepolia, holesky, mainnet, type AppKitNetwork } from '@reown/appkit/networks'
import { CHAIN_ID } from './constants'

/**
 * Initialize Reown AppKit once at boot. Exposes the universal wallet modal
 * (browser extensions via EIP-6963 + mobile wallets via WalletConnect QR).
 *
 * Wired for Sepolia / Holesky / mainnet — the active chain is picked from
 * VITE_CHAIN_ID. To add a chain, import it from '@reown/appkit/networks' and
 * append it to `networks` below.
 */
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID

export const SUPPORTED_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, holesky, mainnet]

const defaultNetwork =
  SUPPORTED_NETWORKS.find((n) => Number(n.id) === CHAIN_ID) ?? sepolia

let kit: ReturnType<typeof createAppKit> | undefined

export function getAppKit(): ReturnType<typeof createAppKit> {
  if (!kit) throw new Error('AppKit has not been initialized yet')
  return kit
}

export function initAppKit() {
  if (kit) return kit

  if (!projectId) {
    console.warn(
      '[voting] VITE_REOWN_PROJECT_ID is missing — the wallet modal will not open. ' +
        'Grab a free Project ID at https://cloud.reown.com and set it in .env.',
    )
  }

  kit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: SUPPORTED_NETWORKS,
    defaultNetwork,
    projectId: projectId || 'missing-project-id',
    metadata: {
      name: 'Voting dApp',
      description: 'Whitelist-based on-chain voting',
      url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:1338',
      icons: ['/favicon.svg'],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#00d4ff',
      '--w3m-color-mix': '#0a0a0f',
      '--w3m-color-mix-strength': 40,
      '--w3m-border-radius-master': '2px',
      '--w3m-font-family': 'Inter, system-ui, sans-serif',
    },
  })

  return kit
}
