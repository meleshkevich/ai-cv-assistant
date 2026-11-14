import { ref, watch, onUnmounted, type InjectionKey, type Ref } from 'vue'
import type { MasterProfile } from '@/types/profile'
import { createEmptyProfile } from '@/types/profile'
import { loadProfile, saveProfile } from '@/services/profileService'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ProfileComposable {
  profile: Ref<MasterProfile>
  saveStatus: Ref<SaveStatus>
  isLoading: Ref<boolean>
  /** true if any array field in the stored profile had an invalid non-array type */
  profileCorrupted: Ref<boolean>
  /** Names of the array fields that were corrupted in storage */
  corruptedFields: Ref<string[]>
  load: () => Promise<void>
  forceSave: () => Promise<void>
}

export const PROFILE_KEY: InjectionKey<ProfileComposable> = Symbol('profile')

const DEBOUNCE_MS = 600

export function useProfile(): ProfileComposable {
  const profile = ref<MasterProfile>(createEmptyProfile())
  const saveStatus = ref<SaveStatus>('idle')
  const isLoading = ref(true)
  const profileCorrupted = ref(false)
  const corruptedFields = ref<string[]>([])

  // Monotonic counter: each save() call gets a unique seq. The check
  // `seq !== saveSeq` inside the writeChain ensures only the latest enqueued
  // save actually writes — earlier ones skip since a newer call will write
  // up-to-date data.
  let saveSeq = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Serializing promise chain: each save appends to this chain so writes
  // cannot race even if two saves are enqueued simultaneously.
  let writeChain: Promise<void> = Promise.resolve()

  function save(): void {
    // Guard: never save the initial empty skeleton while load is still pending.
    if (isLoading.value) return

    const seq = ++saveSeq
    saveStatus.value = 'saving'

    if (import.meta.env.DEV) {
      console.log('[useProfile] save enqueued', {
        seq,
        saveSeq,
        experienceIsArray: Array.isArray(profile.value.experience),
        experienceCount: Array.isArray(profile.value.experience)
          ? profile.value.experience.length
          : 'not-array',
      })
    }

    writeChain = writeChain
      .catch(() => {}) // prior chain errors don't block future saves
      .then(async () => {
        if (seq !== saveSeq) return // superseded — a later save will write newer data
        try {
          await saveProfile(profile.value)
          if (seq !== saveSeq) return
          if (import.meta.env.DEV) {
            console.log('[useProfile] save completed', { seq })
          }
          saveStatus.value = 'saved'
        } catch (err) {
          if (seq !== saveSeq) return
          console.error('[useProfile] Save failed:', err)
          saveStatus.value = 'error'
        }
      })
  }

  function scheduleSave(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      save()
    }, DEBOUNCE_MS)
  }

  // Deep watch fires on any nested mutation (field edits, array push/splice, etc.)
  watch(profile, scheduleSave, { deep: true })

  // Flush any pending debounced save when the page is hidden (side panel close).
  // Using save() (writeChain) rather than a direct saveProfile() call keeps all
  // writes serialized and prevents a bypassed save from racing with an in-flight
  // writeChain write.
  //
  // Limitation: if the writeChain still has earlier entries to process when the
  // renderer is torn down, the enqueued save may not reach chrome.storage.local.set()
  // in time. In practice this window is tiny (microtasks, no I/O between entries).
  // Add/Delete operations call forceSave() immediately, so the writeChain is usually
  // idle by the time the user closes the panel.
  function handlePageHide(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      save()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', handlePageHide)
  }

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', handlePageHide)
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  })

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      const result = await loadProfile()
      if (result !== null) {
        profile.value = result.profile
        if (result.corrupted) {
          profileCorrupted.value = true
          corruptedFields.value = result.corruptedFields
          console.error(
            '[useProfile] Profile loaded with corrupted fields:',
            result.corruptedFields,
            '— use JSON Import to restore data.',
          )
        }
      }
    } catch (err) {
      console.error('[useProfile] Load failed:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function forceSave(): Promise<void> {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    save() // enqueue onto the write chain
    await writeChain // wait for the actual write to complete
  }

  return { profile, saveStatus, isLoading, profileCorrupted, corruptedFields, load, forceSave }
}
