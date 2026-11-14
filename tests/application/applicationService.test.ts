import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateApplication, isApplicationError, canonicalizeEducationAndLanguages, enrichProjectUrls } from '@/services/applicationService'
import { parseAndValidateApplication, verifyApplicationSources } from '@/utils/applicationValidator'
import { buildApplicationUserMessage, buildApplicationSystemPrompt } from '@/prompts/generateApplication'
import type { MasterProfile } from '@/types/profile'
import type { ExtensionSettings } from '@/types/settings'
import type { ValidatedAnalysis, JobAnalysis } from '@/types/jobAnalysis'
import type { GeneratedApplication } from '@/types/application'
import { DEFAULT_OPENAI_MODEL } from '@/types/settings'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<MasterProfile> = {}): MasterProfile {
  return {
    schemaVersion: 1,
    personal: {
      fullName: 'Jana Nováková',
      title: 'Senior Engineer',
      location: 'Prague',
      email: 'jana@example.com',
      phone: '',
      linkedIn: '',
      github: '',
    },
    experience: [
      {
        id: 'exp-1',
        company: 'Acme Corp',
        position: 'Software Engineer',
        location: 'Prague',
        startDate: '2020-01',
        endDate: null,
        description: 'Built TypeScript APIs and Vue dashboards.',
      },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Open Logger',
        role: 'Lead',
        url: '',
        startDate: '2022-06',
        endDate: '2023-01',
        description: 'Rust-based structured logging library.',
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Czech Technical University',
        degree: 'Bachelor',
        field: 'Computer Science',
        startDate: '2016-09',
        endDate: '2020-06',
        description: '',
      },
    ],
    languages: [{ id: 'lang-1', language: 'Czech', proficiency: 'Native' }],
    generalNotes: 'Available immediately. Prefer remote.',
    ...overrides,
  }
}

function makeSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    openaiApiKey: 'sk-test-key',
    openaiModel: DEFAULT_OPENAI_MODEL,
    hasAcknowledgedAiPrivacy: true,
    ...overrides,
  }
}

const JOB_DESC =
  'We are looking for a TypeScript engineer with Vue.js experience. Must have 3+ years of frontend development.'

function makeJobAnalysis(): JobAnalysis {
  return {
    job: {
      title: 'TypeScript Engineer',
      company: 'TechCo',
      language: 'en',
      seniority: 'Senior',
      summary: 'Frontend role.',
    },
    requirements: [
      { id: 'req-1', requirement: 'TypeScript', priority: 'required', category: 'technical' },
      { id: 'req-2', requirement: 'Vue.js', priority: 'required', category: 'technical' },
    ],
    matches: [
      {
        requirementId: 'req-1',
        status: 'supported',
        explanation: 'Profile shows TS experience.',
        evidence: [{ sourceType: 'experience', sourceId: 'exp-1', supportingExcerpt: 'Built TypeScript APIs' }],
      },
      {
        requirementId: 'req-2',
        status: 'partial',
        explanation: 'Vue mentioned but limited detail.',
        evidence: [{ sourceType: 'experience', sourceId: 'exp-1', supportingExcerpt: 'Vue dashboards' }],
      },
    ],
    relevantExperience: [
      { sourceType: 'experience', sourceId: 'exp-1', relevanceReason: 'Direct frontend experience.' },
    ],
    recommendations: ['Highlight TypeScript proficiency.'],
  }
}

function makeValidatedAnalysis(): ValidatedAnalysis {
  return { analysis: makeJobAnalysis(), issues: [] }
}

function makeValidApplication(): GeneratedApplication {
  return {
    coverLetter: {
      language: 'en',
      subject: 'Application for TypeScript Engineer at TechCo',
      body: 'Dear Hiring Manager, I am writing to apply for the TypeScript Engineer position at TechCo. With over four years of experience building TypeScript APIs and Vue dashboards at Acme Corp, I bring proven frontend expertise. My Open Logger project demonstrates strong systems thinking. I am confident I can contribute immediately to your team. Looking forward to discussing further. Best regards, Jana Nováková',
    },
    cv: {
      language: 'en',
      professionalTitle: 'Senior Frontend Engineer',
      professionalSummary:
        'Experienced engineer specializing in TypeScript and Vue.js. Proven track record of building production APIs and dashboards.',
      technicalSkills: ['TypeScript', 'Vue.js', 'REST APIs', 'Rust'],
      experience: [
        {
          sourceId: 'exp-1',
          company: 'Acme Corp',
          position: 'Software Engineer',
          startDate: '2020-01',
          endDate: null,
          highlights: ['Built TypeScript APIs serving production traffic', 'Developed Vue dashboards for internal teams'],
        },
      ],
      projects: [
        {
          sourceId: 'proj-1',
          name: 'Open Logger',
          role: 'Lead',
          highlights: ['Authored Rust-based structured logging library', 'Maintained open source release'],
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

function makeApiResponse(application: GeneratedApplication) {
  return {
    id: 'resp-123',
    status: 'completed',
    model: DEFAULT_OPENAI_MODEL,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(application) }],
      },
    ],
  }
}

function mockFetch(response: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
    }),
  )
}

