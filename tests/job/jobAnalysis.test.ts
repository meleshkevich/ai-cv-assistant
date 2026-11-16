import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzeJob, isAnalysisError } from '@/services/jobAnalysisService'
import { parseAndValidateAnalysis, verifyAnalysis } from '@/utils/jobAnalysisValidator'
import { buildUserMessage, buildSystemPrompt } from '@/prompts/analyzeJob'
import type { MasterProfile } from '@/types/profile'
import type { ExtensionSettings } from '@/types/settings'
import type { JobAnalysis, JobRecommendation } from '@/types/jobAnalysis'
import { buildApplicationUserMessage, buildApplicationSystemPrompt } from '@/prompts/generateApplication'
import { buildSourceTokenMap } from '@/utils/sourceTokenMap'
import type { ValidatedAnalysis } from '@/types/jobAnalysis'
import { DEFAULT_OPENAI_MODEL } from '@/types/settings'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    schemaVersion: 1,
    personal: { fullName: 'Jana Nováková', title: 'Senior Engineer', location: 'Prague', email: '', phone: '', linkedIn: '', github: '' },
    experience: [
      { id: 'exp-1', company: 'Acme Corp', position: 'Software Engineer', location: 'Prague', startDate: '2020-01', endDate: null, description: 'Built TypeScript APIs and Vue dashboards.' },
    ],
    projects: [
      { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: '', startDate: '2022-06', endDate: '2023-01', description: 'Rust-based structured logging library.' },
    ],
    education: [],
    languages: [{ id: 'lang-1', language: 'Czech', proficiency: 'Native' }],
    generalNotes: 'Available immediately. Prefer remote.',
    ...overrides,
  }
}

function makeSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return { openaiApiKey: 'sk-test-key', openaiModel: DEFAULT_OPENAI_MODEL, hasAcknowledgedAiPrivacy: true, ...overrides }
}

const JOB_DESC = 'We are looking for a TypeScript engineer with Vue.js experience. Must have 3+ years of frontend development.'

function makeValidAnalysis(): JobAnalysis {
  return {
    job: { title: 'TypeScript Engineer', company: 'TechCo', language: 'en', seniority: 'Senior', summary: 'Frontend role.' },
    requirements: [
      { id: 'req-1', requirement: 'TypeScript', priority: 'required', category: 'technical' },
      { id: 'req-2', requirement: 'Vue.js', priority: 'required', category: 'technical' },
      { id: 'req-3', requirement: 'Kubernetes', priority: 'preferred', category: 'technical' },
    ],
    matches: [
      { requirementId: 'req-1', status: 'supported', explanation: 'Profile shows TS experience.', evidence: [{ sourceType: 'experience', sourceId: 'exp-1', supportingExcerpt: 'Built TypeScript APIs' }] },
      { requirementId: 'req-2', status: 'partial', explanation: 'Vue mentioned but limited detail.', evidence: [{ sourceType: 'experience', sourceId: 'exp-1', supportingExcerpt: 'Vue dashboards' }] },
      { requirementId: 'req-3', status: 'unsupported', explanation: 'No Kubernetes evidence.', evidence: [] },
    ],
    relevantExperience: [{ sourceType: 'experience', sourceId: 'exp-1', relevanceReason: 'Direct frontend experience.' }],
    recommendations: [
      { category: 'application_strategy', text: 'Highlight TypeScript proficiency in your summary.' },
      { category: 'profile_improvement', text: 'Add quantitative metrics to your Acme Corp description.' },
    ],
  }
}

function makeApiResponse(analysis: JobAnalysis) {
  return {
    id: 'resp-123',
    status: 'completed',
    model: DEFAULT_OPENAI_MODEL,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(analysis) }],
      },
    ],
  }
}

function mockFetch(response: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
  }))
}

// ── analyzeJob integration tests ──────────────────────────────────────────────

