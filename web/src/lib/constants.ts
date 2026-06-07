export const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || '11155111')
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Sepolia'
export const CURRENCY_SYMBOL = import.meta.env.VITE_CURRENCY_SYMBOL || 'ETH'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://sepolia.etherscan.io'

export const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16)

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function txUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}

export function isFactoryConfigured(): boolean {
  return !!FACTORY_ADDRESS && FACTORY_ADDRESS !== ZERO_ADDRESS
}