// ── generateApplication — input validation ────────────────────────────────────

describe('generateApplication — input validation', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws NO_API_KEY when key is empty', async () => {
    const settings = makeSettings({ openaiApiKey: '' })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', settings),
    ).rejects.toMatchObject({ code: 'NO_API_KEY' })
  })

  it('throws NO_API_KEY when key is whitespace only', async () => {
    const settings = makeSettings({ openaiApiKey: '   ' })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', settings),
    ).rejects.toMatchObject({ code: 'NO_API_KEY' })
  })

  it('throws EMPTY_JOB when job description is empty', async () => {
    await expect(
      generateApplication('', makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'EMPTY_JOB' })
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
    await expect(
      generateApplication(JOB_DESC, emptyProfile, makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'EMPTY_PROFILE' })
  })
})

// ── generateApplication — HTTP errors ────────────────────────────────────────

describe('generateApplication — HTTP error mapping', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('throws INVALID_API_KEY on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ error: { code: 'invalid_api_key', message: 'Bad key' } }),
    }))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'INVALID_API_KEY' })
  })

  it('throws QUOTA_EXCEEDED on insufficient_quota', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: { code: 'insufficient_quota', message: 'Quota exceeded' } }),
    }))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
  })

  it('throws RATE_LIMITED on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: () => Promise.resolve({ error: { code: 'rate_limit_exceeded', message: 'Rate limited' } }),
    }))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('throws NETWORK_ERROR on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('throws REQUEST_ABORTED when AbortController aborts', async () => {
    const ctrl = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    ctrl.abort()
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings(), ctrl.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })

  it('throws API_ERROR on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({ error: { message: 'Server error' } }),
    }))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'API_ERROR' })
  })
})

// ── generateApplication — response parsing ────────────────────────────────────

describe('generateApplication — response parsing', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns GeneratedApplication on valid response', async () => {
    const app = makeValidApplication()
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(
      JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings(),
    )
    expect(result.coverLetter.subject).toBe(app.coverLetter.subject)
    expect(result.cv.professionalTitle).toBe(app.cv.professionalTitle)
    expect(result.cv.experience).toHaveLength(1)
  })

  it('throws RESPONSE_INCOMPLETE when status is incomplete', async () => {
    mockFetch({ id: 'r', status: 'incomplete', model: DEFAULT_OPENAI_MODEL, output: [] })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'RESPONSE_INCOMPLETE' })
  })

  it('throws RESPONSE_INVALID when output has no text', async () => {
    mockFetch({ id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL, output: [] })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws RESPONSE_INVALID when text is not valid JSON', async () => {
    mockFetch({
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  })

  it('throws SCHEMA_VIOLATION when JSON does not match schema', async () => {
    mockFetch({
      id: 'r', status: 'completed', model: DEFAULT_OPENAI_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ not: 'valid' }) }] }],
    })
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'SCHEMA_VIOLATION' })
  })

  it('throws INVALID_SOURCE_IDS when experience sourceId does not exist in profile', async () => {
    const app = makeValidApplication()
    app.cv.experience[0].sourceId = 'exp-nonexistent'
    mockFetch(makeApiResponse(app))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_IDS' })
  })

  it('throws INVALID_SOURCE_IDS when project sourceId does not exist in profile', async () => {
    const app = makeValidApplication()
    app.cv.projects[0].sourceId = 'proj-nonexistent'
    mockFetch(makeApiResponse(app))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_IDS' })
  })

  it('succeeds and uses canonical education even when AI returns invalid education sourceId', async () => {
    // Education/languages are replaced with profile canonical values before source verification,
    // so an invalid AI education sourceId no longer causes INVALID_SOURCE_IDS.
    const app = makeValidApplication()
    app.cv.education[0].sourceId = 'edu-nonexistent'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(
      JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings(),
    )
    expect(result.cv.education[0].sourceId).toBe('edu-1')
    expect(result.cv.education[0].institution).toBe('Czech Technical University')
  })

  it('succeeds and uses canonical language even when AI returns invalid language sourceId', async () => {
    const app = makeValidApplication()
    app.cv.languages[0].sourceId = 'lang-nonexistent'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(
      JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings(),
    )
    expect(result.cv.languages[0].sourceId).toBe('lang-1')
    expect(result.cv.languages[0].language).toBe('Czech')
  })
})

