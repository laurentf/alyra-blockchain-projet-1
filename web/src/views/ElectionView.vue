<template>
  <div class="space-y-5">
    <RouterLink
      :to="{ name: 'elections' }"
      class="inline-flex items-center gap-1 font-pixel text-[9px] text-gray-400 hover:text-neon-blue uppercase"
    >
      <UiIcon name="chevronLeft" size="sm" /> {{ t('election.back') }}
    </RouterLink>

    <!-- Header -->
    <div class="bg-dark-surface border-2 border-dark-accent shadow-pixel p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <h1 class="font-sans text-xl font-bold text-white break-words">{{ election.title || '…' }}</h1>
        <StatusBadge :status="election.status" />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-gray-500">
        <a
          :href="addressUrl(address)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-neon-blue underline hover:no-underline inline-flex items-center gap-1"
        >
          {{ shortAddress(address) }} <UiIcon name="external" size="xs" />
        </a>
        <span>{{ t('elections.admin') }}: {{ shortAddress(election.ownerAddress) }}</span>
      </div>
      <!-- Role banner -->
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <span v-if="election.isAdmin" class="role-tag text-neon-orange border-neon-orange">
          <UiIcon name="lock" size="xs" /> {{ t('election.roleAdmin') }}
        </span>
        <span v-if="election.isVoter" class="role-tag text-neon-green border-neon-green">
          <UiIcon name="check" size="xs" /> {{ t('election.roleVoter') }}
        </span>
        <span
          v-if="!election.isAdmin && !election.isVoter"
          class="role-tag text-gray-400 border-dark-accent"
        >
          <UiIcon name="users" size="xs" /> {{ t('election.roleSpectator') }}
        </span>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-dark-surface border-2 border-dark-accent p-3 text-center">
        <div class="font-pixel text-lg text-neon-blue">{{ election.proposals.length }}</div>
        <div class="font-pixel text-[8px] text-gray-500 uppercase mt-1">{{ t('election.proposals') }}</div>
      </div>
      <div class="bg-dark-surface border-2 border-dark-accent p-3 text-center">
        <div class="font-pixel text-lg text-neon-green">{{ election.voters.length }}</div>
        <div class="font-pixel text-[8px] text-gray-500 uppercase mt-1">{{ t('election.voters') }}</div>
      </div>
      <div class="bg-dark-surface border-2 border-dark-accent p-3 text-center">
        <div class="font-pixel text-lg text-neon-purple">{{ election.votesCount.toString() }}</div>
        <div class="font-pixel text-[8px] text-gray-500 uppercase mt-1">{{ t('election.votesCast') }}</div>
      </div>
    </div>

    <p v-if="actionError" class="text-neon-danger text-xs bg-dark-surface border-2 border-neon-danger p-3">
      {{ actionError }}
    </p>

    <!-- Result (tallied) -->
    <UiCard v-if="election.status === WS.VotesTallied" :title="t('election.result')">
      <div v-if="election.winnerExists && election.winner" class="space-y-2">
        <div class="flex items-center gap-2 text-neon-yellow">
          <UiIcon name="trophy" size="md" />
          <span class="font-pixel text-xs uppercase">{{ t('election.winner') }}</span>
        </div>
        <h3 class="font-sans text-lg font-bold text-white">{{ election.winner.title }}</h3>
        <p v-if="election.winner.description" class="text-gray-300 text-sm">
          {{ election.winner.description }}
        </p>
        <p class="font-pixel text-[10px] text-neon-green">
          {{ election.winner.voteCount.toString() }} {{ t('election.votes') }}
        </p>
      </div>
      <div v-else class="flex items-center gap-3 text-neon-danger">
        <UiIcon name="ban" size="lg" />
        <div>
          <p class="font-pixel text-xs uppercase">{{ t('election.tie') }}</p>
          <p class="text-gray-400 text-sm mt-1">{{ t('election.tieBody') }}</p>
        </div>
      </div>
    </UiCard>

    <!-- Admin panel -->
    <UiCard v-if="election.isAdmin && election.status !== WS.VotesTallied" :title="t('election.adminPanel')">
      <div class="space-y-4">
        <!-- Register voters -->
        <form
          v-if="election.status === WS.RegisteringVoters"
          class="space-y-2"
          @submit.prevent="onRegister"
        >
          <label class="font-pixel text-[9px] text-gray-400 uppercase block">
            {{ t('election.registerVoter') }}
          </label>
          <div class="flex gap-2">
            <input
              v-model="voterAddress"
              type="text"
              placeholder="0x…"
              class="flex-1 bg-dark-bg border-2 border-dark-accent focus:border-neon-blue outline-none px-3 py-2 text-white text-sm font-mono"
            />
            <UiButton
              variant="success"
              size="sm"
              type="submit"
              :loading="busy === 'register'"
              :disabled="!isAddress(voterAddress)"
            >
              {{ t('common.add') }}
            </UiButton>
          </div>
        </form>

        <!-- Phase transition -->
        <div v-if="nextStep" class="pt-1">
          <p class="text-gray-400 text-xs mb-2">{{ t(nextStep.hint) }}</p>
          <UiButton
            variant="primary"
            size="md"
            block
            :loading="busy === 'transition'"
            @click="onTransition"
          >
            {{ t(nextStep.label) }}
          </UiButton>
        </div>
      </div>
    </UiCard>

    <!-- Voter: add proposal -->
    <UiCard v-if="election.canPropose" :title="t('election.addProposal')">
      <form class="space-y-3" @submit.prevent="onAddProposal">
        <input
          v-model="proposalTitle"
          type="text"
          :placeholder="t('election.proposalTitle')"
          class="w-full bg-dark-bg border-2 border-dark-accent focus:border-neon-blue outline-none px-3 py-2 text-white text-sm font-sans"
          maxlength="80"
        />
        <textarea
          v-model="proposalDescription"
          :placeholder="t('election.proposalDescription')"
          rows="2"
          class="w-full bg-dark-bg border-2 border-dark-accent focus:border-neon-blue outline-none px-3 py-2 text-white text-sm font-sans resize-none"
          maxlength="280"
        />
        <UiButton
          variant="success"
          size="sm"
          type="submit"
          :loading="busy === 'propose'"
          :disabled="proposalTitle.trim().length < 3"
        >
          <UiIcon name="plus" size="sm" /> {{ t('election.submitProposal') }}
        </UiButton>
      </form>
    </UiCard>

    <!-- My vote info -->
    <p
      v-if="election.isVoter && election.me?.hasVoted"
      class="text-neon-green text-xs bg-dark-surface border-2 border-neon-green p-3 inline-flex items-center gap-2"
    >
      <UiIcon name="check" size="sm" />
      {{ t('election.youVotedFor') }} «&nbsp;{{ votedTitle }}&nbsp;»
    </p>

    <!-- Proposals -->
    <UiCard :title="t('election.proposals')">
      <p v-if="!election.proposals.length" class="text-gray-500 text-sm text-center py-4">
        {{ t('election.noProposals') }}
      </p>
      <ul v-else class="space-y-2">
        <li
          v-for="p in election.proposals"
          :key="p.id"
          class="border-2 p-3 flex items-start justify-between gap-3"
          :class="
            isWinner(p)
              ? 'border-neon-yellow bg-neon-yellow/5'
              : 'border-dark-accent'
          "
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-pixel text-[9px] text-gray-500">#{{ p.id }}</span>
              <h3 class="font-sans font-semibold text-white break-words">{{ p.title }}</h3>
              <UiIcon v-if="isWinner(p)" name="trophy" size="sm" class="text-neon-yellow shrink-0" />
            </div>
            <p v-if="p.description" class="text-gray-400 text-xs mt-1 break-words">{{ p.description }}</p>
            <p class="font-mono text-[10px] text-gray-600 mt-1">
              {{ t('election.by') }} {{ shortAddress(p.proposer) }}
            </p>
          </div>
          <div class="text-right shrink-0 flex flex-col items-end gap-2">
            <span class="font-pixel text-sm text-neon-purple">{{ p.voteCount.toString() }}</span>
            <UiButton
              v-if="election.canVote"
              variant="primary"
              size="sm"
              :loading="busy === `vote-${p.id}`"
              @click="onVote(p.id)"
            >
              {{ t('election.vote') }}
            </UiButton>
          </div>
        </li>
      </ul>
    </UiCard>

    <!-- Voters -->
    <UiCard :title="t('election.voters')">
      <p v-if="!election.voters.length" class="text-gray-500 text-sm text-center py-4">
        {{ t('election.noVoters') }}
      </p>
      <ul v-else class="space-y-1">
        <li
          v-for="v in election.voters"
          :key="v.address"
          class="flex items-center justify-between gap-2 py-1.5 border-b border-dark-accent last:border-0"
        >
          <span class="font-mono text-xs text-gray-300">{{ shortAddress(v.address) }}</span>
          <span
            class="font-pixel text-[8px] uppercase inline-flex items-center gap-1"
            :class="v.hasVoted ? 'text-neon-green' : 'text-gray-600'"
          >
            <UiIcon :name="v.hasVoted ? 'check' : 'users'" size="xs" />
            {{ v.hasVoted ? t('election.voted') : t('election.notVoted') }}
          </span>
        </li>
      </ul>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { isAddress } from 'ethers'
