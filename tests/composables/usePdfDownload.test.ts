// @vitest-environment jsdom

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { GeneratedCv } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'

vi.mock('@/services/cvPdfService', () => ({
  generateCvPdf: vi.fn(),
  isCvPdfError: vi.fn((v: unknown) =>
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>).code === 'PDF_OVERFLOW',
  ),
}))

import * as cvPdfService from '@/services/cvPdfService'
import { buildPdfFilename, usePdfDownload } from '@/composables/usePdfDownload'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePersonal(overrides: Partial<PersonalInfo> = {}): PersonalInfo {
  return {
    fullName: 'Jane Doe',
    title: 'Software Engineer',
    location: 'Prague',
    email: 'jane@example.com',
    phone: '+420 123 456 789',
    linkedIn: '',
    github: '',
    ...overrides,
  }
}

function makeCv(overrides: Partial<GeneratedCv> = {}): GeneratedCv {
  return {
    language: 'en',
    professionalTitle: 'Senior Engineer',
    professionalSummary: 'Experienced engineer.',
    technicalSkills: ['TypeScript', 'Vue'],
    experience: [],
    projects: [],
    education: [],
    languages: [],
    ...overrides,
  }
}

function makeComposable(opts: {
  cv?: GeneratedCv
  personal?: PersonalInfo
  vacancyTitle?: string | null
  vacancyCompany?: string | null
  isProfileLoading?: boolean
} = {}) {
  const cv = opts.cv ?? makeCv()
  const personal = opts.personal ?? makePersonal()
  return usePdfDownload(
    () => cv,
    () => personal,
    () => opts.vacancyTitle ?? null,
    () => opts.vacancyCompany ?? null,
    () => opts.isProfileLoading ?? false,
  )
}

// ── buildPdfFilename ──────────────────────────────────────────────────────────

describe('buildPdfFilename', () => {
  it('returns CV.pdf when both title and company are null', () => {
    expect(buildPdfFilename(null, null)).toBe('CV.pdf')
  })

  it('includes vacancy title', () => {
    expect(buildPdfFilename('Frontend Engineer', null)).toBe('CV_Frontend_Engineer.pdf')
  })

  it('includes vacancy company', () => {
    expect(buildPdfFilename(null, 'Acme Corp')).toBe('CV_Acme_Corp.pdf')
  })

  it('includes both title and company', () => {
    expect(buildPdfFilename('Frontend Engineer', 'Acme Corp')).toBe(
      'CV_Frontend_Engineer_Acme_Corp.pdf',
    )
  })

  it('replaces slashes and colons with underscore', () => {
    expect(buildPdfFilename('Lead/Manager', 'Widgets: Unlimited')).toBe(
      'CV_Lead_Manager_Widgets_Unlimited.pdf',
    )
  })

  it('collapses consecutive underscores', () => {
    expect(buildPdfFilename('A/B', null)).toBe('CV_A_B.pdf')
  })

  it('ignores whitespace-only title', () => {
    expect(buildPdfFilename('   ', 'Acme')).toBe('CV_Acme.pdf')
  })

  it('ignores empty string title', () => {
    expect(buildPdfFilename('', null)).toBe('CV.pdf')
  })

  it('truncates long segments to 50 chars', () => {
    expect(buildPdfFilename('A'.repeat(100), null)).toBe(`CV_${'A'.repeat(50)}.pdf`)
  })
})

// ── usePdfDownload ────────────────────────────────────────────────────────────