describe('analyzeJob — input validation', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws NO_API_KEY when key is empty', async () => {
    const settings = makeSettings({ openaiApiKey: '' })
    await expect(analyzeJob(JOB_DESC, makeProfile(), settings)).rejects.toMatchObject({ code: 'NO_API_KEY' })
  })

  it('throws NO_API_KEY when key is whitespace only', async () => {
    const settings = makeSettings({ openaiApiKey: '   ' })
    await expect(analyzeJob(JOB_DESC, makeProfile(), settings)).rejects.toMatchObject({ code: 'NO_API_KEY' })
  })

  it('throws EMPTY_JOB when job description is empty', async () => {
    await expect(analyzeJob('', makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'EMPTY_JOB' })
  })

  it('throws EMPTY_JOB when job description is whitespace only', async () => {
    await expect(analyzeJob('   ', makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'EMPTY_JOB' })
  })

  it('throws EMPTY_PROFILE when profile has no data', async () => {
    const emptyProfile = makeProfile({
      personal: { fullName: '', title: '', location: '', email: '', phone: '', linkedIn: '', github: '' },
      experience: [],
      projects: [],
      education: [],
      languages: [],
      generalNotes: '',
    })
    await expect(analyzeJob(JOB_DESC, emptyProfile, makeSettings())).rejects.toMatchObject({ code: 'EMPTY_PROFILE' })
  })
})

describe('analyzeJob — HTTP error mapping', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws INVALID_API_KEY on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: { code: 'invalid_api_key', message: 'Bad key' } }),
    }))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'INVALID_API_KEY' })
  })

  it('throws QUOTA_EXCEEDED on insufficient_quota error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: { code: 'insufficient_quota', message: 'Quota exceeded' } }),
    }))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })

  it('throws RATE_LIMITED on 429 without quota code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: { code: 'rate_limit_exceeded', message: 'Rate limited' } }),
    }))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('throws MODEL_NOT_FOUND on model_not_found error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404,
      json: () => Promise.resolve({ error: { code: 'model_not_found', message: 'Unknown model' } }),
    }))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
  })

  it('throws API_ERROR on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    }))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'API_ERROR' })
  })

  it('throws NETWORK_ERROR on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('throws REQUEST_ABORTED when AbortController aborts', async () => {
    const ctrl = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    ctrl.abort()
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings(), ctrl.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })
})

describe('analyzeJob — response parsing', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns ValidatedAnalysis on valid response', async () => {
    const analysis = makeValidAnalysis()
    mockFetch(makeApiResponse(analysis))
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
    expect(result.analysis.matches).toHaveLength(3)
  })

  it('throws RESPONSE_INCOMPLETE when status is incomplete', async () => {
    const response = { id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL, output: [] }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INCOMPLETE' })
  })

  it('throws RESPONSE_INVALID when status is unexpected', async () => {
    const response = { id: 'r', status: 'in_progress', model: DEFAULT_OPENAI_MODEL, output: [] }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws RESPONSE_INVALID when output has no text', async () => {
    const response = { id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL, output: [] }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws RESPONSE_INVALID when text is not valid JSON', async () => {
    const response = {
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws SCHEMA_VIOLATION when JSON does not match schema', async () => {
    const response = {
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ not: 'valid' }) }] }],
    }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({ code: 'SCHEMA_VIOLATION' })
  })
})

describe('analyzeJob — Czech Unicode content', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('handles Czech job description and profile correctly', async () => {
    const czechJob = 'Hledáme zkušeného vývojáře TypeScript s praxí ve Vue.js a REST API. Požadujeme 3+ roky zkušeností v oblasti frontendu.'
    const czechProfile = makeProfile({
      personal: { fullName: 'Tomáš Dvořák', title: 'Senior Vývojář', location: 'Brno', email: '', phone: '', linkedIn: '', github: '' },
      experience: [{ id: 'exp-cz', company: 'Česká Firma', position: 'Vývojář', location: 'Brno', startDate: '2019-01', endDate: null, description: 'Vývoj TypeScript aplikací a Vue.js rozhraní.' }],
    })
    const czechAnalysis = makeValidAnalysis()
    czechAnalysis.job.language = 'cs'
    mockFetch(makeApiResponse(czechAnalysis))
    const result = await analyzeJob(czechJob, czechProfile, makeSettings())
    expect(result.analysis.job.language).toBe('cs')
  })
})

// ── parseAndValidateAnalysis unit tests ───────────────────────────────────────

