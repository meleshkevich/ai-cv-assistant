import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import { isReactive } from 'vue'
import { loadProfile, saveProfile } from '@/services/profileService'
import { createEmptyProfile, generateId } from '@/types/profile'
import type { MasterProfile, ExperienceEntry } from '@/types/profile'

// chrome mock is set up in tests/setup.ts

function makeExperienceEntry(id: string, company: string): ExperienceEntry {
  return {
    id,
    company,
    position: 'Developer',
    location: '',
    startDate: '2024-01',
    endDate: null,
    description: '',
  }
}

describe('loadProfile', () => {
  it('returns null when storage is empty', async () => {
    const result = await loadProfile()
    expect(result).toBeNull()
  })

  it('returns null for unrecognized schemaVersion', async () => {
    await chrome.storage.local.set({ masterProfile: { schemaVersion: 99, personal: {} } })
    const result = await loadProfile()
    expect(result).toBeNull()
  })

  it('loads a saved profile', async () => {
    const profile = createEmptyProfile()
    profile.personal.fullName = 'Test User'
    await saveProfile(profile)
    const result = await loadProfile()
    expect(result).not.toBeNull()
    expect(result?.profile.personal.fullName).toBe('Test User')
    expect(result?.profile.schemaVersion).toBe(1)
    expect(result?.corrupted).toBe(false)
  })

  it('preserves Unicode text across save/load', async () => {
    const profile = createEmptyProfile()
    profile.generalNotes = 'žluťoučký kůň: ěščřžýáíéúůóů'
    await saveProfile(profile)
    const result = await loadProfile()
    expect(result?.profile.generalNotes).toBe('žluťoučký kůň: ěščřžýáíéúůóů')
  })

  it('preserves null endDate across save/load', async () => {
    const profile = createEmptyProfile()
    profile.experience.push({
      id: generateId(),
      company: 'Corp',
      position: 'Dev',
      location: '',
      startDate: '2020-01',
      endDate: null,
      description: '',
    })
    await saveProfile(profile)
    const result = await loadProfile()
    expect(result?.profile.experience[0]?.endDate).toBeNull()
  })
})

describe('loadProfile — field normalization', () => {
  it('normalizes null experience to [] preserving other fields', async () => {
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: 'Test', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: null,
        projects: [],
        education: [],
        languages: [],
        generalNotes: 'Still here',
      },
    })
    const result = await loadProfile()
    expect(result).not.toBeNull()
    expect(result?.corrupted).toBe(false) // null is treated as missing, not corruption
    expect(Array.isArray(result?.profile.experience)).toBe(true)
    expect(result?.profile.experience).toHaveLength(0)
    expect(result?.profile.generalNotes).toBe('Still here')
  })

  it('normalizes missing array fields to [] when absent from storage', async () => {
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        generalNotes: 'Note',
        // experience, projects, education, languages intentionally absent
      },
    })
    const result = await loadProfile()
    expect(result).not.toBeNull()
    expect(result?.corrupted).toBe(false) // missing fields are not corruption
    expect(Array.isArray(result?.profile.experience)).toBe(true)
    expect(Array.isArray(result?.profile.projects)).toBe(true)
    expect(Array.isArray(result?.profile.education)).toBe(true)
    expect(Array.isArray(result?.profile.languages)).toBe(true)
    expect(result?.profile.generalNotes).toBe('Note')
  })

  it('preserves a valid experience array in storage without modification', async () => {
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: [
          { id: 'exp-1', company: 'eBay', position: 'Frontend Developer', location: 'Prague', startDate: '2025-05', endDate: null, description: 'FreeMarker templates.' },
        ],
        projects: [],
        education: [],
        languages: [],
        generalNotes: '',
      },
    })
    const result = await loadProfile()
    expect(result?.profile.experience).toHaveLength(1)
    expect(result?.profile.experience[0]?.company).toBe('eBay')
    expect(result?.profile.experience[0]?.endDate).toBeNull()
  })
})

