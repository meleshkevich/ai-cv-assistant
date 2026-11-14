import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GeneratedCv } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'
import type { ExtensionSettings } from '@/types/settings'
import type { CvCompressionProposal } from '@/services/cvCompressionService'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('@/services/openaiService', () => ({
  callResponsesAPI: vi.fn(),
  extractOutputText: vi.fn(),
}))

vi.mock('@/services/cvPdfService', () => ({
  generateCvPdfWithResult: vi.fn(),
  isCvPdfError: (v: unknown): boolean =>
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    (v as Record<string, unknown>).code === 'PDF_OVERFLOW',
}))

// Import AFTER vi.mock() calls so the mocked modules are in place.
import { callResponsesAPI, extractOutputText } from '@/services/openaiService'
import { generateCvPdfWithResult } from '@/services/cvPdfService'
import { compressCvWithAi, compressCvWithAiAdaptive } from '@/services/cvCompressionService'

const mockCallAPI = callResponsesAPI as ReturnType<typeof vi.fn>
const mockExtractText = extractOutputText as ReturnType<typeof vi.fn>
const mockGeneratePdf = generateCvPdfWithResult as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOriginalCv(): GeneratedCv {
  return {
    language: 'en',
    professionalTitle: 'Software Engineer',
    professionalSummary: 'Experienced engineer with 5 years building scalable web applications.',
    technicalSkills: ['TypeScript', 'Vue 3', 'Node.js', 'PostgreSQL', 'Docker'],
    experience: [
      {
        sourceId: 'exp-1',
        company: 'Acme Corp',
        position: 'Senior Engineer',
        startDate: '2021-01',
        endDate: null,
        highlights: ['Led migration.', 'Mentored 3 engineers.', 'Owned CI/CD pipeline.'],
      },
      {
        sourceId: 'exp-2',
        company: 'Beta Ltd',
        position: 'Software Engineer',
        startDate: '2019-03',
        endDate: '2021-01',
        highlights: ['Built REST APIs.', 'Reduced query time by 60%.'],
      },
    ],
    projects: [
      {
        sourceId: 'proj-1',
        name: 'Open Logger',
        role: 'Lead',
        highlights: ['Rust logging library with 2k stars.', 'Zero-copy serialization.'],
        url: 'https://github.com/example/open-logger',
      },
      {
        sourceId: 'proj-2',
        name: 'CV Builder',
        role: 'Creator',
        highlights: ['Generates PDFs from JSON.'],
        url: '',
      },
    ],
    education: [
      { sourceId: 'edu-1', institution: 'Czech Technical University', degree: 'Bachelor', field: 'Computer Science' },
    ],
    languages: [
      { sourceId: 'lang-1', language: 'Czech', proficiency: 'Native' },
      { sourceId: 'lang-2', language: 'English', proficiency: 'Fluent' },
    ],
  }
}

function makePersonalInfo(): PersonalInfo {
  return {
    fullName: 'Jane Doe',
    title: 'Engineer',
    location: 'Prague',
    email: 'jane@example.com',
    phone: '',
    linkedIn: '',
    github: '',
  }
}

function makeSettings(): ExtensionSettings {
  return {
    openaiApiKey: 'sk-test-key',
    openaiModel: 'gpt-4o-mini',
    hasAcknowledgedAiPrivacy: true,
  }
}

function makeProposalJson(cv: GeneratedCv): string {
  const proposal: CvCompressionProposal = {
    professionalSummary: 'Compressed summary.',
    technicalSkills: ['TypeScript', 'Vue 3'],
    experience: cv.experience.map((e) => ({ sourceId: e.sourceId, highlights: ['Compressed.'] })),
    projects: cv.projects.map((p) => ({ sourceId: p.sourceId, highlights: ['Compressed.'] })),
  }
  return JSON.stringify(proposal)
}

const PDF_FIT = { blob: new Blob(), layout: 'standard' as const }
const PDF_OVERFLOW_ERR = { code: 'PDF_OVERFLOW', message: 'CV fills 2 pages.' }

// ── compressCvWithAi (single attempt) ─────────────────────────────────────────

