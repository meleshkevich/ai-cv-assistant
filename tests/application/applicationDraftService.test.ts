import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeVacancyId,
  saveApplicationDraft,
  loadApplicationDraft,
  deleteApplicationDraft,
} from '@/services/applicationDraftService'
import type { ApplicationDraft, GeneratedApplication } from '@/types/application'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeApplication(): GeneratedApplication {
  return {
    coverLetter: {
      language: 'en',
      subject: 'Application for Engineer Role',
      body: 'Dear Hiring Manager, I am applying for the engineer role.',
    },
    cv: {
      language: 'en',
      professionalTitle: 'Software Engineer',
      professionalSummary: 'Experienced TypeScript engineer.',
      technicalSkills: ['TypeScript', 'Vue.js'],
      experience: [
        {
          sourceId: 'exp-1',
          company: 'Acme Corp',
          position: 'Software Engineer',
          startDate: '2020-01',
          endDate: null,
          highlights: ['Built TypeScript APIs'],
        },
      ],
      projects: [
        {
          sourceId: 'proj-1',
          name: 'Open Logger',
          role: 'Lead',
          highlights: ['Authored Rust logging library'],
        },
      ],
      education: [
        {
          sourceId: 'edu-1',
          institution: 'Czech Technical University',
          degree: 'Bachelor',
          field: 'Computer Science',
        },
      ],
      languages: [{ sourceId: 'lang-1', language: 'Czech', proficiency: 'Native' }],
    },
  }
}

function makeDraft(overrides: Partial<ApplicationDraft> = {}): ApplicationDraft {
  const vacancyId = 'https://example.com/jobs/123'
  return {
    schemaVersion: 1,
    vacancyId,
    vacancyTitle: 'Software Engineer',
    vacancyCompany: 'Acme Corp',
    sourceUrl: 'https://example.com/jobs/123?ref=homepage',
    language: 'en',
    application: makeApplication(),
    savedAt: 1700000000000,
    ...overrides,
  }
}

// ── Chrome storage mock helpers ───────────────────────────────────────────────

function mockStorage(initialData: Record<string, unknown> = {}): {
  store: Record<string, unknown>
  set: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const store: Record<string, unknown> = { ...initialData }

  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items)
  })

  const get = vi.fn(async (key: string | string[]) => {
    if (typeof key === 'string') {
      return { [key]: store[key] }
    }
    const result: Record<string, unknown> = {}
    for (const k of key) result[k] = store[k]
    return result
  })

  const remove = vi.fn(async (key: string | string[]) => {
    if (typeof key === 'string') {
      delete store[key]
    } else {
      for (const k of key) delete store[k]
    }
  })

  vi.stubGlobal('chrome', {
    storage: { local: { set, get, remove } },
  })

  return { store, set, get, remove }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── normalizeVacancyId ────────────────────────────────────────────────────────