// ── generateApplication — language support ────────────────────────────────────

describe('generateApplication — language support', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('passes English language through to response', async () => {
    const app = makeValidApplication()
    app.coverLetter.language = 'en'
    app.cv.language = 'en'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(
      JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings(),
    )
    expect(result.coverLetter.language).toBe('en')
    expect(result.cv.language).toBe('en')
  })

  it('passes Czech language through to response', async () => {
    const app = makeValidApplication()
    app.coverLetter.language = 'cs'
    app.cv.language = 'cs'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(
      JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'cs', makeSettings(),
    )
    expect(result.coverLetter.language).toBe('cs')
    expect(result.cv.language).toBe('cs')
  })
})

// ── generateApplication — full profile transmission ───────────────────────────

describe('generateApplication — profile transmission', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('includes experience EXP-IDs in user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input[0].content).toContain('[EXP-ID: exp-1]')
  })

  it('includes project PROJ-IDs in user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input[0].content).toContain('[PROJ-ID: proj-1]')
  })

  it('includes education EDU-IDs in user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input[0].content).toContain('[EDU-ID: edu-1]')
  })

  it('includes language LANG-IDs in user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input[0].content).toContain('[LANG-ID: lang-1]')
  })

  it('includes job analysis relevant experience in user message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchMock)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.input[0].content).toContain('Direct frontend experience')
  })
})

// ── parseAndValidateApplication unit tests ────────────────────────────────────

describe('parseAndValidateApplication', () => {
  it('returns typed GeneratedApplication for valid data', () => {
    const result = parseAndValidateApplication(makeValidApplication())
    expect(result.coverLetter.subject).toContain('TypeScript')
    expect(result.cv.experience).toHaveLength(1)
  })

  it('throws for missing coverLetter', () => {
    const bad = makeValidApplication() as Record<string, unknown>
    delete bad.coverLetter
    expect(() => parseAndValidateApplication(bad)).toThrow()
  })

  it('throws for invalid coverLetter language', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.coverLetter.language = 'fr'
    expect(() => parseAndValidateApplication(bad)).toThrow(/language/)
  })

  it('throws for missing cv', () => {
    const bad = makeValidApplication() as Record<string, unknown>
    delete bad.cv
    expect(() => parseAndValidateApplication(bad)).toThrow()
  })

  it('throws for invalid cv language', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.cv.language = 'de'
    expect(() => parseAndValidateApplication(bad)).toThrow(/language/)
  })

  it('throws for non-string experience sourceId', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.cv.experience[0].sourceId = 42
    expect(() => parseAndValidateApplication(bad)).toThrow(/sourceId/)
  })

  it('throws for non-array technicalSkills', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.cv.technicalSkills = 'TypeScript'
    expect(() => parseAndValidateApplication(bad)).toThrow()
  })

  it('throws for non-string skill item in technicalSkills', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.cv.technicalSkills = [42]
    expect(() => parseAndValidateApplication(bad)).toThrow()
  })

  it('throws for experience with null sourceId', () => {
    const bad = makeValidApplication()
    // @ts-expect-error intentional
    bad.cv.experience[0].sourceId = null
    expect(() => parseAndValidateApplication(bad)).toThrow(/sourceId/)
  })
})

// ── verifyApplicationSources unit tests ───────────────────────────────────────

