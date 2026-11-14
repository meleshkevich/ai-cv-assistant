/**
 * Client-side CV PDF renderer using pdfmake 0.3.x.
 *
 * API surface intentionally narrow:
 *   - No OpenAI calls
 *   - No Chrome Storage access
 *   - Inputs are never mutated
 *   - No automatic browser download
 */

import type { TDocumentDefinitions, Content, Style } from 'pdfmake/interfaces'
import type { GeneratedCv, GeneratedCvExperience, GeneratedCvProject } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'

// pdfmake/build/vfs_fonts exports { [filename: string]: string } (base64 font data).
// @types/pdfmake types it as TVirtualFileSystem which is not quite right for the
// actual CJS module export — silence the overlap check here.
type VfsFontsModule = Record<string, string>

// ── Error types ──────────────────────────────────────────────────────────────

export type CvPdfErrorCode = 'PDF_OVERFLOW'

export interface CvPdfError {
  code: CvPdfErrorCode
  message: string
}

export function isCvPdfError(value: unknown): value is CvPdfError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    (value as Record<string, unknown>).code === 'PDF_OVERFLOW'
  )
}

function throwPdfError(code: CvPdfErrorCode, message: string): never {
  throw { code, message } satisfies CvPdfError
}

// ── Layout configuration ──────────────────────────────────────────────────────

export interface LayoutConfig {
  /** Top spacing before each section heading (pt) */
  sectionTopMargin: number
  /** Bottom spacing of the rule after each section heading (pt) */
  sectionRuleBottomMargin: number
  /** Top spacing before each experience / project / education entry header (pt) */
  entryTopMargin: number
  /** Top spacing above each bullet line (pt) */
  bulletTopMargin: number
  /** Line height for body text */
  bodyLineHeight: number
  /** Top margin of the contact-block divider rule (pt) */
  dividerTopMargin: number
}

export const STANDARD_LAYOUT: LayoutConfig = {
  sectionTopMargin: 10,
  sectionRuleBottomMargin: 2,
  entryTopMargin: 5,
  bulletTopMargin: 1,
  bodyLineHeight: 1.35,
  dividerTopMargin: 6,
}

export const COMPACT_LAYOUT: LayoutConfig = {
  sectionTopMargin: 7,
  sectionRuleBottomMargin: 1,
  entryTopMargin: 3,
  bulletTopMargin: 0,
  bodyLineHeight: 1.25,
  dividerTopMargin: 4,
}

// ── Localisation ─────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    summary: 'PROFESSIONAL SUMMARY',
    skills: 'TECHNICAL SKILLS',
    experience: 'PROFESSIONAL EXPERIENCE',
    projects: 'SELECTED PROJECTS',
    education: 'EDUCATION & TRAINING',
    languages: 'LANGUAGES',
    present: 'Present',
    viewProject: 'View project',
  },
  cs: {
    summary: 'PROFESNÍ SHRNUTÍ',
    skills: 'TECHNICKÉ DOVEDNOSTI',
    experience: 'PRACOVNÍ ZKUŠENOSTI',
    projects: 'VYBRANÉ PROJEKTY',
    education: 'VZDĚLÁNÍ A ŠKOLENÍ',
    languages: 'JAZYKY',
    present: 'současnost',
    viewProject: 'Zobrazit projekt',
  },
} as const satisfies Record<'en' | 'cs', Record<string, string>>

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'] as const

export function formatDate(isoMonth: string, lang: 'en' | 'cs'): string {
  const parts = isoMonth.split('-')
  if (parts.length < 2) return isoMonth
  const year = parts[0] ?? ''
  const monthIdx = parseInt(parts[1] ?? '1', 10) - 1
  const months: readonly string[] = lang === 'cs' ? MONTHS_CS : MONTHS_EN
  const monthName = months[monthIdx] ?? ''
  return `${monthName} ${year}`.trim()
}

export function formatDateRange(startDate: string, endDate: string | null, lang: 'en' | 'cs'): string {
  const start = formatDate(startDate, lang)
  const end = endDate !== null ? formatDate(endDate, lang) : LABELS[lang].present
  return `${start} – ${end}`
}

// ── Page count verification ───────────────────────────────────────────────────

/**
 * Counts pages in a PDF binary using pdf-lib's document parser.
 * Unlike a regex scan, this correctly handles compressed object streams and
 * cross-reference streams (PDF 1.5+).
 *
 * Throws a plain `Error` (not a `CvPdfError`) when the bytes are not a valid PDF.
 */