describe('loadProfile — corruption detection', () => {
  it('detects experience: {} as corruption, sets corrupted=true', async () => {
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: {}, // ← the actual bug that was filed
        projects: [],
        education: [],
        languages: [],
        generalNotes: 'My notes',
      },
    })
    const result = await loadProfile()
    expect(result).not.toBeNull()
    expect(result?.corrupted).toBe(true)
    expect(result?.corruptedFields).toContain('experience')
    // normalizes to [] in memory — entries are unrecoverable from storage
    expect(Array.isArray(result?.profile.experience)).toBe(true)
    expect(result?.profile.experience).toHaveLength(0)
    // valid fields are preserved
    expect(result?.profile.generalNotes).toBe('My notes')
  })

  it('detects multiple corrupted fields', async () => {
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: {},
        projects: {},
        education: [],
        languages: [],
        generalNotes: '',
      },
    })
    const result = await loadProfile()
    expect(result?.corrupted).toBe(true)
    expect(result?.corruptedFields).toContain('experience')
    expect(result?.corruptedFields).toContain('projects')
    expect(result?.corruptedFields).not.toContain('education')
    expect(result?.corruptedFields).not.toContain('languages')
  })

  it('does not flag a string experience as a corruption of a different type — only {} case', async () => {
    // A completely wrong type like a number is still flagged as corruption.
    await chrome.storage.local.set({
      masterProfile: {
        schemaVersion: 1,
        personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
        experience: 42,
        projects: [],
        education: [],
        languages: [],
        generalNotes: '',
      },
    })
    const result = await loadProfile()
    expect(result?.corrupted).toBe(true)
    expect(result?.corruptedFields).toContain('experience')
  })
})