describe('parseAndValidateAnalysis', () => {
  it('returns typed JobAnalysis for valid data', () => {
    const result = parseAndValidateAnalysis(makeValidAnalysis())
    expect(result.job.title).toBe('TypeScript Engineer')
  })

  it('throws for missing job object', () => {
    expect(() => parseAndValidateAnalysis({ requirements: [], matches: [], relevantExperience: [], recommendations: [] })).toThrow()
  })

  it('throws for invalid language enum', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.job.language = 'fr'
    expect(() => parseAndValidateAnalysis(bad)).toThrow(/language/)
  })

  it('throws for invalid match status', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.matches[0].status = 'maybe'
    expect(() => parseAndValidateAnalysis(bad)).toThrow(/status/)
  })

  it('throws for invalid requirement priority', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.requirements[0].priority = 'optional'
    expect(() => parseAndValidateAnalysis(bad)).toThrow(/priority/)
  })

  it('throws for recommendation that is not an object', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.recommendations = ['Highlight TypeScript']
    expect(() => parseAndValidateAnalysis(bad)).toThrow()
  })

  it('throws for recommendation with invalid category', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.recommendations = [{ category: 'invalid_category', text: 'Some advice' }]
    expect(() => parseAndValidateAnalysis(bad)).toThrow(/category/)
  })

  it('throws for recommendation with missing text', () => {
    const bad = makeValidAnalysis()
    // @ts-expect-error intentional
    bad.recommendations = [{ category: 'application_strategy' }]
    expect(() => parseAndValidateAnalysis(bad)).toThrow(/text/)
  })

  it('accepts empty recommendations array', () => {
    const analysis = makeValidAnalysis()
    analysis.recommendations = []
    const result = parseAndValidateAnalysis(analysis)
    expect(result.recommendations).toHaveLength(0)
  })

  it('accepts valid application_strategy recommendation', () => {
    const analysis = makeValidAnalysis()
    analysis.recommendations = [{ category: 'application_strategy', text: 'Emphasise TypeScript.' }]
    const result = parseAndValidateAnalysis(analysis)
    expect(result.recommendations[0]?.category).toBe('application_strategy')
    expect(result.recommendations[0]?.text).toBe('Emphasise TypeScript.')
  })

  it('accepts valid profile_improvement recommendation', () => {
    const analysis = makeValidAnalysis()
    analysis.recommendations = [{ category: 'profile_improvement', text: 'Add metrics to experience.' }]
    const result = parseAndValidateAnalysis(analysis)
    expect(result.recommendations[0]?.category).toBe('profile_improvement')
  })

  it('accepts mixed recommendation categories', () => {
    const analysis = makeValidAnalysis()
    analysis.recommendations = [
      { category: 'application_strategy', text: 'Lead with TypeScript experience.' },
      { category: 'profile_improvement', text: 'Add a GitHub link.' },
    ]
    const result = parseAndValidateAnalysis(analysis)
    expect(result.recommendations).toHaveLength(2)
    expect(result.recommendations[0]?.category).toBe('application_strategy')
    expect(result.recommendations[1]?.category).toBe('profile_improvement')
  })
})

// ── verifyAnalysis unit tests ─────────────────────────────────────────────────

describe('verifyAnalysis', () => {
  it('returns empty issues for a valid analysis', () => {
    const result = verifyAnalysis(makeValidAnalysis(), makeProfile())
    expect(result.issues).toHaveLength(0)
  })

  it('flags invalid experience source ID', () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].evidence[0].sourceId = 'exp-nonexistent'
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'invalid-source-id')).toBe(true)
  })

  it('flags invalid requirement reference in match', () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].requirementId = 'req-nonexistent'
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'invalid-requirement-ref')).toBe(true)
  })

  it('flags duplicate requirement IDs', () => {
    const analysis = makeValidAnalysis()
    analysis.requirements.push({ id: 'req-1', requirement: 'Duplicate', priority: 'preferred', category: 'other' })
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'duplicate-requirement-id')).toBe(true)
  })

  it('flags unexpected non-null sourceId for generalNotes evidence', () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].evidence.push({ sourceType: 'generalNotes', sourceId: 'exp-1', supportingExcerpt: 'excerpt' })
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'unexpected-null-source-id')).toBe(true)
  })

  it('flags invalid project source ID in relevantExperience', () => {
    const analysis = makeValidAnalysis()
    analysis.relevantExperience.push({ sourceType: 'project', sourceId: 'proj-nonexistent', relevanceReason: 'reason' })
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'invalid-source-id')).toBe(true)
  })

  it('flags empty supporting excerpt', () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].evidence[0].supportingExcerpt = '  '
    const result = verifyAnalysis(analysis, makeProfile())
    expect(result.issues.some((i) => i.type === 'empty-excerpt')).toBe(true)
  })
})