export async function countPdfPages(buffer: Uint8Array): Promise<number> {
  if (buffer.length === 0) {
    throw new Error('PDF page count failed: buffer is empty')
  }
  const { PDFDocument } = await import('pdf-lib')
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return doc.getPageCount()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF page count failed: could not parse PDF bytes — ${detail}`)
  }
}

// ── Font setup ───────────────────────────────────────────────────────────────

type FontData = Uint8Array

interface RobotoFonts {
  normal: FontData
  bold: FontData
  italics: FontData
  bolditalics: FontData
}

let cachedFonts: RobotoFonts | null = null

async function loadFonts(): Promise<RobotoFonts> {
  if (cachedFonts !== null) return cachedFonts

  // vfs_fonts exports the Roboto font family as base64-encoded strings.
  // pdfmake 0.3.x requires font data as Uint8Array (not file path strings).
  const vfsFonts = (await import('pdfmake/build/vfs_fonts')) as unknown as VfsFontsModule

  function decode(key: string): Uint8Array {
    const b64 = vfsFonts[key]
    if (!b64) throw new Error(`Font file not found in vfs_fonts: ${key}`)
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  }

  cachedFonts = {
    normal: decode('Roboto-Regular.ttf'),
    bold: decode('Roboto-Medium.ttf'),
    italics: decode('Roboto-Italic.ttf'),
    bolditalics: decode('Roboto-MediumItalic.ttf'),
  }
  return cachedFonts
}

// ── Contact URL normalisation ────────────────────────────────────────────────

/**
 * Ensures a user-entered LinkedIn / GitHub URL has an https:// scheme.
 * Returns an empty string for blank inputs or strings that don't look like URLs
 * (no dot present — prevents producing links from bare words or unsafe schemes).
 */
export function normalizeContactUrl(url: string): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed || !trimmed.includes('.')) return ''
  // Reject known unsafe schemes before any prefix test so that edge-cases like
  // "javascript.malicious.com" (which contains a dot) are explicitly blocked.
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// ── Layout helpers ───────────────────────────────────────────────────────────

// Dark navy accent used for section headings and their underline rules.
const SECTION_NAVY = '#1a3a5c'

function sectionHeading(text: string, layout: LayoutConfig): Content {
  // Returns a stack: uppercase heading in navy + a thin navy rule.
  // The rule gives a clear visual boundary without heavy decoration.
  return {
    stack: [
      {
        text,
        style: 'sectionHeading',
        margin: [0, layout.sectionTopMargin, 0, 1],
      } as Content,
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            // A4 width (595pt) minus 2 × 45pt margins = 505pt
            x2: 505,
            y2: 0,
            lineWidth: 0.3,
            lineColor: SECTION_NAVY,
          },
        ],
        margin: [0, 0, 0, layout.sectionRuleBottomMargin],
      } as Content,
    ],
  } as Content
}

function divider(layout: LayoutConfig): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        // A4 width (595pt) minus 2 × 45pt margins = 505pt
        x2: 505,
        y2: 0,
        lineWidth: 0.4,
        lineColor: '#cccccc',
      },
    ],
    margin: [0, layout.dividerTopMargin, 0, 0],
  } as Content
}

function bulletLine(text: string, layout: LayoutConfig): Content {
  return {
    text: `• ${text}`,
    style: 'body',
    margin: [8, layout.bulletTopMargin, 0, 0],
  } as Content
}

function experienceEntry(exp: GeneratedCvExperience, lang: 'en' | 'cs', layout: LayoutConfig): Content[] {
  const items: Content[] = [
    {
      columns: [
        { text: `${exp.position}  ·  ${exp.company}`, style: 'entryTitle', width: '*' },
        { text: formatDateRange(exp.startDate, exp.endDate, lang), style: 'entryDate', width: 'auto' },
      ],
      margin: [0, layout.entryTopMargin, 0, 1],
    } as Content,
    ...exp.highlights.map((h) => bulletLine(h, layout)),
  ]
  return items
}

function projectEntry(proj: GeneratedCvProject, lang: 'en' | 'cs', layout: LayoutConfig): Content[] {
  const header = proj.role ? `${proj.name}  ·  ${proj.role}` : proj.name
  const items: Content[] = [
    { text: header, style: 'entryTitle', margin: [0, layout.entryTopMargin, 0, 1] } as Content,
  ]
  const url = proj.url ? normalizeContactUrl(proj.url) : ''
  if (url) {
    items.push({
      text: LABELS[lang].viewProject,
      link: url,
      style: 'projectLink',
      margin: [0, 1, 0, 1],
    } as Content)
  }
  items.push(...proj.highlights.map((h) => bulletLine(h, layout)))
  return items
}

// ── Document definition builder ───────────────────────────────────────────────

export function buildCvDocDefinition(
  cv: GeneratedCv,
  personal: PersonalInfo,
  layout: LayoutConfig = STANDARD_LAYOUT,
): TDocumentDefinitions {
  const lang = cv.language
  const labels = LABELS[lang]
  const content: Content[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  content.push({ text: personal.fullName, style: 'name' } as Content)

  if (cv.professionalTitle) {
    content.push({ text: cv.professionalTitle, style: 'jobTitle', margin: [0, 2, 0, 0] } as Content)
  }

  // ── Contact rows ─────────────────────────────────────────────────────────
  // Row 1: Location · Phone · Email (plain-text with optional mailto:/tel: links)
  // Row 2: LinkedIn · GitHub (compact labels with https:// hyperlinks)
  // Only populated fields are included; rows are omitted when empty.

  type Inline = { text: string; link?: string }

  function joinWithSeparator(parts: Inline[]): Inline[] {
    const result: Inline[] = []
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) result.push({ text: '  ·  ' })
      result.push(parts[i]!)
    }
    return result
  }

  const row1Parts: Inline[] = []
  if (personal.location) row1Parts.push({ text: personal.location })
  if (personal.phone) {
    row1Parts.push({
      text: personal.phone,
      link: `tel:${personal.phone.replace(/[\s\-()]/g, '')}`,
    })
  }
  if (personal.email) {
    row1Parts.push({ text: personal.email, link: `mailto:${personal.email}` })
  }

  if (row1Parts.length > 0) {
    content.push({
      text: joinWithSeparator(row1Parts),
      style: 'contact',
      margin: [0, 3, 0, 0],
    } as unknown as Content)
  }

  const row2Parts: Inline[] = []
  if (personal.linkedIn) {
    const url = normalizeContactUrl(personal.linkedIn)
    if (url) row2Parts.push({ text: 'LinkedIn', link: url })
  }
  if (personal.github) {
    const url = normalizeContactUrl(personal.github)
    if (url) row2Parts.push({ text: 'GitHub', link: url })
  }

  if (row2Parts.length > 0) {
    content.push({
      text: joinWithSeparator(row2Parts),
      style: 'contact',
      margin: [0, 2, 0, 0],
    } as unknown as Content)
  }

  content.push(divider(layout))

  // ── Professional Summary ──────────────────────────────────────────────────
  if (cv.professionalSummary) {
    content.push(sectionHeading(labels.summary, layout))
    content.push({ text: cv.professionalSummary, style: 'body' } as Content)
  }

  // ── Technical Skills ──────────────────────────────────────────────────────
  if (cv.technicalSkills.length > 0) {
    content.push(sectionHeading(labels.skills, layout))
    content.push({ text: cv.technicalSkills.join('  ·  '), style: 'body' } as Content)
  }

  // ── Professional Experience ───────────────────────────────────────────────
  if (cv.experience.length > 0) {
    content.push(sectionHeading(labels.experience, layout))
    for (const exp of cv.experience) {
      content.push(...experienceEntry(exp, lang, layout))
    }
  }

  // ── Selected Projects ─────────────────────────────────────────────────────
  if (cv.projects.length > 0) {
    content.push(sectionHeading(labels.projects, layout))
    for (const proj of cv.projects) {
      content.push(...projectEntry(proj, lang, layout))
    }
  }

  // ── Education & Training ──────────────────────────────────────────────────
  if (cv.education.length > 0) {
    content.push(sectionHeading(labels.education, layout))
    for (const edu of cv.education) {
      content.push({
        columns: [
          {
            text: `${edu.degree}${edu.field ? ` ${edu.field}` : ''}  ·  ${edu.institution}`,
            style: 'entryTitle',
            width: '*',
          },
        ],
        margin: [0, layout.entryTopMargin, 0, 0],
      } as Content)
    }
  }

  // ── Languages ─────────────────────────────────────────────────────────────
  if (cv.languages.length > 0) {
    content.push(sectionHeading(labels.languages, layout))
    const langText = cv.languages.map((l) => `${l.language}: ${l.proficiency}`).join('  ·  ')
    content.push({ text: langText, style: 'body' } as Content)
  }

  const styles: Record<string, Style> = {
    name: { fontSize: 18, bold: true, color: '#1a1a1a' },
    jobTitle: { fontSize: 10.5, color: '#555555' },
    contact: { fontSize: 8, color: '#666666' },
    // Navy accent differentiates section headings from entry titles (also bold, also dark).
    // characterSpacing adds breathing room to uppercase letters at this small size.
    sectionHeading: { fontSize: 9.5, bold: true, color: SECTION_NAVY, characterSpacing: 0.5 },
    entryTitle: { fontSize: 9, bold: true, color: '#1a1a1a' },
    entryDate: { fontSize: 8.5, color: '#666666' },
    body: { fontSize: 9, color: '#333333', lineHeight: layout.bodyLineHeight },
    projectLink: { fontSize: 8, color: SECTION_NAVY },
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    // ~16 mm margins (1 mm ≈ 2.835 pt)
    pageMargins: [45, 45, 45, 45],
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      lineHeight: 1.3,
    },
    styles,
  }
}

// ── Internal PDF generation helper ────────────────────────────────────────────

interface PdfMakeInstance {
  fonts: Record<string, unknown>
  createPdf: (docDef: TDocumentDefinitions) => { getBuffer: () => Promise<Uint8Array> }
}

async function buildPdfMake(): Promise<PdfMakeInstance> {
  const pdfMakeModule = await import('pdfmake/build/pdfmake')
  // The browser bundle exports a default pdfmake instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfMake = ((pdfMakeModule as any).default ?? pdfMakeModule) as PdfMakeInstance

  const fonts = await loadFonts()

  // Register fonts on the global pdfmake instance (required by 0.3.x)
  // Cast needed because @types/pdfmake does not yet expose Uint8Array as a font source type
  pdfMake.fonts = {
    Roboto: {
      normal: fonts.normal,
      bold: fonts.bold,
      italics: fonts.italics,
      bolditalics: fonts.bolditalics,
    },
  }

  return pdfMake
}

async function renderLayout(
  pdfMake: PdfMakeInstance,
  cv: GeneratedCv,
  personal: PersonalInfo,
  layout: LayoutConfig,
): Promise<{ rawBuffer: Uint8Array; pages: number }> {
  const docDef = buildCvDocDefinition(cv, personal, layout)
  // `getBuffer()` is on the OutputDocument prototype (Promise-based in 0.3.x).
  // pdfmake types it as Promise<Buffer>; at runtime it may also be Uint8Array.
  const rawBuffer: Uint8Array = await pdfMake.createPdf(docDef).getBuffer()
  const pages = await countPdfPages(rawBuffer)
  return { rawBuffer, pages }
}

function bufferToBlob(rawBuffer: Uint8Array): Blob {
  // Copy into a fresh ArrayBuffer to satisfy Blob's strict BlobPart typing.
  // pdfmake may return a Buffer (Node.js) whose backing ArrayBufferLike is
  // not necessarily a plain ArrayBuffer.
  const arrayBuffer = new ArrayBuffer(rawBuffer.length)
  new Uint8Array(arrayBuffer).set(rawBuffer)
  return new Blob([arrayBuffer], { type: 'application/pdf' })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Result of a successful PDF generation, including which layout preset was used.
 * Returned by `generateCvPdfWithResult`; `generateCvPdf` returns only the blob.
 */
export interface CvPdfResult {
  blob: Blob
  /** Which layout was actually used to produce the returned PDF. */
  layout: 'standard' | 'compact'
}

/**
 * Generates a single-page A4 CV as a PDF Blob, with automatic compact fallback.
 *
 * Algorithm:
 *   1. Render with the standard layout.
 *   2. If it fits on one page, return it with layout='standard'.
 *   3. Otherwise render with the compact layout.
 *   4. If compact fits, return it with layout='compact'.
 *   5. Otherwise throw CvPdfError with code PDF_OVERFLOW.
 *
 * Throws a `CvPdfError` with code `PDF_OVERFLOW` only when neither layout fits.
 * Genuine rendering or parsing errors (non-CvPdfError) propagate unchanged.
 * Never silently truncates or returns a multi-page PDF as success.
 */
export async function generateCvPdfWithResult(cv: GeneratedCv, personal: PersonalInfo): Promise<CvPdfResult> {
  const pdfMake = await buildPdfMake()

  const { rawBuffer: standardBuffer, pages: standardPages } = await renderLayout(pdfMake, cv, personal, STANDARD_LAYOUT)
  if (standardPages === 1) {
    return { blob: bufferToBlob(standardBuffer), layout: 'standard' }
  }

  const { rawBuffer: compactBuffer, pages: compactPages } = await renderLayout(pdfMake, cv, personal, COMPACT_LAYOUT)
  if (compactPages === 1) {
    return { blob: bufferToBlob(compactBuffer), layout: 'compact' }
  }

  throwPdfError(
    'PDF_OVERFLOW',
    `CV content fills ${compactPages} pages in compact layout; maximum is 1. Shorten the content or reduce section detail.`,
  )
}

/**
 * Generates a single-page A4 CV as a PDF Blob.
 *
 * Attempts the standard layout first; falls back to a slightly more compact
 * layout if the content overflows one page. Throws a `CvPdfError` with code
 * `PDF_OVERFLOW` only when neither layout fits.
 *
 * Never silently truncates or returns a multi-page PDF as success.
 */
export async function generateCvPdf(cv: GeneratedCv, personal: PersonalInfo): Promise<Blob> {
  return (await generateCvPdfWithResult(cv, personal)).blob
}