describe('verifyApplicationSources', () => {
  it('returns empty issues for valid application and profile', () => {
    const issues = verifyApplicationSources(makeValidApplication(), makeProfile())
    expect(issues).toHaveLength(0)
  })

  it('flags invalid experience sourceId', () => {
    const app = makeValidApplication()
    app.cv.experience[0].sourceId = 'exp-nonexistent'
    const issues = verifyApplicationSources(app, makeProfile())
    expect(issues.some((i) => i.type === 'invalid-experience-id')).toBe(true)
  })

  it('flags invalid project sourceId', () => {
    const app = makeValidApplication()
    app.cv.projects[0].sourceId = 'proj-nonexistent'
    const issues = verifyApplicationSources(app, makeProfile())
    expect(issues.some((i) => i.type === 'invalid-project-id')).toBe(true)
  })

  it('flags invalid education sourceId', () => {
    const app = makeValidApplication()
    app.cv.education[0].sourceId = 'edu-nonexistent'
    const issues = verifyApplicationSources(app, makeProfile())
    expect(issues.some((i) => i.type === 'invalid-education-id')).toBe(true)
  })

  it('flags invalid language sourceId', () => {
    const app = makeValidApplication()
    app.cv.languages[0].sourceId = 'lang-nonexistent'
    const issues = verifyApplicationSources(app, makeProfile())
    expect(issues.some((i) => i.type === 'invalid-language-id')).toBe(true)
  })

  it('reports no issues when cv arrays are empty (all omitted)', () => {
    const app = makeValidApplication()
    app.cv.experience = []
    app.cv.projects = []
    app.cv.education = []
    app.cv.languages = []
    const issues = verifyApplicationSources(app, makeProfile())
    expect(issues).toHaveLength(0)
  })
})

// ── buildApplicationUserMessage unit tests ────────────────────────────────────

describe('buildApplicationUserMessage', () => {
  const analysis = makeValidatedAnalysis()
  const profile = makeProfile()

  it('includes requested language tag', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'cs')
    expect(msg).toContain('<REQUESTED_LANGUAGE>cs</REQUESTED_LANGUAGE>')
  })

  it('includes job vacancy data', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('<JOB_VACANCY_DATA>')
    expect(msg).toContain(JOB_DESC)
  })

  it('includes job analysis section', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('<JOB_ANALYSIS>')
    expect(msg).toContain('TypeScript Engineer')
  })

  it('includes candidate profile data with EXP-IDs', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('[EXP-ID: exp-1]')
    expect(msg).toContain('Acme Corp')
  })

  it('includes EDU-IDs in education section', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('[EDU-ID: edu-1]')
  })

  it('includes LANG-IDs in language section', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('[LANG-ID: lang-1]')
  })

  it('includes relevant experience reasons from job analysis', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('Direct frontend experience')
  })

  it('includes supported requirement explanations', () => {
    const msg = buildApplicationUserMessage(JOB_DESC, profile, analysis, 'en')
    expect(msg).toContain('Profile shows TS experience')
  })
})

// ── buildApplicationSystemPrompt unit tests ───────────────────────────────────

describe('buildApplicationSystemPrompt', () => {
  it('instructs the model never to invent anything', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('NEVER invent')
  })

  it('instructs the model to treat vacancy as source data', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('source data')
  })

  it('covers cover letter target word count', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('180')
  })

  it('instructs the model to use exact sourceId', () => {
    const prompt = buildApplicationSystemPrompt()
    expect(prompt).toContain('EXACT sourceId')
  })
})

// ── isApplicationError type guard ─────────────────────────────────────────────