describe('compressCvWithAi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCallAPI.mockResolvedValue({})
    mockExtractText.mockReturnValue(makeProposalJson(makeOriginalCv()))
    mockGeneratePdf.mockResolvedValue(PDF_FIT)
  })

  it('returns fits=true and attemptCount=1 when merged CV fits on one page', async () => {
    const result = await compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(result.fits).toBe(true)
    expect(result.attemptCount).toBe(1)
  })

  it('returns fits=false and attemptCount=1 when merged CV overflows — does not throw', async () => {
    mockGeneratePdf.mockRejectedValueOnce(PDF_OVERFLOW_ERR)
    const result = await compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(result.fits).toBe(false)
    expect(result.attemptCount).toBe(1)
  })

  it('throws NO_API_KEY when settings has no API key', async () => {
    const settings = { ...makeSettings(), openaiApiKey: '' }
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), settings)).rejects.toMatchObject({
      code: 'NO_API_KEY',
    })
  })

  it('throws NO_API_KEY when API key is whitespace only', async () => {
    const settings = { ...makeSettings(), openaiApiKey: '   ' }
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), settings)).rejects.toMatchObject({
      code: 'NO_API_KEY',
    })
  })

  it('throws RESPONSE_INVALID when extractOutputText returns null', async () => {
    mockExtractText.mockReturnValueOnce(null)
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    })
  })

  it('throws RESPONSE_INVALID when API returns non-JSON text', async () => {
    mockExtractText.mockReturnValueOnce('not json at all')
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())).rejects.toMatchObject({
      code: 'RESPONSE_INVALID',
    })
  })

  it('throws VALIDATION_FAILED when proposal has an unknown sourceId', async () => {
    const badProposal: CvCompressionProposal = {
      professionalSummary: 'Short.',
      technicalSkills: ['TypeScript'],
      experience: [{ sourceId: 'exp-999', highlights: ['Something.'] }],
      projects: [{ sourceId: 'proj-1', highlights: ['Compressed.'] }, { sourceId: 'proj-2', highlights: ['X.'] }],
    }
    mockExtractText.mockReturnValueOnce(JSON.stringify(badProposal))
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    })
  })

  it('propagates API errors with their code', async () => {
    mockCallAPI.mockRejectedValueOnce({ code: 'RATE_LIMITED', message: 'Too many requests.' })
    await expect(compressCvWithAi(makeOriginalCv(), makePersonalInfo(), makeSettings())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  it('returns originalCv equal to the input CV', async () => {
    const cv = makeOriginalCv()
    const result = await compressCvWithAi(cv, makePersonalInfo(), makeSettings())
    expect(result.originalCv).toBe(cv)
  })

  it('does not mutate the original CV', async () => {
    const cv = makeOriginalCv()
    const originalSummary = cv.professionalSummary
    await compressCvWithAi(cv, makePersonalInfo(), makeSettings())
    expect(cv.professionalSummary).toBe(originalSummary)
  })
})

// ── compressCvWithAiAdaptive (bounded retry) ───────────────────────────────────

describe('compressCvWithAiAdaptive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: API returns a valid proposal JSON for any CV.
    mockCallAPI.mockResolvedValue({})
    mockExtractText.mockImplementation(() => makeProposalJson(makeOriginalCv()))
    mockGeneratePdf.mockResolvedValue(PDF_FIT)
  })

  it('returns attemptCount=1 and fits=true when first attempt fits', async () => {
    const result = await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(result.attemptCount).toBe(1)
    expect(result.fits).toBe(true)
  })

  it('calls the API exactly once when first attempt fits', async () => {
    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(mockCallAPI).toHaveBeenCalledTimes(1)
  })

  it('returns attemptCount=2 and fits=true when first attempt overflows but second fits', async () => {
    mockGeneratePdf
      .mockRejectedValueOnce(PDF_OVERFLOW_ERR)
      .mockResolvedValueOnce(PDF_FIT)

    const result = await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(result.attemptCount).toBe(2)
    expect(result.fits).toBe(true)
  })

  it('calls the API exactly twice when first attempt overflows', async () => {
    mockGeneratePdf
      .mockRejectedValueOnce(PDF_OVERFLOW_ERR)
      .mockResolvedValueOnce(PDF_FIT)

    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(mockCallAPI).toHaveBeenCalledTimes(2)
  })

  it('returns attemptCount=2 and fits=false when both attempts overflow', async () => {
    mockGeneratePdf.mockRejectedValue(PDF_OVERFLOW_ERR)

    const result = await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(result.attemptCount).toBe(2)
    expect(result.fits).toBe(false)
  })

  it('does NOT call the API a third time when both attempts overflow', async () => {
    mockGeneratePdf.mockRejectedValue(PDF_OVERFLOW_ERR)

    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())
    expect(mockCallAPI).toHaveBeenCalledTimes(2)
  })

  it('returns originalCv as the initial input CV regardless of attempt count', async () => {
    mockGeneratePdf
      .mockRejectedValueOnce(PDF_OVERFLOW_ERR)
      .mockResolvedValueOnce(PDF_FIT)

    const cv = makeOriginalCv()
    const result = await compressCvWithAiAdaptive(cv, makePersonalInfo(), makeSettings())
    expect(result.originalCv).toBe(cv)
    expect(result.attemptCount).toBe(2)
  })

  it('calls onRetryStarted callback when second attempt begins', async () => {
    mockGeneratePdf
      .mockRejectedValueOnce(PDF_OVERFLOW_ERR)
      .mockResolvedValueOnce(PDF_FIT)

    const onRetryStarted = vi.fn()
    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings(), {}, undefined, {
      onRetryStarted,
    })
    expect(onRetryStarted).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onRetryStarted when first attempt fits', async () => {
    const onRetryStarted = vi.fn()
    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings(), {}, undefined, {
      onRetryStarted,
    })
    expect(onRetryStarted).not.toHaveBeenCalled()
  })

  it('throws NO_API_KEY before making any API call when key is missing', async () => {
    const settings = { ...makeSettings(), openaiApiKey: '' }
    await expect(compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), settings)).rejects.toMatchObject({
      code: 'NO_API_KEY',
    })
    expect(mockCallAPI).not.toHaveBeenCalled()
  })

  it('throws REQUEST_ABORTED when signal is already aborted before first call', async () => {
    const controller = new AbortController()
    controller.abort()
    mockCallAPI.mockRejectedValue({ code: 'REQUEST_ABORTED', message: 'Aborted.' })

    await expect(
      compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings(), {}, controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })

  it('throws REQUEST_ABORTED when signal is aborted between attempts', async () => {
    const controller = new AbortController()

    // First attempt succeeds (PDF overflows).
    mockGeneratePdf.mockRejectedValueOnce(PDF_OVERFLOW_ERR)

    // Abort between attempts by making the second callResponsesAPI throw.
    // We also abort the controller so signal.aborted is true.
    mockCallAPI.mockImplementationOnce(() => Promise.resolve({})) // attempt 1 API call
    mockCallAPI.mockImplementationOnce(() => {
      controller.abort()
      return Promise.reject({ code: 'REQUEST_ABORTED', message: 'Aborted.' })
    })

    await expect(
      compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings(), {}, controller.signal),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
  })

  it('passes vacancy title and description to the first API call', async () => {
    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings(), {
      vacancyTitle: 'Staff Engineer',
      vacancyDescription: 'React, Go, Kubernetes',
    })

    // The first argument to callResponsesAPI is the request object.
    // Its `instructions` field should contain the vacancy context.
    const firstCallRequest = mockCallAPI.mock.calls[0]?.[0] as { instructions: string }
    expect(firstCallRequest.instructions).toContain('Staff Engineer')
    expect(firstCallRequest.instructions).toContain('React, Go, Kubernetes')
  })

  it('passes isRetry=true instructions to the second API call', async () => {
    mockGeneratePdf
      .mockRejectedValueOnce(PDF_OVERFLOW_ERR)
      .mockResolvedValueOnce(PDF_FIT)

    await compressCvWithAiAdaptive(makeOriginalCv(), makePersonalInfo(), makeSettings())

    const secondCallRequest = mockCallAPI.mock.calls[1]?.[0] as { instructions: string }
    expect(secondCallRequest.instructions).toContain('still exceeded one A4 page')
  })

  it('preserves immutable experience fields in the returned mergedCv', async () => {
    const cv = makeOriginalCv()
    const result = await compressCvWithAiAdaptive(cv, makePersonalInfo(), makeSettings())

    for (const exp of cv.experience) {
      const merged = result.mergedCv.experience.find((e) => e.sourceId === exp.sourceId)!
      expect(merged.company).toBe(exp.company)
      expect(merged.position).toBe(exp.position)
      expect(merged.startDate).toBe(exp.startDate)
      expect(merged.endDate).toBe(exp.endDate)
    }
  })

  it('preserves immutable project fields in the returned mergedCv', async () => {
    const cv = makeOriginalCv()
    const result = await compressCvWithAiAdaptive(cv, makePersonalInfo(), makeSettings())

    for (const proj of cv.projects) {
      const merged = result.mergedCv.projects.find((p) => p.sourceId === proj.sourceId)!
      expect(merged.name).toBe(proj.name)
      expect(merged.role).toBe(proj.role)
      expect(merged.url).toBe(proj.url)
    }
  })

  it('preserves education and languages unchanged in mergedCv', async () => {
    const cv = makeOriginalCv()
    const result = await compressCvWithAiAdaptive(cv, makePersonalInfo(), makeSettings())
    expect(result.mergedCv.education).toEqual(cv.education)
    expect(result.mergedCv.languages).toEqual(cv.languages)
  })
})
