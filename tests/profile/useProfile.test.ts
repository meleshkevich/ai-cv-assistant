import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useProfile } from '@/composables/useProfile'
import { loadProfile, saveProfile } from '@/services/profileService'
import { createEmptyProfile, generateId } from '@/types/profile'
import type { ExperienceEntry } from '@/types/profile'

// Tests for useProfile composable save/load behaviour.
// The effectScope manages Vue's reactivity without mounting a full component.
// onUnmounted is a no-op outside a component context (expected Vue warning suppressed).

function makeExperienceEntry(id: string, company: string): ExperienceEntry {
  return { id, company, position: 'Developer', location: '', startDate: '2024-01', endDate: null, description: '' }
}

describe('useProfile — load', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('populates profile from storage and clears isLoading', async () => {
    const saved = createEmptyProfile()
    saved.personal.fullName = 'Test User'
    await saveProfile(saved)

    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })

    expect(composable!.isLoading.value).toBe(true)
    await composable!.load()
    expect(composable!.isLoading.value).toBe(false)
    expect(composable!.profile.value.personal.fullName).toBe('Test User')
    scope.stop()
  })

  it('leaves profile as empty default when storage is empty', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()
    expect(composable!.profile.value.experience).toHaveLength(0)
    expect(composable!.isLoading.value).toBe(false)
    scope.stop()
  })

  it('stored experience survives load even when UI initially has an empty default', async () => {
    // Simulate: data was saved previously (e.g., before this instance started)
    const prior = createEmptyProfile()
    prior.experience.push(makeExperienceEntry('exp-prior', 'Prior Corp'))
    await saveProfile(prior)

    // New useProfile instance starts with an empty default
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    expect(composable!.profile.value.experience).toHaveLength(0) // empty before load

    await composable!.load()
    expect(composable!.profile.value.experience).toHaveLength(1) // restored from storage
    expect(composable!.profile.value.experience[0]?.company).toBe('Prior Corp')
    scope.stop()
  })

  it('profileCorrupted is false when profile loads cleanly', async () => {
    const prior = createEmptyProfile()
    prior.experience.push(makeExperienceEntry('exp-ok', 'Clean Corp'))
    await saveProfile(prior)

    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    expect(composable!.profileCorrupted.value).toBe(false)
    expect(composable!.corruptedFields.value).toHaveLength(0)
    scope.stop()
  })

  it('profileCorrupted is true when storage has experience: {}', async () => {
    // Simulate the corrupted state from the actual bug (Chrome proxy serialization)
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: {}, // ← the bug
        projects: [],
        education: [],
        languages: [],
        generalNotes: 'My notes',
      },
    })

    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })

    vi.spyOn(console, 'error').mockImplementation(() => {}) // suppress expected error log
    await composable!.load()
    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {}) // re-add warn mock for afterEach

    expect(composable!.profileCorrupted.value).toBe(true)
    expect(composable!.corruptedFields.value).toContain('experience')
    // generalNotes preserved despite corruption
    expect(composable!.profile.value.generalNotes).toBe('My notes')
    // experience normalized to [] in memory (entries unrecoverable)
    expect(composable!.profile.value.experience).toHaveLength(0)
    scope.stop()
  })
})

describe('useProfile — forceSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('writes immediately without waiting for the debounce timer', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.experience.push(makeExperienceEntry('exp-1', 'eBay'))

    // forceSave — do NOT advance fake timers
    await composable!.forceSave()

    const result = await loadProfile()
    expect(result?.profile.experience).toHaveLength(1)
    expect(result?.profile.experience[0]?.company).toBe('eBay')
    scope.stop()
  })

  it('experience and general notes both persist after one forceSave', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.experience.push(makeExperienceEntry('exp-2', 'Acme'))
    composable!.profile.value.generalNotes = 'Available immediately.'
    await composable!.forceSave()
    scope.stop()

    // Remount — new instance reads from storage
    const scope2 = effectScope()
    let composable2: ReturnType<typeof useProfile>
    scope2.run(() => { composable2 = useProfile() })
    await composable2!.load()
    expect(composable2!.profile.value.experience).toHaveLength(1)
    expect(composable2!.profile.value.generalNotes).toBe('Available immediately.')
    scope2.stop()
  })

  it('add → forceSave → simulated remount → experience persists', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.experience.push(makeExperienceEntry('exp-persist', 'Persistent Corp'))
    await composable!.forceSave()
    scope.stop()

    // "Reopen" the side panel — new composable instance
    const scope2 = effectScope()
    let composable2: ReturnType<typeof useProfile>
    scope2.run(() => { composable2 = useProfile() })
    await composable2!.load()
    expect(composable2!.profile.value.experience).toHaveLength(1)
    expect(composable2!.profile.value.experience[0]?.id).toBe('exp-persist')
    scope2.stop()
  })

  it('multiple rapid forceSave calls: stale seq guard prevents older save overwriting newer', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.generalNotes = 'First'
    const p1 = composable!.forceSave()

    composable!.profile.value.generalNotes = 'Second'
    const p2 = composable!.forceSave()

    await Promise.all([p1, p2])

    const result = await loadProfile()
    expect(result?.profile.generalNotes).toBe('Second')
    scope.stop()
  })

  it('multiple experience edits: all entries present after several forceSave calls', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.experience.push(makeExperienceEntry(generateId(), 'Corp A'))
    await composable!.forceSave()

    composable!.profile.value.experience.push(makeExperienceEntry(generateId(), 'Corp B'))
    await composable!.forceSave()

    const result = await loadProfile()
    expect(result?.profile.experience).toHaveLength(2)
    scope.stop()
  })

  it('pending debounce is superseded by forceSave — data written without waiting 600ms', async () => {
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    // Mutation triggers the deep watcher → scheduleSave → 600ms fake-timer debounce
    composable!.profile.value.experience.push(makeExperienceEntry('exp-debounce', 'Debounce Corp'))

    // forceSave clears the pending debounce and writes immediately
    await composable!.forceSave()

    // Data is in storage without vi.runAllTimers()
    const result = await loadProfile()
    expect(result?.profile.experience[0]?.company).toBe('Debounce Corp')
    scope.stop()
  })

  it('experience array stored is a plain Array not {} after forceSave', async () => {
    // Regression: without the JSON round-trip fix, Chrome's C++ V8 converter would
    // see a Vue reactive Proxy, call val->IsArray() → false, and store {} instead of [].
    const scope = effectScope()
    let composable: ReturnType<typeof useProfile>
    scope.run(() => { composable = useProfile() })
    await composable!.load()

    composable!.profile.value.experience.push(makeExperienceEntry('exp-reactive', 'Reactive Corp'))
    await composable!.forceSave()

    // Directly inspect what chrome.storage.local.set received (via test mock store)
    const rawResult = await chrome.storage.local.get('masterProfile')
    const stored = rawResult['masterProfile'] as Record<string, unknown>
    expect(Array.isArray(stored['experience'])).toBe(true)
    const exp = stored['experience'] as unknown[]
    expect(exp).toHaveLength(1)
    expect((exp[0] as Record<string, unknown>)['company']).toBe('Reactive Corp')
    scope.stop()
  })
})