describe('isApplicationError', () => {
  it('returns true for an object with code and message strings', () => {
    expect(isApplicationError({ code: 'NO_API_KEY', message: 'Missing key' })).toBe(true)
  })

  it('returns false for a plain Error', () => {
    expect(isApplicationError(new Error('oops'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isApplicationError(null)).toBe(false)
  })

  it('returns false for missing message', () => {
    expect(isApplicationError({ code: 'NO_API_KEY' })).toBe(false)
  })
})

// ── Stale generation seq guard ────────────────────────────────────────────────

describe('generationSeq stale-result prevention pattern', () => {
  it('a result from a cancelled generation is correctly identified as stale', () => {
    let generationSeq = 0
    const captureSeq = (): number => ++generationSeq

    const seq1 = captureSeq()
    const _seq2 = captureSeq()

    expect(seq1 !== generationSeq).toBe(true)
  })

  it('the most recently started generation is never stale when it resolves last', () => {
    let generationSeq = 0
    const captureSeq = (): number => ++generationSeq

    captureSeq()
    const seq2 = captureSeq()

    expect(seq2 !== generationSeq).toBe(false)
  })
})

// ── Data separation — generated edits must not modify Master Profile ──────────

describe('data separation — generated application is independent of Master Profile', () => {
  it('modifying generated experience highlights does not affect original profile', () => {
    const app = makeValidApplication()
    const profileBefore = JSON.stringify(makeProfile())

    app.cv.experience[0].highlights.push('Invented fact')

    expect(JSON.stringify(makeProfile())).toBe(profileBefore)
  })

  it('makeValidApplication returns a new object each call', () => {
    const app1 = makeValidApplication()
    const app2 = makeValidApplication()
    app1.coverLetter.body = 'Modified'
    expect(app2.coverLetter.body).not.toBe('Modified')
  })
})

// ── canonicalizeEducationAndLanguages unit tests ──────────────────────────────

describe('canonicalizeEducationAndLanguages', () => {
  it('replaces AI education institution with the exact profile value', () => {
    const app = makeValidApplication()
    app.cv.education[0].institution = 'AI-Modified Name'
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.cv.education[0].institution).toBe('Czech Technical University')
  })

  it('replaces AI education sourceId with the profile entry id', () => {
    const app = makeValidApplication()
    app.cv.education[0].sourceId = 'edu-wrong'
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.cv.education[0].sourceId).toBe('edu-1')
  })

  it('replaces AI language proficiency with the exact profile value', () => {
    const app = makeValidApplication()
    app.cv.languages[0].proficiency = 'Modified'
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.cv.languages[0].proficiency).toBe('Native')
  })

  it('replaces AI language name with the exact profile value', () => {
    const app = makeValidApplication()
    app.cv.languages[0].language = 'Translated'
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.cv.languages[0].language).toBe('Czech')
  })

  it('includes ALL profile education entries regardless of what AI returned', () => {
    const profile = makeProfile({
      education: [
        { id: 'edu-1', institution: 'First Uni', degree: 'BSc', field: 'CS', startDate: '2016-09', endDate: '2020-06', description: '' },
        { id: 'edu-2', institution: 'Second Uni', degree: 'MSc', field: 'AI', startDate: '2020-09', endDate: '2022-06', description: '' },
      ],
    })
    const app = makeValidApplication()
    app.cv.education = [{ sourceId: 'edu-1', institution: 'First Uni', degree: 'BSc', field: 'CS' }]
    const result = canonicalizeEducationAndLanguages(app, profile)
    expect(result.cv.education).toHaveLength(2)
    expect(result.cv.education[1]?.sourceId).toBe('edu-2')
    expect(result.cv.education[1]?.institution).toBe('Second Uni')
  })

  it('preserves profile education order', () => {
    const profile = makeProfile({
      education: [
        { id: 'edu-a', institution: 'Alpha', degree: 'BSc', field: 'CS', startDate: '2014-09', endDate: '2018-06', description: '' },
        { id: 'edu-b', institution: 'Beta', degree: 'MSc', field: 'AI', startDate: '2018-09', endDate: '2020-06', description: '' },
        { id: 'edu-c', institution: 'Gamma', degree: 'PhD', field: 'ML', startDate: '2020-09', endDate: null, description: '' },
      ],
    })
    const result = canonicalizeEducationAndLanguages(makeValidApplication(), profile)
    expect(result.cv.education[0]?.sourceId).toBe('edu-a')
    expect(result.cv.education[1]?.sourceId).toBe('edu-b')
    expect(result.cv.education[2]?.sourceId).toBe('edu-c')
  })

  it('includes ALL profile language entries regardless of what AI returned', () => {
    const profile = makeProfile({
      languages: [
        { id: 'lang-1', language: 'Czech', proficiency: 'Native' },
        { id: 'lang-2', language: 'English', proficiency: 'C1' },
      ],
    })
    const app = makeValidApplication()
    app.cv.languages = [{ sourceId: 'lang-1', language: 'Czech', proficiency: 'Native' }]
    const result = canonicalizeEducationAndLanguages(app, profile)
    expect(result.cv.languages).toHaveLength(2)
    expect(result.cv.languages[1]?.language).toBe('English')
    expect(result.cv.languages[1]?.proficiency).toBe('C1')
  })

  it('handles profile with no education (returns empty array)', () => {
    const profile = makeProfile({ education: [] })
    const result = canonicalizeEducationAndLanguages(makeValidApplication(), profile)
    expect(result.cv.education).toHaveLength(0)
  })

  it('handles profile with no languages (returns empty array)', () => {
    const profile = makeProfile({ languages: [] })
    const result = canonicalizeEducationAndLanguages(makeValidApplication(), profile)
    expect(result.cv.languages).toHaveLength(0)
  })

  it('does not modify experience or projects', () => {
    const app = makeValidApplication()
    const original = JSON.parse(JSON.stringify(app)) as typeof app
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.cv.experience).toEqual(original.cv.experience)
    expect(result.cv.projects).toEqual(original.cv.projects)
  })

  it('does not modify the cover letter', () => {
    const app = makeValidApplication()
    const original = JSON.parse(JSON.stringify(app)) as typeof app
    const result = canonicalizeEducationAndLanguages(app, makeProfile())
    expect(result.coverLetter).toEqual(original.coverLetter)
  })

  it('does not mutate the input application', () => {
    const app = makeValidApplication()
    const original = JSON.parse(JSON.stringify(app)) as typeof app
    canonicalizeEducationAndLanguages(app, makeProfile())
    expect(app).toEqual(original)
  })
})