describe('normalizeVacancyId', () => {
  it('removes URL fragment', () => {
    const result = normalizeVacancyId('https://jobs.example.com/listing/123#apply')
    expect(result).not.toContain('#')
  })

  it('removes utm_source tracking param', () => {
    const url = 'https://example.com/jobs/123?utm_source=google&id=abc'
    const result = normalizeVacancyId(url)
    expect(result).not.toContain('utm_source')
    expect(result).toContain('id=abc')
  })

  it('removes all standard tracking params', () => {
    const url = 'https://example.com/jobs/123?utm_source=g&utm_medium=cpc&utm_campaign=q1&fbclid=x&gclid=y&msclkid=z&jobId=456'
    const result = normalizeVacancyId(url)
    expect(result).not.toMatch(/utm_|fbclid|gclid|msclkid/)
    expect(result).toContain('jobId=456')
  })

  it('sorts remaining query parameters for stability', () => {
    const a = normalizeVacancyId('https://example.com/jobs?b=2&a=1')
    const b = normalizeVacancyId('https://example.com/jobs?a=1&b=2')
    expect(a).toBe(b)
  })

  it('lowercases the scheme', () => {
    const result = normalizeVacancyId('HTTPS://example.com/jobs/123')
    expect(result.startsWith('https://')).toBe(true)
  })

  it('lowercases the hostname', () => {
    const result = normalizeVacancyId('https://EXAMPLE.COM/jobs/123')
    expect(result).toContain('example.com')
  })

  it('preserves path case (paths are case-sensitive)', () => {
    const result = normalizeVacancyId('https://example.com/Jobs/TypeScript-Engineer')
    expect(result).toContain('/Jobs/TypeScript-Engineer')
  })

  it('produces the same ID for two semantically identical URLs', () => {
    const a = normalizeVacancyId('https://example.com/jobs/123?utm_source=google')
    const b = normalizeVacancyId('https://example.com/jobs/123#section')
    expect(a).toBe(b)
  })

  it('produces different IDs for different job paths', () => {
    const a = normalizeVacancyId('https://example.com/jobs/123')
    const b = normalizeVacancyId('https://example.com/jobs/456')
    expect(a).not.toBe(b)
  })

  it('produces different IDs for different hosts', () => {
    const a = normalizeVacancyId('https://company-a.com/jobs/123')
    const b = normalizeVacancyId('https://company-b.com/jobs/123')
    expect(a).not.toBe(b)
  })

  it('handles malformed URLs by returning the input unchanged', () => {
    const bad = 'not a valid url'
    expect(normalizeVacancyId(bad)).toBe(bad)
  })
})

// ── saveApplicationDraft ──────────────────────────────────────────────────────

describe('saveApplicationDraft', () => {
  it('calls chrome.storage.local.set with the correct prefixed key', async () => {
    const { set } = mockStorage()
    const draft = makeDraft()
    await saveApplicationDraft(draft)

    expect(set).toHaveBeenCalledOnce()
    const arg = set.mock.calls[0][0] as Record<string, unknown>
    const key = `appDraft:v1:${draft.vacancyId}`
    expect(key in arg).toBe(true)
  })

  it('stores a plain object (not a Vue reactive proxy) by JSON round-tripping', async () => {
    const { set } = mockStorage()
    const draft = makeDraft()
    await saveApplicationDraft(draft)

    const arg = set.mock.calls[0][0] as Record<string, unknown>
    const key = `appDraft:v1:${draft.vacancyId}`
    const stored = arg[key] as Record<string, unknown>
    expect(stored.schemaVersion).toBe(1)
    expect(stored.vacancyId).toBe(draft.vacancyId)
  })

  it('survives JSON round-trip: arrays remain arrays', async () => {
    const { set } = mockStorage()
    const draft = makeDraft()
    await saveApplicationDraft(draft)

    const arg = set.mock.calls[0][0] as Record<string, unknown>
    const key = `appDraft:v1:${draft.vacancyId}`
    const stored = arg[key] as ApplicationDraft
    expect(Array.isArray(stored.application.cv.experience)).toBe(true)
    expect(Array.isArray(stored.application.cv.projects)).toBe(true)
    expect(Array.isArray(stored.application.cv.education)).toBe(true)
    expect(Array.isArray(stored.application.cv.languages)).toBe(true)
    expect(Array.isArray(stored.application.cv.technicalSkills)).toBe(true)
    expect(Array.isArray(stored.application.cv.experience[0].highlights)).toBe(true)
  })

  it('propagates chrome storage errors', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { set: vi.fn().mockRejectedValue(new Error('Quota exceeded')) } },
    })
    await expect(saveApplicationDraft(makeDraft())).rejects.toThrow('Quota exceeded')
  })
})

// ── loadApplicationDraft ──────────────────────────────────────────────────────