// ── buildUserMessage unit tests ───────────────────────────────────────────────

describe('buildUserMessage', () => {
  it('wraps job description in XML-like tags', () => {
    const msg = buildUserMessage(JOB_DESC, makeProfile())
    expect(msg).toContain('<JOB_VACANCY_DATA>')
    expect(msg).toContain('</JOB_VACANCY_DATA>')
    expect(msg).toContain(JOB_DESC)
  })

  it('wraps profile in XML-like tags', () => {
    const msg = buildUserMessage(JOB_DESC, makeProfile())
    expect(msg).toContain('<CANDIDATE_PROFILE_DATA>')
    expect(msg).toContain('</CANDIDATE_PROFILE_DATA>')
  })

  it('prefixes experience entries with EXP-ID tags', () => {
    const msg = buildUserMessage(JOB_DESC, makeProfile())
    expect(msg).toContain('[EXP-ID: exp-1]')
  })

  it('prefixes project entries with PROJ-ID tags', () => {
    const msg = buildUserMessage(JOB_DESC, makeProfile())
    expect(msg).toContain('[PROJ-ID: proj-1]')
  })

  it('includes general notes', () => {
    const msg = buildUserMessage(JOB_DESC, makeProfile())
    expect(msg).toContain('Available immediately')
  })
})

// ── buildSystemPrompt unit tests ──────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('instructs the model not to invent experience', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('NEVER invent')
  })

  it('instructs the model to treat vacancy as source data', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('source data')
  })

  it('instructs unsupported matches to have empty evidence', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('evidence array MUST be empty')
  })
})

// ── isAnalysisError type guard ────────────────────────────────────────────────