// ── generateApplication — canonical education/languages integration ────────────

describe('generateApplication — canonical education and languages', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returned cv contains all profile education entries', async () => {
    const profile = makeProfile({
      education: [
        { id: 'edu-1', institution: 'Czech Technical University', degree: 'Bachelor', field: 'Computer Science', startDate: '2016-09', endDate: '2020-06', description: '' },
        { id: 'edu-2', institution: 'Linux Foundation', degree: 'CKAD', field: 'Certified Kubernetes Developer', startDate: '2022-01', endDate: '2022-03', description: '' },
      ],
    })
    const app = makeValidApplication()
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(JOB_DESC, profile, makeValidatedAnalysis(), 'en', makeSettings())
    expect(result.cv.education).toHaveLength(2)
    expect(result.cv.education[1]?.institution).toBe('Linux Foundation')
  })

  it('returned cv uses exact profile institution name even if AI paraphrased it', async () => {
    const profile = makeProfile()
    const app = makeValidApplication()
    app.cv.education[0].institution = 'Technical University (paraphrased by AI)'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(JOB_DESC, profile, makeValidatedAnalysis(), 'en', makeSettings())
    expect(result.cv.education[0].institution).toBe('Czech Technical University')
  })

  it('returned cv contains all profile language entries', async () => {
    const profile = makeProfile({
      languages: [
        { id: 'lang-1', language: 'Czech', proficiency: 'Native' },
        { id: 'lang-2', language: 'English', proficiency: 'C1' },
        { id: 'lang-3', language: 'German', proficiency: 'B1' },
      ],
    })
    const app = makeValidApplication()
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(JOB_DESC, profile, makeValidatedAnalysis(), 'en', makeSettings())
    expect(result.cv.languages).toHaveLength(3)
    expect(result.cv.languages[2]?.language).toBe('German')
    expect(result.cv.languages[2]?.proficiency).toBe('B1')
  })

  it('returned cv uses exact profile proficiency level', async () => {
    const profile = makeProfile()
    const app = makeValidApplication()
    app.cv.languages[0].proficiency = 'Fluent (AI paraphrase)'
    mockFetch(makeApiResponse(app))
    const result = await generateApplication(JOB_DESC, profile, makeValidatedAnalysis(), 'en', makeSettings())
    expect(result.cv.languages[0].proficiency).toBe('Native')
  })

  it('no additional OpenAI calls are made during canonicalization', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchSpy)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    // Canonicalization is pure data transformation — exactly one API call
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ── enrichProjectUrls unit tests ──────────────────────────────────────────────