describe('loadApplicationDraft', () => {
  it('returns the saved draft for a matching vacancyId', async () => {
    const draft = makeDraft()
    const key = `appDraft:v1:${draft.vacancyId}`
    mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    const result = await loadApplicationDraft(draft.vacancyId)
    expect(result).not.toBeNull()
    expect(result?.vacancyId).toBe(draft.vacancyId)
    expect(result?.application.coverLetter.subject).toBe(draft.application.coverLetter.subject)
  })

  it('returns null when no draft exists', async () => {
    mockStorage({})
    const result = await loadApplicationDraft('https://example.com/jobs/nonexistent')
    expect(result).toBeNull()
  })

  it('returns null and removes the entry for a corrupted draft (wrong schema version)', async () => {
    const vacancyId = 'https://example.com/jobs/123'
    const key = `appDraft:v1:${vacancyId}`
    const { remove } = mockStorage({ [key]: { schemaVersion: 99, vacancyId } })

    const result = await loadApplicationDraft(vacancyId)
    expect(result).toBeNull()
    // Corrupted entry should have been scheduled for removal
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(remove).toHaveBeenCalled()
  })

  it('returns null for a draft with a mismatched vacancyId (security check)', async () => {
    const storedId = 'https://example.com/jobs/123'
    const requestedId = 'https://example.com/jobs/456'
    const key = `appDraft:v1:${requestedId}`
    const draftData = JSON.parse(JSON.stringify(makeDraft({ vacancyId: storedId })))
    mockStorage({ [key]: draftData })

    const result = await loadApplicationDraft(requestedId)
    expect(result).toBeNull()
  })

  it('returns null for a draft with invalid language', async () => {
    const vacancyId = 'https://example.com/jobs/123'
    const key = `appDraft:v1:${vacancyId}`
    const bad = { ...JSON.parse(JSON.stringify(makeDraft())), language: 'fr' }
    mockStorage({ [key]: bad })

    const result = await loadApplicationDraft(vacancyId)
    expect(result).toBeNull()
  })

  it('returns null when application content fails schema validation', async () => {
    const vacancyId = 'https://example.com/jobs/123'
    const key = `appDraft:v1:${vacancyId}`
    const bad = {
      schemaVersion: 1,
      vacancyId,
      sourceUrl: 'https://example.com/jobs/123',
      language: 'en',
      savedAt: 1700000000000,
      application: { not: 'a valid application' },
    }
    mockStorage({ [key]: bad })

    const result = await loadApplicationDraft(vacancyId)
    expect(result).toBeNull()
  })

  it('restores cv arrays as actual arrays after storage round-trip', async () => {
    const draft = makeDraft()
    const key = `appDraft:v1:${draft.vacancyId}`
    mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    const result = await loadApplicationDraft(draft.vacancyId)
    expect(Array.isArray(result?.application.cv.experience)).toBe(true)
    expect(Array.isArray(result?.application.cv.projects)).toBe(true)
    expect(Array.isArray(result?.application.cv.education)).toBe(true)
    expect(Array.isArray(result?.application.cv.languages)).toBe(true)
    expect(Array.isArray(result?.application.cv.technicalSkills)).toBe(true)
    expect(Array.isArray(result?.application.cv.experience[0].highlights)).toBe(true)
  })

  it('propagates chrome storage errors', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn().mockRejectedValue(new Error('Storage unavailable')) } },
    })
    await expect(loadApplicationDraft('https://example.com/jobs/123')).rejects.toThrow(
      'Storage unavailable',
    )
  })
})

// ── deleteApplicationDraft ────────────────────────────────────────────────────

describe('deleteApplicationDraft', () => {
  it('calls chrome.storage.local.remove with the correct key', async () => {
    const { remove } = mockStorage()
    const vacancyId = 'https://example.com/jobs/123'
    await deleteApplicationDraft(vacancyId)

    expect(remove).toHaveBeenCalledWith(`appDraft:v1:${vacancyId}`)
  })

  it('removes the draft so a subsequent load returns null', async () => {
    const draft = makeDraft()
    const key = `appDraft:v1:${draft.vacancyId}`
    const { store } = mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    await deleteApplicationDraft(draft.vacancyId)
    expect(store[key]).toBeUndefined()
  })

  it('propagates chrome storage errors', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { remove: vi.fn().mockRejectedValue(new Error('Remove failed')) } },
    })
    await expect(deleteApplicationDraft('https://example.com/jobs/123')).rejects.toThrow(
      'Remove failed',
    )
  })
})