describe('isAnalysisError', () => {
  it('returns true for an object with code and message strings', () => {
    expect(isAnalysisError({ code: 'NO_API_KEY', message: 'Missing key' })).toBe(true)
  })

  it('returns false for a plain Error', () => {
    expect(isAnalysisError(new Error('oops'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAnalysisError(null)).toBe(false)
  })

  it('returns false for missing message', () => {
    expect(isAnalysisError({ code: 'NO_API_KEY' })).toBe(false)
  })
})

// ── Regression tests: real API response shape ─────────────────────────────────

function makeEbayProfile(): MasterProfile {
  return {
    schemaVersion: 1,
    personal: { fullName: 'Ivan M.', title: 'Frontend Developer', location: 'Prague', email: '', phone: '', linkedIn: '', github: '' },
    experience: [
      { id: 'exp-ebay-1', company: 'eBay', position: 'Frontend Developer', location: 'Prague', startDate: '2025-05', endDate: null, description: 'FreeMarker templates, API integrations, personalized customer communications. Collaborated with Product, Design and QA.' },
    ],
    projects: [],
    education: [],
    languages: [{ id: 'lang-cs', language: 'Czech', proficiency: 'Native' }],
    generalNotes: '',
  }
}

function makeAllUnsupportedAnalysis(): JobAnalysis {
  return {
    job: { title: 'Senior React Developer', company: 'TechCorp s.r.o.', language: 'cs', seniority: 'Senior', summary: 'React vývoj pro e-commerce.' },
    requirements: [
      { id: 'req-1', requirement: 'React', priority: 'required', category: 'technical' },
      { id: 'req-2', requirement: 'GraphQL', priority: 'required', category: 'technical' },
      { id: 'req-3', requirement: '5+ years React', priority: 'required', category: 'experience' },
    ],
    matches: [
      { requirementId: 'req-1', status: 'unsupported', explanation: 'Profile does not mention React.', evidence: [] },
      { requirementId: 'req-2', status: 'unsupported', explanation: 'No GraphQL evidence in profile.', evidence: [] },
      { requirementId: 'req-3', status: 'unsupported', explanation: 'eBay experience does not cover React.', evidence: [] },
    ],
    relevantExperience: [],
    recommendations: [
      { category: 'profile_improvement', text: 'Consider documenting any React exposure in side projects.' },
      { category: 'profile_improvement', text: 'Build a GraphQL project to demonstrate the skill.' },
    ],
  }
}

describe('analyzeJob — real API response shape regression', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('processes all-unsupported analysis with empty evidence arrays and empty relevantExperience', async () => {
    const analysis = makeAllUnsupportedAnalysis()
    // Real response shape: output[0] has a "status" field alongside type and content
    const realShapeResponse = {
      id: 'resp-real-001',
      status: 'completed',
      error: null,
      model: 'gpt-5.4-mini-2026-03-17',
      output: [
        {
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(analysis) }],
        },
      ],
    }
    mockFetch(realShapeResponse)
    const result = await analyzeJob(JOB_DESC, makeEbayProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('Senior React Developer')
    expect(result.analysis.matches).toHaveLength(3)
    expect(result.analysis.matches.every((m) => m.status === 'unsupported')).toBe(true)
    expect(result.analysis.matches.every((m) => m.evidence.length === 0)).toBe(true)
    expect(result.analysis.relevantExperience).toHaveLength(0)
    expect(result.issues).toHaveLength(0)
  })

  it('processes all-unsupported analysis with one experience entry in profile', async () => {
    const analysis = makeAllUnsupportedAnalysis()
    mockFetch(makeApiResponse(analysis))
    const result = await analyzeJob(JOB_DESC, makeEbayProfile(), makeSettings())
    expect(result.analysis.matches).toHaveLength(3)
    expect(result.issues).toHaveLength(0)
  })

  it('buildUserMessage includes EXP-ID tag for eBay experience', () => {
    const msg = buildUserMessage(JOB_DESC, makeEbayProfile())
    expect(msg).toContain('[EXP-ID: exp-ebay-1]')
    expect(msg).toContain('eBay')
    expect(msg).toContain('FreeMarker')
  })

  it('throws RESPONSE_INVALID when output array is empty', async () => {
    const response = { id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL, output: [] }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeEbayProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws RESPONSE_INVALID when output contains only a refusal item', async () => {
    const response = {
      id: 'r',
      status: 'completed',
      model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'refusal', refusal: 'I cannot analyze this job posting.' }],
    }
    mockFetch(response)
    await expect(analyzeJob(JOB_DESC, makeEbayProfile(), makeSettings())).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('converts unexpected TypeError from corrupted profile to API_ERROR', async () => {
    // Simulate a profile where arrays are null — as if loaded from corrupted storage
    // that was not normalized by profileService. The master catch-all must handle this.
    const corruptedProfile = {
      schemaVersion: 1 as const,
      personal: { fullName: 'Ivan M.', title: 'Dev', location: '', email: '', phone: '', linkedIn: '', github: '' },
      experience: null,
      projects: [],
      education: [],
      languages: [],
      generalNotes: '',
    } as unknown as MasterProfile

    mockFetch(makeApiResponse(makeValidAnalysis()))
    await expect(analyzeJob(JOB_DESC, corruptedProfile, makeSettings())).rejects.toMatchObject({ code: 'API_ERROR' })
  })
})

// ── buildApplicationUserMessage — recommendation inclusion/exclusion ──────────

function makeValidatedAnalysis(overrides: Partial<JobAnalysis> = {}): ValidatedAnalysis {
  return { analysis: { ...makeValidAnalysis(), ...overrides }, issues: [] }
}