import { useElectionStore } from '@/stores/election'
import { WorkflowStatus as WS, type ProposalView } from '@/lib/contract'
import { addressUrl } from '@/lib/constants'
import { shortAddress } from '@/lib/format'
import UiButton from '@/components/ui/UiButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import UiCard from '@/components/ui/UiCard.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const { t } = useI18n()
const route = useRoute()
const election = useElectionStore()

const address = computed(() => route.params.address as string)

const busy = ref<string | null>(null)
const actionError = ref<string | null>(null)

const voterAddress = ref('')
const proposalTitle = ref('')
const proposalDescription = ref('')

let teardown: (() => void) | null = null

/** The single phase-transition action available to the admin at this status. */
const nextStep = computed<{ label: string; hint: string; run: () => Promise<string> } | null>(() => {
  switch (election.status) {
    case WS.RegisteringVoters:
      return { label: 'election.startProposals', hint: 'election.startProposalsHint', run: election.startProposals }
    case WS.ProposalsRegistrationStarted:
      return { label: 'election.endProposals', hint: 'election.endProposalsHint', run: election.endProposals }
    case WS.ProposalsRegistrationEnded:
      return { label: 'election.startVoting', hint: 'election.startVotingHint', run: election.startVoting }
    case WS.VotingSessionStarted:
      return { label: 'election.endVoting', hint: 'election.endVotingHint', run: election.endVoting }
    case WS.VotingSessionEnded:
      return { label: 'election.tally', hint: 'election.tallyHint', run: election.tally }
    default:
      return null
  }
})

