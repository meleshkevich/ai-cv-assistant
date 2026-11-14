import { ref, computed } from 'vue'
import type { GeneratedCv } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'

const UNSAFE_FILENAME_RE = /[<>:"/\\|?*\x00-\x1f]/g

export function buildPdfFilename(
  vacancyTitle: string | null,
  vacancyCompany: string | null,
): string {
  function sanitize(s: string): string {
    return s
      .trim()
      .replace(UNSAFE_FILENAME_RE, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50)
  }
  const parts: string[] = ['CV']
  if (vacancyTitle) {
    const t = sanitize(vacancyTitle)
    if (t) parts.push(t)
  }
  if (vacancyCompany) {
    const c = sanitize(vacancyCompany)
    if (c) parts.push(c)
  }
  return parts.join('_') + '.pdf'
}

export function usePdfDownload(
  buildCv: () => GeneratedCv,
  getPersonalInfo: () => PersonalInfo,
  getVacancyTitle: () => string | null,
  getVacancyCompany: () => string | null,
  isProfileLoading: () => boolean,
) {
  const pdfGenerating = ref(false)
  const pdfError = ref<string | null>(null)

  // Button is disabled while the profile is loading OR a PDF is being generated.
  // This prevents the UI from showing a misleading "missing full name" error when
  // the profile data simply hasn't arrived from storage yet.
  const pdfButtonDisabled = computed(() => pdfGenerating.value || isProfileLoading())

  function clearPdfError(): void {
    pdfError.value = null
  }

  async function downloadPdf(): Promise<void> {
    // Safety net: treat a click that slips past the disabled button as a no-op.
    if (pdfGenerating.value || isProfileLoading()) return
    pdfGenerating.value = true
    pdfError.value = null

    const personal = getPersonalInfo()
    if (!personal.fullName.trim()) {
      pdfError.value =
        'Your Master Profile is missing a full name. Please add it in the Profile tab before downloading.'
      pdfGenerating.value = false
      return
    }

    let isCvPdfErrorFn: ((v: unknown) => boolean) | undefined

    try {
      const service = await import('@/services/cvPdfService')
      isCvPdfErrorFn = service.isCvPdfError

      const cv = buildCv()
      const blob = await service.generateCvPdf(cv, personal)

      const filename = buildPdfFilename(getVacancyTitle(), getVacancyCompany())
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if (isCvPdfErrorFn?.(err)) {
        pdfError.value =
          'Your CV content is too long for one A4 page. Shorten the summary or some experience/project highlights and try again.'
      } else {
        pdfError.value = 'PDF generation failed. Please try again.'
      }
    } finally {
      pdfGenerating.value = false
    }
  }

  return { pdfGenerating, pdfButtonDisabled, pdfError, clearPdfError, downloadPdf }
}
