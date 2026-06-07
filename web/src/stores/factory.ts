import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { Contract, type ContractRunner } from 'ethers'
import { getFactory, parseError, type ElectionSummary, WorkflowStatus } from '@/lib/contract'
import { getVoting } from '@/lib/contract'
import { isFactoryConfigured } from '@/lib/constants'
import { eqAddress } from '@/lib/format'
import { useWalletStore } from './wallet'

/**
 * Reads the public catalog of elections from the VotingFactory and creates new
 * ones. The catalog is enumerable straight from the array getter + count
 * (`deployedVotingsCount` then `deployedVotings(i)`), so no event log scan is
 * needed here.
 */
export const useFactoryStore = defineStore('factory', () => {
  const wallet = useWalletStore()

  const elections = ref<ElectionSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const myElections = computed(() =>
    elections.value.filter((e) => eqAddress(e.owner, wallet.address)),
  )

  function getRunner(): ContractRunner | null {
    return wallet.signer ?? wallet.provider ?? null
  }

  async function refresh() {
    if (!isFactoryConfigured()) {
      error.value = "L'adresse de la VotingFactory n'est pas configurée (VITE_FACTORY_ADDRESS)."
      return
    }
    const runner = getRunner()
    if (!runner) return

    loading.value = true
    error.value = null
    try {
      const factory = getFactory(runner)
      const count = Number((await factory.deployedVotingsCount()) as bigint)

      const summaries = await Promise.all(
        Array.from({ length: count }, (_, i) => loadSummary(factory, runner, i)),
      )
      // newest first
      elections.value = summaries.filter((s): s is ElectionSummary => s !== null).reverse()
    } catch (err) {
      error.value = parseError(err)
    } finally {
      loading.value = false
    }
  }

  async function loadSummary(
    factory: Contract,
    runner: ContractRunner,
    index: number,
  ): Promise<ElectionSummary | null> {
    try {
      const address = (await factory.deployedVotings(index)) as string
      const voting = getVoting(address, runner)
      const [title, status, owner] = await Promise.all([
        voting.electionTitle() as Promise<string>,
        voting.currentWorkflowStatus() as Promise<bigint>,
        voting.owner() as Promise<string>,
      ])
      return {
        address,
        title,
        status: Number(status) as WorkflowStatus,
        owner,
      }
    } catch (err) {
      console.error(`[factory] failed to load election #${index}`, err)
      return null
    }
  }

  /** Deploys a new election; resolves to the new contract address. */
  async function createVoting(title: string): Promise<{ hash: string; address: string | null }> {
    const runner = getRunner()
    if (!runner || !wallet.signer) throw new Error('wallet not connected')

    const factory = getFactory(wallet.signer)
    const tx = await factory.createVoting(title)
    const receipt = await tx.wait()

    // Extract the new address from the VotingCreated event in the receipt.
    let address: string | null = null
    try {
      for (const log of receipt?.logs ?? []) {
        const parsed = factory.interface.parseLog(log)
        if (parsed?.name === 'VotingCreated') {
          address = parsed.args.votingAddress as string
          break
        }
      }
    } catch {
      // best-effort; the catalog refresh below still surfaces the new election
    }

    await refresh()
    return { hash: tx.hash as string, address }
  }

  return {
    elections,
    myElections,
    loading,
    error,
    refresh,
    createVoting,
  }
})
