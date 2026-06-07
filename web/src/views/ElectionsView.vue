<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-pixel text-base text-neon-blue uppercase">{{ t('elections.title') }}</h1>
      <div class="flex items-center gap-2">
        <button
          class="text-gray-400 hover:text-neon-blue p-2"
          :title="t('common.refresh')"
          @click="factory.refresh"
        >
          <UiIcon name="refresh" size="md" :class="{ 'animate-spin': factory.loading }" />
        </button>
        <UiButton variant="primary" size="sm" @click="openCreate">
          <UiIcon name="plus" size="sm" /> {{ t('elections.create') }}
        </UiButton>
      </div>
    </div>

    <!-- Filter -->
    <div class="flex gap-2">
      <button
        v-for="f in filters"
        :key="f.key"
        class="font-pixel text-[9px] uppercase px-3 py-2 border-2 transition-colors"
        :class="
          activeFilter === f.key
            ? 'border-neon-blue text-neon-blue'
            : 'border-dark-accent text-gray-500 hover:text-gray-300'
        "
        @click="activeFilter = f.key"
      >
        {{ t(f.label) }}
      </button>
    </div>

    <p v-if="factory.error" class="text-neon-danger text-xs">{{ factory.error }}</p>

    <div v-if="factory.loading && !factory.elections.length" class="text-center py-12">
      <UiIcon name="loader" size="lg" class="animate-spin text-neon-blue mx-auto" />
    </div>

    <p
      v-else-if="!visibleElections.length"
      class="text-gray-500 text-sm text-center py-12 border-2 border-dashed border-dark-accent"
    >
      {{ activeFilter === 'mine' ? t('elections.emptyMine') : t('elections.empty') }}
    </p>

    <div v-else class="grid gap-3 sm:grid-cols-2">
      <RouterLink
        v-for="e in visibleElections"
        :key="e.address"
        :to="{ name: 'election', params: { address: e.address } }"
        class="block bg-dark-surface border-2 border-dark-accent shadow-pixel p-4 hover:border-neon-blue transition-colors group"
      >
        <div class="flex items-start justify-between gap-2 mb-3">
          <h2 class="font-sans font-semibold text-white group-hover:text-neon-blue break-words">
            {{ e.title }}
          </h2>
          <UiIcon name="arrowRight" size="sm" class="text-gray-600 group-hover:text-neon-blue mt-1" />
        </div>
        <div class="flex items-center justify-between gap-2">
          <StatusBadge :status="e.status" />
          <span
            v-if="eqAddress(e.owner, wallet.address)"
            class="font-pixel text-[8px] text-neon-orange uppercase"
          >
            {{ t('elections.youAdmin') }}
          </span>
        </div>
        <p class="font-mono text-[10px] text-gray-500 mt-2">
          {{ t('elections.admin') }}: {{ shortAddress(e.owner) }}
        </p>
      </RouterLink>
    </div>

    <!-- Create modal -->
    <UiModal :open="createOpen" :title="t('elections.createTitle')" @close="createOpen = false">
      <form class="space-y-4" @submit.prevent="submitCreate">
        <div>
          <label class="font-pixel text-[9px] text-gray-400 uppercase block mb-2">
            {{ t('elections.nameLabel') }}
          </label>
          <input
            v-model="newTitle"
            type="text"
            :placeholder="t('elections.namePlaceholder')"
            class="w-full bg-dark-bg border-2 border-dark-accent focus:border-neon-blue outline-none px-3 py-2 text-white text-sm font-sans"
            maxlength="80"
          />
          <p class="text-[10px] text-gray-500 mt-1">{{ t('elections.nameHint') }}</p>
        </div>
        <p v-if="createError" class="text-neon-danger text-xs">{{ createError }}</p>
        <div class="flex gap-2 justify-end">
          <UiButton variant="ghost" size="sm" type="button" @click="createOpen = false">
            {{ t('common.cancel') }}
          </UiButton>
          <UiButton
            variant="primary"
            size="sm"
            type="submit"
            :loading="creating"
            :disabled="newTitle.trim().length < 3"
          >
            {{ t('elections.create') }}
          </UiButton>
        </div>
      </form>
    </UiModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useFactoryStore } from '@/stores/factory'
import { useWalletStore } from '@/stores/wallet'
import { shortAddress, eqAddress } from '@/lib/format'
import UiButton from '@/components/ui/UiButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import UiModal from '@/components/ui/UiModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'

const { t } = useI18n()
const router = useRouter()
const factory = useFactoryStore()
const wallet = useWalletStore()

type Filter = 'all' | 'mine'
const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'elections.filterAll' },
  { key: 'mine', label: 'elections.filterMine' },
]
const activeFilter = ref<Filter>('all')

const visibleElections = computed(() =>
  activeFilter.value === 'mine' ? factory.myElections : factory.elections,
)

const createOpen = ref(false)
const newTitle = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

function openCreate() {
  newTitle.value = ''
  createError.value = null
  createOpen.value = true
}

async function submitCreate() {
  if (newTitle.value.trim().length < 3) return
  creating.value = true
  createError.value = null
  try {
    const { address } = await factory.createVoting(newTitle.value.trim())
    createOpen.value = false
    if (address) {
      router.push({ name: 'election', params: { address } })
    }
  } catch (err) {
    createError.value = (err as Error).message
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void factory.refresh()
})

// Re-list when the connected account changes (the "mine" filter depends on it).
watch(
  () => wallet.address,
  () => {
    void factory.refresh()
  },
)
</script>