describe('buildApplicationUserMessage — application strategy recommendations', () => {
  it('includes application_strategy recommendations in the message', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [{ category: 'application_strategy', text: 'Lead with TypeScript experience.' }],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).toContain('Lead with TypeScript experience.')
    expect(msg).toContain('Application strategy guidance')
  })

  it('excludes profile_improvement recommendations from the message', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [{ category: 'profile_improvement', text: 'Add a GitHub link to your profile.' }],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).not.toContain('Add a GitHub link')
  })

  it('includes strategy recs but not profile recs when both are present', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [
        { category: 'application_strategy', text: 'Emphasise Vue.js dashboards.' },
        { category: 'profile_improvement', text: 'Document metrics in experience.' },
      ],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).toContain('Emphasise Vue.js dashboards.')
    expect(msg).not.toContain('Document metrics in experience.')
  })

  it('omits the strategy guidance block entirely when no application_strategy recs exist', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [{ category: 'profile_improvement', text: 'Some profile tip.' }],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).not.toContain('Application strategy guidance')
  })

  it('omits the strategy guidance block when recommendations array is empty', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({ recommendations: [] })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).not.toContain('Application strategy guidance')
  })

  it('includes multiple application_strategy recommendations as separate bullets', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [
        { category: 'application_strategy', text: 'Open with TypeScript API work.' },
        { category: 'application_strategy', text: 'Mention Vue.js migration project.' },
      ],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).toContain('Open with TypeScript API work.')
    expect(msg).toContain('Mention Vue.js migration project.')
  })

  it('still includes supported requirement matches when strategy recs are present', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [{ category: 'application_strategy', text: 'Highlight TypeScript.' }],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    expect(msg).toContain('Supported requirements')
    expect(msg).toContain('TypeScript')
  })

  it('strategy guidance block appears inside <JOB_ANALYSIS> block', () => {
    const profile = makeProfile()
    const analysis = makeValidatedAnalysis({
      recommendations: [{ category: 'application_strategy', text: 'Lead with open-source project.' }],
    })
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en', buildSourceTokenMap(profile))
    const stratStart = msg.indexOf('Application strategy guidance')
    const jobAnalysisClose = msg.indexOf('</JOB_ANALYSIS>')
    expect(stratStart).toBeGreaterThan(-1)
    expect(stratStart).toBeLessThan(jobAnalysisClose)
  })
})

// ── buildSystemPrompt (analysis) — recommendation categories ──────────────────

describe('buildSystemPrompt — recommendations', () => {
  it('instructs on application_strategy category', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('application_strategy')
  })

  it('instructs on profile_improvement category', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('profile_improvement')
  })

  it('instructs that strategy recs must not recommend inventing skills', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('NEVER recommend claiming skills')
  })
})

// ── buildApplicationSystemPrompt — recommendation grounding rules ─────────────

describe('buildApplicationSystemPrompt — recommendation constraints', () => {
  it('states that recommendations are advisory only', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('advisory')
  })

  it('states that Master Profile is the only factual source', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('Master Profile')
    expect(prompt).toContain('factual source')
  })

  it('instructs never to add skills based solely on a recommendation', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('solely on a recommendation')
  })

  it('instructs not to quote recommendations verbatim', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('Never quote recommendations verbatim')
  })
})

// ── Stale analysis seq guard ──────────────────────────────────────────────────

describe('analysisSeq stale-result prevention pattern', () => {
  it('a result from a cancelled analysis is correctly identified as stale', () => {
    let analysisSeq = 0
    const captureSeq = (): number => ++analysisSeq

    const seq1 = captureSeq() // first analysis starts

    // User clicks Analyze again — new seq
    const _seq2 = captureSeq()

    // First analysis resolves late — stale
    expect(seq1 !== analysisSeq).toBe(true)
  })

  it('the most recently started analysis is never stale when it resolves last', () => {
    let analysisSeq = 0
    const captureSeq = (): number => ++analysisSeq

    captureSeq()
    const seq2 = captureSeq()

    expect(seq2 !== analysisSeq).toBe(false)
  })
})

// ── analyzeJob — model-aware token budgets ────────────────────────────────────

describe('analyzeJob — model-aware token budgets', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sends max_output_tokens: 6144 for a standard model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-4o-mini' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.max_output_tokens).toBe(6144)
  })

  it('sends max_output_tokens: 8192 for a reasoning model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-6.1-terra' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.max_output_tokens).toBe(8192)
  })

  it('sends reasoning.effort: "low" for a reasoning model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-6.1-terra' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.reasoning).toEqual({ effort: 'low' })
  })

  it('does not send temperature for a reasoning model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-6.1-terra' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect('temperature' in body).toBe(false)
  })

  it('sends temperature: 0.2 for a standard model', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-4o-mini' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.temperature).toBe(0.2)
  })
})