describe('usePdfDownload', () => {
  // jsdom does not implement URL.createObjectURL / revokeObjectURL.
  // Add them once via Object.defineProperty so the composable can call them.
  const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
  const mockRevokeObjectURL = vi.fn()

  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: mockCreateObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: mockRevokeObjectURL,
      configurable: true,
      writable: true,
    })
  })

  beforeEach(() => {
    vi.mocked(cvPdfService.generateCvPdf).mockResolvedValue(
      new Blob(['%PDF-mock'], { type: 'application/pdf' }),
    )
  })

  afterEach(() => {
    // Clears call records only; implementations (mockReturnValue etc.) are preserved.
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('pdfGenerating starts false', () => {
      const { pdfGenerating } = makeComposable()
      expect(pdfGenerating.value).toBe(false)
    })

    it('pdfError starts null', () => {
      const { pdfError } = makeComposable()
      expect(pdfError.value).toBeNull()
    })
  })

  describe('missing fullName guard', () => {
    it('sets pdfError when fullName is empty', async () => {
      const { downloadPdf, pdfError } = makeComposable({
        personal: makePersonal({ fullName: '' }),
      })
      await downloadPdf()
      expect(pdfError.value).toMatch(/full name/)
    })

    it('does not call generateCvPdf when fullName is empty', async () => {
      const { downloadPdf } = makeComposable({ personal: makePersonal({ fullName: '   ' }) })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).not.toHaveBeenCalled()
    })

    it('restores pdfGenerating to false when fullName is empty', async () => {
      const { downloadPdf, pdfGenerating } = makeComposable({
        personal: makePersonal({ fullName: '' }),
      })
      await downloadPdf()
      expect(pdfGenerating.value).toBe(false)
    })
  })

  describe('successful download', () => {
    it('calls generateCvPdf with the cv from buildCv', async () => {
      const cv = makeCv({ professionalTitle: 'Staff Engineer' })
      const { downloadPdf } = makeComposable({ cv })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).toHaveBeenCalledWith(cv, expect.anything())
    })

    it('calls generateCvPdf with personalInfo from getPersonalInfo', async () => {
      const personal = makePersonal({ email: 'custom@example.com' })
      const { downloadPdf } = makeComposable({ personal })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).toHaveBeenCalledWith(expect.anything(), personal)
    })

    it('passes through a Czech cv language', async () => {
      const cv = makeCv({ language: 'cs' })
      const { downloadPdf } = makeComposable({ cv })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'cs' }),
        expect.anything(),
      )
    })

    it('calls URL.createObjectURL with the generated blob', async () => {
      const { downloadPdf } = makeComposable()
      await downloadPdf()
      expect(mockCreateObjectURL).toHaveBeenCalledOnce()
      const arg = mockCreateObjectURL.mock.calls[0]?.[0]
      expect(arg).toBeInstanceOf(Blob)
    })

    it('calls URL.revokeObjectURL to clean up', async () => {
      const { downloadPdf } = makeComposable()
      await downloadPdf()
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })

    it('builds filename from vacancyTitle and vacancyCompany', async () => {
      const { downloadPdf } = makeComposable({
        vacancyTitle: 'Frontend Engineer',
        vacancyCompany: 'Acme',
      })
      const appendSpy = vi.spyOn(document.body, 'appendChild')
      await downloadPdf()
      const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement | undefined
      expect(anchor?.download).toBe('CV_Frontend_Engineer_Acme.pdf')
    })

    it('restores pdfGenerating to false after success', async () => {
      const { downloadPdf, pdfGenerating } = makeComposable()
      await downloadPdf()
      expect(pdfGenerating.value).toBe(false)
    })

    it('accepts personal info with empty optional contacts', async () => {
      const personal = makePersonal({ linkedIn: '', github: '', phone: '' })
      const { downloadPdf, pdfError } = makeComposable({ personal })
      await downloadPdf()
      expect(pdfError.value).toBeNull()
    })
  })

  describe('duplicate click prevention', () => {
    it('ignores a second downloadPdf call while generating', async () => {
      const { downloadPdf } = makeComposable()

      // Start first download; pdfGenerating is set true synchronously (before any await).
      const first = downloadPdf()
      // Second call checks pdfGenerating synchronously → returns immediately (no-op).
      void downloadPdf()

      await first

      expect(vi.mocked(cvPdfService.generateCvPdf)).toHaveBeenCalledTimes(1)
    })
  })

  describe('PDF_OVERFLOW error', () => {
    beforeEach(() => {
      vi.mocked(cvPdfService.generateCvPdf).mockRejectedValue({
        code: 'PDF_OVERFLOW',
        message: 'CV content fills 2 pages; maximum is 1.',
      })
    })

    it('sets the overflow-specific error message', async () => {
      const { downloadPdf, pdfError } = makeComposable()
      await downloadPdf()
      expect(pdfError.value).toMatch(/too long for one A4 page/)
    })

    it('restores pdfGenerating to false', async () => {
      const { downloadPdf, pdfGenerating } = makeComposable()
      await downloadPdf()
      expect(pdfGenerating.value).toBe(false)
    })
  })

  describe('generic error', () => {
    beforeEach(() => {
      vi.mocked(cvPdfService.generateCvPdf).mockRejectedValue(new Error('Unexpected failure'))
    })

    it('sets the generic error message', async () => {
      const { downloadPdf, pdfError } = makeComposable()
      await downloadPdf()
      expect(pdfError.value).toMatch(/PDF generation failed/)
    })

    it('restores pdfGenerating to false', async () => {
      const { downloadPdf, pdfGenerating } = makeComposable()
      await downloadPdf()
      expect(pdfGenerating.value).toBe(false)
    })
  })

  describe('profile loading guard', () => {
    it('pdfButtonDisabled is true while profile is loading', () => {
      const { pdfButtonDisabled } = makeComposable({ isProfileLoading: true })
      expect(pdfButtonDisabled.value).toBe(true)
    })

    it('pdfButtonDisabled is false once profile has loaded', () => {
      const { pdfButtonDisabled } = makeComposable({ isProfileLoading: false })
      expect(pdfButtonDisabled.value).toBe(false)
    })

    it('pdfButtonDisabled is true while generating even when profile is loaded', () => {
      // pdfGenerating || isProfileLoading — verify the OR
      const { pdfButtonDisabled, pdfGenerating } = makeComposable({ isProfileLoading: false })
      pdfGenerating.value = true
      expect(pdfButtonDisabled.value).toBe(true)
    })

    it('downloadPdf is a no-op while profile is loading (does not call generateCvPdf)', async () => {
      const { downloadPdf } = makeComposable({ isProfileLoading: true })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).not.toHaveBeenCalled()
    })

    it('downloadPdf does not set pdfError while profile is loading', async () => {
      const { downloadPdf, pdfError } = makeComposable({ isProfileLoading: true })
      await downloadPdf()
      expect(pdfError.value).toBeNull()
    })

    it('downloadPdf proceeds and calls generateCvPdf once profile is loaded', async () => {
      const { downloadPdf } = makeComposable({ isProfileLoading: false })
      await downloadPdf()
      expect(vi.mocked(cvPdfService.generateCvPdf)).toHaveBeenCalledOnce()
    })

    it('shows fullName error when profile loaded but fullName is empty', async () => {
      const { downloadPdf, pdfError } = makeComposable({
        isProfileLoading: false,
        personal: makePersonal({ fullName: '' }),
      })
      await downloadPdf()
      expect(pdfError.value).toMatch(/full name/)
    })
  })

  describe('clearPdfError', () => {
    it('clears an existing error', async () => {
      vi.mocked(cvPdfService.generateCvPdf).mockRejectedValue(new Error('err'))
      const { downloadPdf, pdfError, clearPdfError } = makeComposable()
      await downloadPdf()
      expect(pdfError.value).not.toBeNull()
      clearPdfError()
      expect(pdfError.value).toBeNull()
    })
  })
})
