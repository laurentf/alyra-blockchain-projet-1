import { Contract, type ContractRunner } from 'ethers'
import { FACTORY_ADDRESS } from './constants'

/**
 * Human-readable ABIs, kept in lockstep with contracts/VotingFactory.sol and
 * contracts/VotingPlus.sol. String ABIs avoid shipping JSON artifacts and stay
 * TS-friendly. The custom `error` fragments are included so ethers v6 can
 * decode reverts into named errors (see parseError).
 */
export const FACTORY_ABI = [
  'function createVoting(string _title) returns (address)',
  'function deployedVotings(uint) view returns (address)',
  'function deployedVotingsCount() view returns (uint)',
  'event VotingCreated(address indexed votingAddress, address indexed admin, string title)',
] as const

export const VOTING_ABI = [
  // Reads — scalars
  'function electionTitle() view returns (string)',
  'function currentWorkflowStatus() view returns (uint8)',
  'function owner() view returns (address)',
  'function votesCount() view returns (uint)',
  'function hasWinner() view returns (bool)',
  // Reads — collections
  'function voters(address) view returns (bool isRegistered, bool hasVoted, uint votedProposalId)',
  'function proposals(uint) view returns (string title, string description, uint voteCount, address proposer)',
  'function getWinner() view returns (tuple(string title, string description, uint voteCount, address proposer))',
  // Writes — admin
  'function registerVoter(address _voterAddress)',
  'function closeVoterRegistrationAndStartProposalsRegistration()',
  'function closeProposalsRegistration()',
  'function startVotingSession()',
  'function closeVotingSession()',
  'function tallyVotes()',
  // Writes — voter
  'function addProposal(string _title, string _description)',
  'function vote(uint _proposalId)',
  // Events
  'event VoterRegistered(address voterAddress)',
  'event WorkflowStatusChange(uint8 previousStatus, uint8 newStatus)',
  'event ProposalRegistered(uint proposalId)',
  'event Voted(address voter, uint proposalId)',
  'event TieDetected(uint maxVoteCount, uint tiedProposalsCount)',
  // Custom errors (so ethers decodes reverts by name)
  'error VoterNotRegistered(address account)',
  'error VoterAlreadyRegistered(address account)',
  'error WrongWorkflowStatus(uint8 expected, uint8 current)',
  'error AlreadyVoted(address account)',
  'error InvalidProposalId(uint proposalId)',
  'error NoProposalRegistered()',
  'error NoVoteCast()',
  'error TitleTooShort(uint provided, uint minimum)',
  'error DuplicateProposal()',
  'error OwnershipLocked()',
  'error ElectionTied()',
] as const

export enum WorkflowStatus {
  RegisteringVoters = 0,
  ProposalsRegistrationStarted = 1,
  ProposalsRegistrationEnded = 2,
  VotingSessionStarted = 3,
  VotingSessionEnded = 4,
  VotesTallied = 5,
}

/** Per-status display metadata; `label` is an i18n key under `status.*`. */
export const WORKFLOW_META: Record<
  WorkflowStatus,
  { label: string; color: string; dot: string }
> = {
  [WorkflowStatus.RegisteringVoters]: {
    label: 'status.registeringVoters',
    color: 'text-neon-blue border-neon-blue',
    dot: 'bg-neon-blue',
  },
  [WorkflowStatus.ProposalsRegistrationStarted]: {
    label: 'status.proposalsStarted',
    color: 'text-neon-orange border-neon-orange',
    dot: 'bg-neon-orange',
  },
  [WorkflowStatus.ProposalsRegistrationEnded]: {
    label: 'status.proposalsEnded',
    color: 'text-neon-orange border-neon-orange',
    dot: 'bg-neon-orange',
  },
  [WorkflowStatus.VotingSessionStarted]: {
    label: 'status.votingStarted',
    color: 'text-neon-purple border-neon-purple',
    dot: 'bg-neon-purple',
  },
  [WorkflowStatus.VotingSessionEnded]: {
    label: 'status.votingEnded',
    color: 'text-neon-purple border-neon-purple',
    dot: 'bg-neon-purple',
  },
  [WorkflowStatus.VotesTallied]: {
    label: 'status.tallied',
    color: 'text-neon-green border-neon-green',
    dot: 'bg-neon-green',
  },
}

export interface ProposalView {
  id: number
  title: string
  description: string
  voteCount: bigint
  proposer: string
}

export interface VoterView {
  address: string
  isRegistered: boolean
  hasVoted: boolean
  votedProposalId: bigint
}

export interface WinnerView {
  title: string
  description: string
  voteCount: bigint
  proposer: string
}

/** Lightweight summary used by the elections catalog. */
export interface ElectionSummary {
  address: string
  title: string
  status: WorkflowStatus
  owner: string
}

export function getFactory(runner: ContractRunner): Contract {
  if (!FACTORY_ADDRESS) {
    throw new Error('VITE_FACTORY_ADDRESS is not configured.')
  }
  return new Contract(FACTORY_ADDRESS, FACTORY_ABI, runner)
}

export function getVoting(address: string, runner: ContractRunner): Contract {
  return new Contract(address, VOTING_ABI, runner)
}

/**
 * Turn an ethers error into a short, human-friendly message. ethers v6 decodes
 * custom errors into `err.revert.name` when their fragment is in the ABI; we
 * map the known VotingPlus errors to readable text, and fall back to the
 * shortMessage / reason otherwise. User-rejected signatures are detected too.
 */
const ERROR_MESSAGES: Record<string, string> = {
  VoterNotRegistered: "Cette adresse n'est pas sur la liste blanche.",
  VoterAlreadyRegistered: 'Cette adresse est déjà inscrite.',
  WrongWorkflowStatus: "Action impossible à l'étape actuelle de l'élection.",
  AlreadyVoted: 'Cette adresse a déjà voté.',
  InvalidProposalId: "Cette proposition n'existe pas.",
  NoProposalRegistered: 'Au moins une proposition est requise pour clôturer.',
  NoVoteCast: 'Au moins un vote est requis pour clôturer.',
  TitleTooShort: 'Le titre est trop court (3 caractères minimum).',
  DuplicateProposal: 'Une proposition identique existe déjà.',
  OwnershipLocked: "Le transfert de propriété est désactivé.",
  ElectionTied: 'Élection caduque : égalité, aucun gagnant.',
}

export function parseError(err: unknown): string {
  const e = err as {
    code?: string | number
    revert?: { name?: string } | null
    reason?: string | null
    shortMessage?: string
    info?: { error?: { message?: string } }
    message?: string
  }

  // User rejected the signature in the wallet.
  if (e?.code === 'ACTION_REJECTED' || e?.code === 4001) {
    return 'Transaction refusée dans le wallet.'
  }

  const name = e?.revert?.name
  if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name]
  if (name) return name

  return (
    e?.reason ||
    e?.info?.error?.message ||
    e?.shortMessage ||
    e?.message ||
    'Une erreur est survenue.'
  )
}