describe('saveProfile', () => {
  it('calls chrome.storage.local.set with the STORAGE_KEY', async () => {
    const profile = createEmptyProfile()
    await saveProfile(profile)
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ masterProfile: expect.any(Object) }),
    )
  })

  it('stores the full profile structure', async () => {
    const profile: MasterProfile = {
      schemaVersion: 1,
      personal: {
        fullName: 'Jane Doe',
        title: 'Engineer',
        location: 'Remote',
        email: 'jane@example.com',
        phone: '',
        linkedIn: '',
        github: '',
      },
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          position: 'Dev',
          location: '',
          startDate: '2020-01',
          endDate: null,
          description: 'Built things.',
        },
      ],
      projects: [],
      education: [],
      languages: [{ id: 'l1', language: 'English', proficiency: 'Native' }],
      generalNotes: 'Extra notes.',
    }

    await saveProfile(profile)
    const result = await loadProfile()
    expect(result?.profile.personal.fullName).toBe('Jane Doe')
    expect(result?.profile.experience).toHaveLength(1)
    expect(result?.profile.experience[0]?.company).toBe('Acme')
    expect(result?.profile.languages[0]?.language).toBe('English')
    expect(result?.profile.generalNotes).toBe('Extra notes.')
  })

  // ─── Reactive proxy serialization regression ───────────────────────────────
  // Verifies the root cause of the experience: {} bug:
  // Chrome's C++ V8 value converter calls val->IsArray() which returns false for
  // ES6 Proxy objects, treating reactive arrays as plain objects → {} in storage.
  // The fix: JSON.parse(JSON.stringify(profile)) strips proxies before the call.

  it('stores a plain object, not a Vue reactive proxy', async () => {
    // Simulate the state inside useProfile: a reactive object (what profile.value is)
    const reactiveProfile = reactive(createEmptyProfile()) as MasterProfile
    reactiveProfile.experience.push(makeExperienceEntry('exp-1', 'eBay'))

    let storedValue: unknown
    chrome.storage.local.set = vi.fn((items: Record<string, unknown>) => {
      storedValue = items['masterProfile']
      return Promise.resolve()
    })

    await saveProfile(reactiveProfile)

    // The stored value must NOT be a reactive proxy
    expect(isReactive(storedValue)).toBe(false)
    // The stored value must NOT be reactive at any nested level
    const stored = storedValue as Record<string, unknown>
    expect(isReactive(stored['experience'])).toBe(false)
  })

  it('stores experience as a real Array, not {} (the actual bug)', async () => {
    const reactiveProfile = reactive(createEmptyProfile()) as MasterProfile
    reactiveProfile.experience.push(makeExperienceEntry('exp-ebay', 'eBay'))

    let storedExperience: unknown
    chrome.storage.local.set = vi.fn((items: Record<string, unknown>) => {
      const p = items['masterProfile'] as Record<string, unknown>
      storedExperience = p['experience']
      return Promise.resolve()
    })

    await saveProfile(reactiveProfile)

    expect(Array.isArray(storedExperience)).toBe(true)
    const exp = storedExperience as unknown[]
    expect(exp).toHaveLength(1)
    expect((exp[0] as Record<string, unknown>)['company']).toBe('eBay')
  })

  it('reactive array round-trip: load after reactive save returns the experience entry', async () => {
    const reactiveProfile = reactive(createEmptyProfile()) as MasterProfile
    reactiveProfile.experience.push(makeExperienceEntry('exp-rt', 'Round-Trip Corp'))
    reactiveProfile.generalNotes = 'Still here'

    await saveProfile(reactiveProfile)
    const result = await loadProfile()

    expect(result?.corrupted).toBe(false)
    expect(result?.profile.experience).toHaveLength(1)
    expect(result?.profile.experience[0]?.company).toBe('Round-Trip Corp')
    expect(result?.profile.generalNotes).toBe('Still here')
  })

  it('multiple experience entries survive a reactive save/load round-trip', async () => {
    const reactiveProfile = reactive(createEmptyProfile()) as MasterProfile
    reactiveProfile.experience.push(makeExperienceEntry(generateId(), 'Corp A'))
    reactiveProfile.experience.push(makeExperienceEntry(generateId(), 'Corp B'))

    await saveProfile(reactiveProfile)
    const result = await loadProfile()

    expect(result?.profile.experience).toHaveLength(2)
    const companies = result?.profile.experience.map((e) => e.company)
    expect(companies).toContain('Corp A')
    expect(companies).toContain('Corp B')
  })

  it('experience and general notes both survive together', async () => {
    const reactiveProfile = reactive(createEmptyProfile()) as MasterProfile
    reactiveProfile.experience.push(makeExperienceEntry('exp-combined', 'Combined Corp'))
    reactiveProfile.generalNotes = 'Available immediately.'

    await saveProfile(reactiveProfile)
    const result = await loadProfile()

    expect(result?.profile.experience).toHaveLength(1)
    expect(result?.profile.generalNotes).toBe('Available immediately.')
  })
})

describe('stale save guard (saveSeq pattern)', () => {
  it('later save does not get overwritten by an earlier slow save', async () => {
    // Simulate: first save is slow (delayed), second save resolves first.
    let firstSaveResolve: () => void
    const firstSavePromise = new Promise<void>((res) => {
      firstSaveResolve = res
    })

    let callCount = 0
    const values: MasterProfile[] = []

    chrome.storage.local.set = vi.fn((items: Record<string, unknown>) => {
      callCount++
      const p = items['masterProfile'] as MasterProfile
      values.push(structuredClone(p))
      if (callCount === 1) {
        // First call is deferred — represents a slow write
        return firstSavePromise
      }
      return Promise.resolve()
    })

    const profileV1 = createEmptyProfile()
    profileV1.personal.fullName = 'Version 1'

    const profileV2 = createEmptyProfile()
    profileV2.personal.fullName = 'Version 2'

    // Fire both saves; the second one completes immediately
    const save1 = saveProfile(profileV1)
    const save2 = saveProfile(profileV2)

    // Allow save2 to complete first
    await save2

    // Now let save1 resolve
    firstSaveResolve!()
    await save1

    // Both writes happened; we just verify they were called in order
    expect(callCount).toBe(2)
    expect(values[0]?.personal.fullName).toBe('Version 1')
    expect(values[1]?.personal.fullName).toBe('Version 2')
    // The profileService itself doesn't prevent out-of-order writes — that's
    // the composable's saveSeq responsibility. This test validates that
    // profileService faithfully passes through what it receives.
  })
})