const votedTitle = computed(() => {
  const id = Number(election.me?.votedProposalId ?? 0n)
  return election.proposals.find((p) => p.id === id)?.title ?? `#${id}`
})

function isWinner(p: ProposalView): boolean {
  return (
    election.status === WS.VotesTallied &&
    election.winnerExists &&
    !!election.winner &&
    election.winner.title === p.title
  )
}

async function run(key: string, fn: () => Promise<string>) {
  busy.value = key
  actionError.value = null
  try {
    await fn()
  } catch (err) {
    actionError.value = (err as Error).message
  } finally {
    busy.value = null
  }
}

async function onRegister() {
  if (!isAddress(voterAddress.value)) return
  const addr = voterAddress.value
  await run('register', () => election.registerVoter(addr))
  if (!actionError.value) voterAddress.value = ''
}

async function onTransition() {
  if (nextStep.value) await run('transition', nextStep.value.run)
}

async function onAddProposal() {
  if (proposalTitle.value.trim().length < 3) return
  await run('propose', () =>
    election.addProposal(proposalTitle.value.trim(), proposalDescription.value.trim()),
  )
  if (!actionError.value) {
    proposalTitle.value = ''
    proposalDescription.value = ''
  }
}

async function onVote(id: number) {
  await run(`vote-${id}`, () => election.vote(id))
}

async function bootstrap(addr: string) {
  if (teardown) {
    teardown()
    teardown = null
  }
  await election.load(addr)
  teardown = election.subscribeEvents()
}

onMounted(() => {
  void bootstrap(address.value)
})

watch(address, (addr) => {
  if (addr) void bootstrap(addr)
})

onBeforeUnmount(() => {
  if (teardown) teardown()
})
</script>

<style scoped>
.role-tag {
  @apply inline-flex items-center gap-1 border px-2 py-1 font-pixel text-[8px] uppercase tracking-wider;
}
</style>