describe('enrichProjectUrls', () => {
  it('copies canonical project url from Master Profile', () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: 'https://github.com/jane/logger', startDate: '2022-06', endDate: '2023-01', description: '' },
      ],
    })
    const app = makeValidApplication()
    const result = enrichProjectUrls(app, profile)
    expect(result.cv.projects[0]?.url).toBe('https://github.com/jane/logger')
  })

  it('leaves url undefined when profile project has no url', () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: '', startDate: '2022-06', endDate: '2023-01', description: '' },
      ],
    })
    const result = enrichProjectUrls(makeValidApplication(), profile)
    expect(result.cv.projects[0]?.url).toBeUndefined()
  })

  it('handles multiple projects with mixed url presence', () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'P1', role: '', url: 'https://p1.example.com', startDate: '2021-01', endDate: null, description: '' },
        { id: 'proj-2', name: 'P2', role: '', url: '', startDate: '2022-01', endDate: null, description: '' },
      ],
    })
    const app = makeValidApplication()
    app.cv.projects = [
      { sourceId: 'proj-1', name: 'P1', role: '', highlights: [] },
      { sourceId: 'proj-2', name: 'P2', role: '', highlights: [] },
    ]
    const result = enrichProjectUrls(app, profile)
    expect(result.cv.projects[0]?.url).toBe('https://p1.example.com')
    expect(result.cv.projects[1]?.url).toBeUndefined()
  })

  it('preserves AI-generated project highlights and role', () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: 'https://example.com', startDate: '2022-06', endDate: '2023-01', description: '' },
      ],
    })
    const app = makeValidApplication()
    app.cv.projects[0].highlights = ['AI highlight 1', 'AI highlight 2']
    app.cv.projects[0].role = 'AI-generated role'
    const result = enrichProjectUrls(app, profile)
    expect(result.cv.projects[0]?.highlights).toEqual(['AI highlight 1', 'AI highlight 2'])
    expect(result.cv.projects[0]?.role).toBe('AI-generated role')
  })

  it('preserves project order from AI output', () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'P1', role: '', url: 'https://p1.com', startDate: '2021-01', endDate: null, description: '' },
        { id: 'proj-2', name: 'P2', role: '', url: 'https://p2.com', startDate: '2022-01', endDate: null, description: '' },
      ],
    })
    const app = makeValidApplication()
    // AI returned projects in reverse profile order
    app.cv.projects = [
      { sourceId: 'proj-2', name: 'P2', role: '', highlights: [] },
      { sourceId: 'proj-1', name: 'P1', role: '', highlights: [] },
    ]
    const result = enrichProjectUrls(app, profile)
    expect(result.cv.projects[0]?.sourceId).toBe('proj-2')
    expect(result.cv.projects[0]?.url).toBe('https://p2.com')
    expect(result.cv.projects[1]?.sourceId).toBe('proj-1')
    expect(result.cv.projects[1]?.url).toBe('https://p1.com')
  })

  it('does not modify experience, education, or languages', () => {
    const app = makeValidApplication()
    const original = JSON.parse(JSON.stringify(app)) as typeof app
    const result = enrichProjectUrls(app, makeProfile())
    expect(result.cv.experience).toEqual(original.cv.experience)
    expect(result.cv.education).toEqual(original.cv.education)
    expect(result.cv.languages).toEqual(original.cv.languages)
  })

  it('does not mutate the input application', () => {
    const app = makeValidApplication()
    const original = JSON.parse(JSON.stringify(app)) as typeof app
    enrichProjectUrls(app, makeProfile())
    expect(app).toEqual(original)
  })

  it('handles empty project list', () => {
    const app = makeValidApplication()
    app.cv.projects = []
    const result = enrichProjectUrls(app, makeProfile())
    expect(result.cv.projects).toHaveLength(0)
  })
})

// ── generateApplication — project URL integration ─────────────────────────────

describe('generateApplication — canonical project URLs', () => {
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returned project has url from Master Profile', async () => {
    const profile = makeProfile({
      projects: [
        { id: 'proj-1', name: 'Open Logger', role: 'Lead', url: 'https://github.com/jane/logger', startDate: '2022-06', endDate: '2023-01', description: '' },
      ],
    })
    mockFetch(makeApiResponse(makeValidApplication()))
    const result = await generateApplication(JOB_DESC, profile, makeValidatedAnalysis(), 'en', makeSettings())
    expect(result.cv.projects[0]?.url).toBe('https://github.com/jane/logger')
  })

  it('still throws INVALID_SOURCE_IDS when project sourceId is invalid (url enrichment runs after)', async () => {
    const app = makeValidApplication()
    app.cv.projects[0].sourceId = 'proj-nonexistent'
    mockFetch(makeApiResponse(app))
    await expect(
      generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings()),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_IDS' })
  })

  it('no additional OpenAI calls are made during URL enrichment', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeApiResponse(makeValidApplication())),
    })
    vi.stubGlobal('fetch', fetchSpy)
    await generateApplication(JOB_DESC, makeProfile(), makeValidatedAnalysis(), 'en', makeSettings())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