// ── analyzeJob — incomplete response reason handling ──────────────────────────

describe('analyzeJob — incomplete response reason', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws RESPONSE_INCOMPLETE with token-limit message when reason is max_output_tokens', async () => {
    mockFetch({
      id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL,
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
      usage: { input_tokens: 3000, output_tokens: 6144, total_tokens: 9144 },
    })
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INCOMPLETE',
      message: expect.stringContaining('output token limit'),
    })
  })

  it('throws RESPONSE_INCOMPLETE with generic message when reason is content_filter', async () => {
    mockFetch({
      id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL,
      incomplete_details: { reason: 'content_filter' },
      output: [],
    })
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INCOMPLETE',
      message: expect.stringContaining('content_filter'),
    })
  })

  it('throws RESPONSE_INCOMPLETE with generic message when reason is unknown', async () => {
    mockFetch({
      id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL,
      incomplete_details: { reason: 'some_new_reason' },
      output: [],
    })
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INCOMPLETE',
      message: expect.stringContaining('some_new_reason'),
    })
  })

  it('throws RESPONSE_INCOMPLETE when incomplete_details is absent', async () => {
    mockFetch({ id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL, output: [] })
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INCOMPLETE',
    })
  })

  it('error message does not expose input tokens or personal data', async () => {
    mockFetch({
      id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL,
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
      usage: { input_tokens: 55000, output_tokens: 6144, total_tokens: 61144 },
    })
    await expect(analyzeJob(JOB_DESC, makeProfile(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INCOMPLETE',
      message: expect.not.stringContaining('55000'),
    })
  })
})

// ── analyzeJob — usage fields and reasoning tokens ────────────────────────────

describe('analyzeJob — usage fields', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('succeeds when usage is absent from the response', async () => {
    const response = {
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(makeValidAnalysis()) }] }],
      // no usage field
    }
    mockFetch(response)
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
  })

  it('succeeds when output_tokens_details is absent', async () => {
    const response = {
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(makeValidAnalysis()) }] }],
      usage: { input_tokens: 1200, output_tokens: 980, total_tokens: 2180 },
      // no output_tokens_details
    }
    mockFetch(response)
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
  })

  it('succeeds when reasoning_tokens is present', async () => {
    const response = {
      id: 'r', status: 'completed', model: 'gpt-6.1-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(makeValidAnalysis()) }] }],
      usage: {
        input_tokens: 1500,
        output_tokens: 2048,
        total_tokens: 3548,
        output_tokens_details: { reasoning_tokens: 768 },
      },
    }
    mockFetch(response)
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings({ openaiModel: 'gpt-6.1-terra' }))
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
  })

  it('makes exactly one API call regardless of usage content', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        ...makeApiResponse(makeValidAnalysis()),
        usage: { input_tokens: 2000, output_tokens: 1500, total_tokens: 3500,
          output_tokens_details: { reasoning_tokens: 256 } },
      }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ── analyzeJob — large profile ────────────────────────────────────────────────

