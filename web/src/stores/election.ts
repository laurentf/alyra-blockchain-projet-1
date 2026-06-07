import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { Contract, type ContractRunner } from 'ethers'
import {
  getVoting,
  parseError,
  WorkflowStatus,
  type ProposalView,
  type VoterView,
  type WinnerView,
} from '@/lib/contract'
import { eqAddress } from '@/lib/format'
import { useWalletStore } from './wallet'

const MAX_PROPOSAL_SCAN = 500

/**
 * Full state and actions for a single VotingPlus election, loaded by address.
 *
 * Enumeration notes:
 * - proposals: scanned by index until the bounds-check revert (no log scan
 *   needed — robust on any RPC).
 * - voters: there is no on-chain array, so the whitelist is rebuilt from
 *   VoterRegistered event logs; if the RPC refuses getLogs we still show the
 *   connected account's own entry.
 */
export const useElectionStore = defineStore('election', () => {
  const wallet = useWalletStore()

  const address = ref<string | null>(null)
  const title = ref('')
  const status = ref<WorkflowStatus>(WorkflowStatus.RegisteringVoters)
  const ownerAddress = ref<string | null>(null)
  const votesCount = ref<bigint>(0n)
  const winnerExists = ref(false)
  const winner = shallowRef<WinnerView | null>(null)

  const proposals = ref<ProposalView[]>([])
  const voters = ref<VoterView[]>([])
  const me = ref<VoterView | null>(null)

  const loading = ref(false)
  const error = ref<string | null>(null)

  const isAdmin = computed(() => eqAddress(ownerAddress.value, wallet.address))
  const isVoter = computed(() => !!me.value?.isRegistered)
  const canPropose = computed(
    () => isVoter.value && status.value === WorkflowStatus.ProposalsRegistrationStarted,
  )
  const canVote = computed(
    () =>
      isVoter.value &&
      status.value === WorkflowStatus.VotingSessionStarted &&
      !me.value?.hasVoted,
  )

  function getRunner(): ContractRunner | null {
    return wallet.signer ?? wallet.provider ?? null
  }

  function read(): Contract | null {
    const runner = getRunner()
    if (!runner || !address.value) return null
    return getVoting(address.value, runner)
  }

  async function load(addr: string) {
    if (address.value !== addr) {
      // reset when switching elections
      title.value = ''
      proposals.value = []
      voters.value = []
      me.value = null
      winner.value = null
    }
    address.value = addr
    await refresh()
  }

  async function refresh() {
    const contract = read()
    if (!contract) return
    loading.value = true
    error.value = null
    try {
      const [t, s, owner, votes, hasWin] = await Promise.all([
        contract.electionTitle() as Promise<string>,
        contract.currentWorkflowStatus() as Promise<bigint>,
        contract.owner() as Promise<string>,
        contract.votesCount() as Promise<bigint>,
        contract.hasWinner() as Promise<boolean>,
      ])
      title.value = t
      status.value = Number(s) as WorkflowStatus
      ownerAddress.value = owner
      votesCount.value = votes
      winnerExists.value = hasWin

      await Promise.all([loadProposals(contract), loadVoters(contract), loadMe(contract)])

      if (status.value === WorkflowStatus.VotesTallied && hasWin) {
        const w = (await contract.getWinner()) as WinnerView
        winner.value = {
          title: w.title,
          description: w.description,
          voteCount: w.voteCount,
          proposer: w.proposer,
        }
      } else {
        winner.value = null
      }
    } catch (err) {
      error.value = parseError(err)
    } finally {
      loading.value = false
    }
  }

  async function loadProposals(contract: Contract) {
    const list: ProposalView[] = []
    for (let i = 0; i < MAX_PROPOSAL_SCAN; i++) {
      try {
        const p = await contract.proposals(i)
        list.push({
          id: i,
          title: p.title as string,
          description: p.description as string,
          voteCount: p.voteCount as bigint,
          proposer: p.proposer as string,
        })
      } catch {
        break // out-of-bounds: no more proposals
      }
    }
    proposals.value = list
  }

  async function loadVoters(contract: Contract) {
    try {
      const events = await contract.queryFilter(contract.filters.VoterRegistered(), 0, 'latest')
      const addresses = [
        ...new Set(
          events
            .map((e) => ('args' in e ? (e.args?.[0] as string) : null))
            .filter((a): a is string => !!a),
        ),
      ]
      voters.value = await Promise.all(
        addresses.map(async (addr) => {
          const v = await contract.voters(addr)
          return {
            address: addr,
            isRegistered: v.isRegistered as boolean,
            hasVoted: v.hasVoted as boolean,
            votedProposalId: v.votedProposalId as bigint,
          }
        }),
      )
    } catch (err) {
      // RPC refused getLogs — degrade gracefully to just the connected voter.
      console.warn('[election] voter log scan failed, showing self only', err)
      voters.value = me.value?.isRegistered ? [me.value] : []
    }
  }

  async function loadMe(contract: Contract) {
    if (!wallet.address) {
      me.value = null
      return
    }
    const v = await contract.voters(wallet.address)
    me.value = {
      address: wallet.address,
      isRegistered: v.isRegistered as boolean,
      hasVoted: v.hasVoted as boolean,
      votedProposalId: v.votedProposalId as bigint,
    }
  }

  /** Runs a write through the signer, refreshes, returns the tx hash. */
  async function send(method: string, args: unknown[] = []): Promise<string> {
    if (!wallet.signer || !address.value) throw new Error('wallet not connected')
    try {
      const contract = getVoting(address.value, wallet.signer)
      const tx = await contract[method](...args)
      await tx.wait()
      await refresh()
      return tx.hash as string
    } catch (err) {
      throw new Error(parseError(err))
    }
  }

  // Admin actions
  const registerVoter = (addr: string) => send('registerVoter', [addr])
  const startProposals = () => send('closeVoterRegistrationAndStartProposalsRegistration')
  const endProposals = () => send('closeProposalsRegistration')
  const startVoting = () => send('startVotingSession')
  const endVoting = () => send('closeVotingSession')
  const tally = () => send('tallyVotes')

  // Voter actions
  const addProposal = (t: string, d: string) => send('addProposal', [t, d])
  const vote = (proposalId: number) => send('vote', [proposalId])

  /** Live updates: refresh on any election event. Returns a teardown fn. */
  function subscribeEvents(): () => void {
    const contract = read()
    if (!contract) return () => {}
    const onAny = () => {
      void refresh()
    }
    contract.on('WorkflowStatusChange', onAny)
    contract.on('VoterRegistered', onAny)
    contract.on('ProposalRegistered', onAny)
    contract.on('Voted', onAny)
    return () => {
      contract.off('WorkflowStatusChange', onAny)
      contract.off('VoterRegistered', onAny)
      contract.off('ProposalRegistered', onAny)
      contract.off('Voted', onAny)
    }
  }

  return {
    // state
    address,
    title,
    status,
    ownerAddress,
    votesCount,
    winnerExists,
    winner,
    proposals,
    voters,
    me,
    loading,
    error,
    // computed
    isAdmin,
    isVoter,
    canPropose,
    canVote,
    // lifecycle
    load,
    refresh,
    subscribeEvents,
    // admin actions
    registerVoter,
    startProposals,
    endProposals,
    startVoting,
    endVoting,
    tally,
    // voter actions
    addProposal,
    vote,
  }
})