// ── Vacancy collision safety ──────────────────────────────────────────────────

describe('vacancy isolation', () => {
  it('different vacancyIds use different storage keys — no collision', async () => {
    const { set } = mockStorage()
    const draft1 = makeDraft({ vacancyId: 'https://company-a.com/jobs/1' })
    const draft2 = makeDraft({ vacancyId: 'https://company-b.com/jobs/1' })

    await saveApplicationDraft(draft1)
    await saveApplicationDraft(draft2)

    const keys = set.mock.calls.map((c) => Object.keys(c[0] as object)[0])
    expect(new Set(keys).size).toBe(2)
  })

  it('loading draft for vacancy A does not return draft for vacancy B', async () => {
    const idA = 'https://company-a.com/jobs/1'
    const idB = 'https://company-b.com/jobs/2'
    const keyA = `appDraft:v1:${idA}`
    const draftA = makeDraft({ vacancyId: idA })
    mockStorage({ [keyA]: JSON.parse(JSON.stringify(draftA)) })

    const result = await loadApplicationDraft(idB)
    expect(result).toBeNull()
  })
})

// ── Stale write prevention ────────────────────────────────────────────────────

describe('stale write prevention', () => {
  it('a later save does not use data from an earlier call', async () => {
    const { set } = mockStorage()

    const draft1 = makeDraft({ savedAt: 1700000000000 })
    const draft2 = makeDraft({ savedAt: 1700000001000 })

    await saveApplicationDraft(draft1)
    await saveApplicationDraft(draft2)

    expect(set).toHaveBeenCalledTimes(2)
    const lastCall = set.mock.calls[1][0] as Record<string, ApplicationDraft>
    const key = `appDraft:v1:${draft2.vacancyId}`
    expect(lastCall[key].savedAt).toBe(1700000001000)
  })
})

// ── Master Profile isolation ──────────────────────────────────────────────────

describe('master profile isolation', () => {
  it('saveApplicationDraft does not write to the masterProfile key', async () => {
    const { set } = mockStorage()
    await saveApplicationDraft(makeDraft())

    const writtenKeys = set.mock.calls.flatMap((c) => Object.keys(c[0] as object))
    expect(writtenKeys.every((k) => !k.includes('masterProfile'))).toBe(true)
  })

  it('deleteApplicationDraft does not remove the masterProfile key', async () => {
    const { remove } = mockStorage()
    await deleteApplicationDraft('https://example.com/jobs/123')

    const removedKey = remove.mock.calls[0]?.[0] as string
    expect(removedKey).not.toContain('masterProfile')
  })
})

// ── Draft content integrity ───────────────────────────────────────────────────

describe('draft content integrity', () => {
  it('loaded draft has the same cover letter subject as was saved', async () => {
    const draft = makeDraft()
    draft.application.coverLetter.subject = 'Edited Subject'
    const key = `appDraft:v1:${draft.vacancyId}`
    mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    const loaded = await loadApplicationDraft(draft.vacancyId)
    expect(loaded?.application.coverLetter.subject).toBe('Edited Subject')
  })

  it('loaded draft preserves edited experience highlights', async () => {
    const draft = makeDraft()
    draft.application.cv.experience[0].highlights = ['Custom highlight A', 'Custom highlight B']
    const key = `appDraft:v1:${draft.vacancyId}`
    mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    const loaded = await loadApplicationDraft(draft.vacancyId)
    expect(loaded?.application.cv.experience[0].highlights).toEqual([
      'Custom highlight A',
      'Custom highlight B',
    ])
  })

  it('loaded draft preserves language', async () => {
    const draft = makeDraft({ language: 'cs' })
    draft.application.coverLetter.language = 'cs'
    draft.application.cv.language = 'cs'
    const key = `appDraft:v1:${draft.vacancyId}`
    mockStorage({ [key]: JSON.parse(JSON.stringify(draft)) })

    const loaded = await loadApplicationDraft(draft.vacancyId)
    expect(loaded?.language).toBe('cs')
  })
})