describe('analyzeJob — large profile', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  function makeLargeProfile(): MasterProfile {
    return makeProfile({
      experience: [
        { id: 'exp-1', company: 'TravelTech', position: 'Senior Software Engineer', location: 'Prague', startDate: '2021-03', endDate: null, description: 'Led development of a distributed booking system handling 50k daily reservations. Built TypeScript/Node.js microservices, Vue 3 frontend, PostgreSQL and Redis datastores. Responsible for CI/CD pipelines using GitHub Actions and Docker. Mentored two junior developers. Implemented PCI-DSS compliance for payment flows. Reduced API latency by 40% through query optimisation and caching strategies.' },
        { id: 'exp-2', company: 'LogisticsPlus', position: 'Full-stack Developer', location: 'Brno', startDate: '2018-06', endDate: '2021-02', description: 'Developed fleet tracking dashboard using React and Express.js. Integrated real-time GPS feeds via WebSockets. Built RESTful API consumed by mobile teams. Wrote comprehensive integration tests with Jest.' },
        { id: 'exp-3', company: 'StartupX', position: 'Frontend Developer', location: 'Prague', startDate: '2016-01', endDate: '2018-05', description: 'Built marketing landing pages and admin portals using Angular and Bootstrap. Collaborated with UX designers to implement pixel-perfect components. Performance optimisation using Lighthouse audits.' },
      ],
      projects: [
        { id: 'proj-1', name: 'OpenMetrics', role: 'Lead', url: 'https://github.com/jan/openmetrics', startDate: '2022-01', endDate: null, description: 'Open source Prometheus-compatible metrics aggregation library in Go. 400+ GitHub stars. Implements histogram, gauge, and counter types with label support.' },
        { id: 'proj-2', name: 'VueCRUD', role: 'Author', url: '', startDate: '2020-06', endDate: '2021-06', description: 'Vue 3 composable library for CRUD operations against REST APIs. Used in 3 production projects.' },
      ],
      education: [
        { id: 'edu-1', institution: 'Czech Technical University in Prague', degree: 'Bachelor of Science', field: 'Computer Science', startDate: '2012-09', endDate: '2016-06', description: 'Specialisation in distributed systems and software engineering.' },
      ],
      languages: [
        { id: 'lang-1', language: 'Czech', proficiency: 'Native' },
        { id: 'lang-2', language: 'English', proficiency: 'C1' },
        { id: 'lang-3', language: 'German', proficiency: 'B1' },
      ],
      generalNotes: 'Open to relocation to Berlin or Vienna. Active open-source contributor. Speaker at DevConf.cz 2023 on microservices observability.',
    })
  }

  it('passes the large profile to the API without truncation or error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await analyzeJob(JOB_DESC, makeLargeProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('includes all profile experience entries in the user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidAnalysis())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await analyzeJob(JOB_DESC, makeLargeProfile(), makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    const content: string = body.input[0].content
    expect(content).toContain('TravelTech')
    expect(content).toContain('LogisticsPlus')
    expect(content).toContain('StartupX')
  })

  it('source ID validation still works for a large profile', async () => {
    const analysis = makeValidAnalysis()
    // Add valid evidence pointing to a large-profile experience entry
    analysis.matches[0].evidence = [{
      sourceType: 'experience', sourceId: 'exp-2', supportingExcerpt: 'fleet tracking dashboard',
    }]
    mockFetch(makeApiResponse(analysis))
    const result = await analyzeJob(JOB_DESC, makeLargeProfile(), makeSettings())
    expect(result.issues.some((i) => i.type === 'invalid-source-id')).toBe(false)
  })
})

// ── analyzeJob — no silent requirement loss ───────────────────────────────────

describe('analyzeJob — source ID validation preserved', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('flags evidence referencing a non-existent experience ID', async () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].evidence = [{
      sourceType: 'experience', sourceId: 'exp-nonexistent', supportingExcerpt: 'some excerpt',
    }]
    mockFetch(makeApiResponse(analysis))
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(result.issues.some((i) => i.type === 'invalid-source-id')).toBe(true)
  })

  it('does not throw on source ID issues — returns issues array instead', async () => {
    const analysis = makeValidAnalysis()
    analysis.matches[0].evidence = [{
      sourceType: 'experience', sourceId: 'exp-nonexistent', supportingExcerpt: 'excerpt',
    }]
    mockFetch(makeApiResponse(analysis))
    const result = await analyzeJob(JOB_DESC, makeProfile(), makeSettings())
    expect(result.analysis.job.title).toBe('TypeScript Engineer')
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

// ── buildSystemPrompt — conciseness rules ─────────────────────────────────────

describe('buildSystemPrompt — output conciseness rules', () => {
  it('instructs the model to keep explanations to 1–2 sentences', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('1–2 sentences')
  })

  it('instructs the model to limit supportingExcerpt to 25 words', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('25 words')
  })

  it('instructs the model to extract at most 15 requirements', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('15')
  })

  it('instructs the model to provide at most 2 evidence items per match', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('2 evidence items')
  })

  it('still instructs the model to use exact source IDs', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('EXACT source ID')
  })

  it('still instructs the model never to invent anything', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('NEVER invent')
  })
})
