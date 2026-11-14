import type { GeneratedCv } from '@/types/application'
import type { PersonalInfo } from '@/types/profile'
import type { ExtensionSettings } from '@/types/settings'
import type { ResponsesAPIRequest } from './openaiService'
import { callResponsesAPI, extractOutputText } from './openaiService'
import { generateCvPdfWithResult, isCvPdfError } from './cvPdfService'
import {
  buildCompressionSystemPrompt,
  buildCompressionUserMessage,
  CV_COMPRESSION_SCHEMA,
} from '@/prompts/compressCv'
import type { CompressionPromptOptions } from '@/prompts/compressCv'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CvCompressionProposal {
  professionalSummary: string
  technicalSkills: string[]
  experience: Array<{ sourceId: string; highlights: string[] }>
  projects: Array<{ sourceId: string; highlights: string[] }>
}

export type CvCompressionValidationErrorCode =
  | 'UNKNOWN_EXP_SOURCE_ID'
  | 'UNKNOWN_PROJ_SOURCE_ID'
  | 'DUPLICATE_EXP_SOURCE_ID'
  | 'DUPLICATE_PROJ_SOURCE_ID'
  | 'EMPTY_HIGHLIGHTS'

export interface CvCompressionValidationIssue {
  code: CvCompressionValidationErrorCode
  detail: string
}

export interface CvCompressionValidationResult {
  valid: boolean
  issues: CvCompressionValidationIssue[]
}

export interface CvCompressionResult {
  proposal: CvCompressionProposal
  /** The original CV passed by the caller — used for before/after comparison. */
  originalCv: GeneratedCv
  /** originalCv with proposal applied — ready to render as PDF. */
  mergedCv: GeneratedCv
  /** Whether mergedCv fits on a single A4 page. */
  fits: boolean
  /** How many AI requests were made (1 or 2). */
  attemptCount: 1 | 2
}

export interface FitCheckResult {
  fits: boolean
  layout?: 'standard' | 'compact'
}

export type CvCompressionErrorCode =
  | 'NO_API_KEY'
  | 'RESPONSE_INVALID'
  | 'VALIDATION_FAILED'
  | 'INVALID_API_KEY'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'REQUEST_ABORTED'
  | 'API_ERROR'

export interface CvCompressionError {
  code: CvCompressionErrorCode
  message: string
}

const CV_COMPRESSION_ERROR_CODES = new Set<string>([
  'NO_API_KEY',
  'RESPONSE_INVALID',
  'VALIDATION_FAILED',
  'INVALID_API_KEY',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'MODEL_NOT_FOUND',
  'NETWORK_ERROR',
  'REQUEST_ABORTED',
  'API_ERROR',
])

export function isCvCompressionError(value: unknown): value is CvCompressionError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    CV_COMPRESSION_ERROR_CODES.has((value as Record<string, unknown>).code as string)
  )
}

function throwCompressionError(code: CvCompressionErrorCode, message: string): never {
  throw { code, message } satisfies CvCompressionError
}

// ── Proposal parsing ──────────────────────────────────────────────────────────

/**
 * Parses raw AI output into a typed `CvCompressionProposal`.
 * Throws `CvCompressionError` with code `RESPONSE_INVALID` on any shape mismatch.
 */
export function parseCvCompressionProposal(raw: unknown): CvCompressionProposal {
  if (typeof raw !== 'object' || raw === null) {
    throwCompressionError('RESPONSE_INVALID', 'AI response is not an object.')
  }

  const r = raw as Record<string, unknown>

  if (typeof r.professionalSummary !== 'string') {
    throwCompressionError('RESPONSE_INVALID', 'Missing or invalid professionalSummary.')
  }

  if (!Array.isArray(r.technicalSkills)) {
    throwCompressionError('RESPONSE_INVALID', 'Missing or invalid technicalSkills: expected array.')
  }
  if (!(r.technicalSkills as unknown[]).every((s) => typeof s === 'string')) {
    throwCompressionError('RESPONSE_INVALID', 'technicalSkills contains non-string items.')
  }

  if (!Array.isArray(r.experience)) {
    throwCompressionError('RESPONSE_INVALID', 'Missing or invalid experience: expected array.')
  }
  for (let i = 0; i < (r.experience as unknown[]).length; i++) {
    const rawEntry = (r.experience as unknown[])[i]
    if (typeof rawEntry !== 'object' || rawEntry === null) {
      throwCompressionError('RESPONSE_INVALID', `experience[${i}] is not an object.`)
    }
    const entry = rawEntry as Record<string, unknown>
    if (typeof entry.sourceId !== 'string') {
      throwCompressionError('RESPONSE_INVALID', `experience[${i}] missing string sourceId.`)
    }
    if (!Array.isArray(entry.highlights)) {
      throwCompressionError('RESPONSE_INVALID', `experience[${i}] highlights is not an array.`)
    }
    if (!(entry.highlights as unknown[]).every((h) => typeof h === 'string')) {
      throwCompressionError('RESPONSE_INVALID', `experience[${i}] highlights contains non-string items.`)
    }
  }

  if (!Array.isArray(r.projects)) {
    throwCompressionError('RESPONSE_INVALID', 'Missing or invalid projects: expected array.')
  }
  for (let i = 0; i < (r.projects as unknown[]).length; i++) {
    const rawEntry = (r.projects as unknown[])[i]
    if (typeof rawEntry !== 'object' || rawEntry === null) {
      throwCompressionError('RESPONSE_INVALID', `projects[${i}] is not an object.`)
    }
    const entry = rawEntry as Record<string, unknown>
    if (typeof entry.sourceId !== 'string') {
      throwCompressionError('RESPONSE_INVALID', `projects[${i}] missing string sourceId.`)
    }
    if (!Array.isArray(entry.highlights)) {
      throwCompressionError('RESPONSE_INVALID', `projects[${i}] highlights is not an array.`)
    }
    if (!(entry.highlights as unknown[]).every((h) => typeof h === 'string')) {
      throwCompressionError('RESPONSE_INVALID', `projects[${i}] highlights contains non-string items.`)
    }
  }

  return {
    professionalSummary: r.professionalSummary as string,
    technicalSkills: (r.technicalSkills as unknown[]) as string[],
    experience: ((r.experience as unknown[]) as Array<Record<string, unknown>>).map((e) => ({
      sourceId: e.sourceId as string,
      highlights: (e.highlights as unknown[]) as string[],
    })),
    projects: ((r.projects as unknown[]) as Array<Record<string, unknown>>).map((p) => ({
      sourceId: p.sourceId as string,
      highlights: (p.highlights as unknown[]) as string[],
    })),
  }
}

// ── Proposal validation ───────────────────────────────────────────────────────

/**
 * Validates business rules for a parsed proposal against the original CV.
 *
 * Rules checked:
 * - All sourceIds in `experience` must exist in `originalCv.experience`.
 * - All sourceIds in `projects` must exist in `originalCv.projects`.
 * - No sourceId may appear more than once in `experience` or `projects`.
 * - Each experience and project entry must have at least one highlight.
 */
export function validateCompressionProposal(
  proposal: CvCompressionProposal,
  originalCv: GeneratedCv,
): CvCompressionValidationResult {
  const issues: CvCompressionValidationIssue[] = []

  const originalExpIds = new Set(originalCv.experience.map((e) => e.sourceId))
  const originalProjIds = new Set(originalCv.projects.map((p) => p.sourceId))

  const seenExpIds = new Set<string>()
  for (const entry of proposal.experience) {
    if (!originalExpIds.has(entry.sourceId)) {
      issues.push({
        code: 'UNKNOWN_EXP_SOURCE_ID',
        detail: `experience sourceId not in original CV: "${entry.sourceId}"`,
      })
    }
    if (seenExpIds.has(entry.sourceId)) {
      issues.push({
        code: 'DUPLICATE_EXP_SOURCE_ID',
        detail: `experience sourceId appears more than once: "${entry.sourceId}"`,
      })
    }
    seenExpIds.add(entry.sourceId)
    if (entry.highlights.length === 0) {
      issues.push({
        code: 'EMPTY_HIGHLIGHTS',
        detail: `experience entry "${entry.sourceId}" has zero highlights.`,
      })
    }
  }

  const seenProjIds = new Set<string>()
  for (const entry of proposal.projects) {
    if (!originalProjIds.has(entry.sourceId)) {
      issues.push({
        code: 'UNKNOWN_PROJ_SOURCE_ID',
        detail: `projects sourceId not in original CV: "${entry.sourceId}"`,
      })
    }
    if (seenProjIds.has(entry.sourceId)) {
      issues.push({
        code: 'DUPLICATE_PROJ_SOURCE_ID',
        detail: `projects sourceId appears more than once: "${entry.sourceId}"`,
      })
    }
    seenProjIds.add(entry.sourceId)
    if (entry.highlights.length === 0) {
      issues.push({
        code: 'EMPTY_HIGHLIGHTS',
        detail: `projects entry "${entry.sourceId}" has zero highlights.`,
      })
    }
  }

  return { valid: issues.length === 0, issues }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Produces a new `GeneratedCv` with only the compressible fields replaced by the proposal.
 *
 * Immutable fields (company, position, startDate, endDate, project name/role/url,
 * education, languages) are always taken from `original` — the AI never touches them.
 * Experience or project entries absent from the proposal keep their original highlights.
 */
export function mergeCvWithProposal(original: GeneratedCv, proposal: CvCompressionProposal): GeneratedCv {
  const proposedExpHighlights = new Map(proposal.experience.map((e) => [e.sourceId, e.highlights]))
  const proposedProjHighlights = new Map(proposal.projects.map((p) => [p.sourceId, p.highlights]))

  return {
    ...original,
    professionalSummary: proposal.professionalSummary,
    technicalSkills: [...proposal.technicalSkills],
    experience: original.experience.map((exp) => ({
      ...exp,
      highlights: proposedExpHighlights.get(exp.sourceId) ?? [...exp.highlights],
    })),
    projects: original.projects.map((proj) => ({
      ...proj,
      highlights: proposedProjHighlights.get(proj.sourceId) ?? [...proj.highlights],
    })),
  }
}

// ── PDF fit check ─────────────────────────────────────────────────────────────

/**
 * Checks whether the given CV fits on a single A4 page.
 * Returns `{ fits: false }` on overflow without throwing.
 * Re-throws genuine render/parse errors (non-PDF_OVERFLOW) unchanged.
 */
export async function checkCvFitsOnePage(cv: GeneratedCv, personal: PersonalInfo): Promise<FitCheckResult> {
  try {
    const result = await generateCvPdfWithResult(cv, personal)
    return { fits: true, layout: result.layout }
  } catch (err) {
    if (isCvPdfError(err) && err.code === 'PDF_OVERFLOW') {
      return { fits: false }
    }
    throw err
  }
}

// ── Main AI compression function ──────────────────────────────────────────────

export type CompressionState =
  | { status: 'idle' }
  | { status: 'loading'; attempt: 1 | 2 }
  | { status: 'success'; result: CvCompressionResult }
  | { status: 'error'; message: string }

/** Vacancy/retry context passed down from the view layer. */
export interface CvCompressionContextOptions {
  vacancyTitle?: string
  vacancyDescription?: string
}

/**
 * Calls the OpenAI Responses API to compress CV text, validates the proposal,
 * merges it with the original CV, and verifies if it fits on one page.
 *
 * Returns `CvCompressionResult` with `fits: true/false`.
 * Never throws for PDF overflow — that is surfaced via `result.fits`.
 *
 * Throws `CvCompressionError` on:
 * - Missing API key (NO_API_KEY)
 * - OpenAI network/auth/quota failures
 * - Invalid JSON or schema mismatch (RESPONSE_INVALID)
 * - Business-rule violations in proposal (VALIDATION_FAILED)
 */
export async function compressCvWithAi(
  cv: GeneratedCv,
  personal: PersonalInfo,
  settings: ExtensionSettings,
  signal?: AbortSignal,
  options?: CompressionPromptOptions,
): Promise<CvCompressionResult> {
  if (!settings.openaiApiKey.trim()) {
    throwCompressionError('NO_API_KEY', 'No OpenAI API key configured. Add your key in Settings.')
  }

  const request: ResponsesAPIRequest = {
    model: settings.openaiModel,
    instructions: buildCompressionSystemPrompt(options),
    input: [{ role: 'user', content: buildCompressionUserMessage(cv) }],
    text: {
      format: {
        type: 'json_schema',
        name: 'cv_compression',
        strict: true,
        schema: CV_COMPRESSION_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    store: false,
    temperature: 0.1,
  }

  // Call the API — only errors from callResponsesAPI are caught here.
  let responseText: string | null = null
  try {
    const response = await callResponsesAPI(request, settings.openaiApiKey, signal)
    responseText = extractOutputText(response)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    throwCompressionError(
      (e.code ?? 'API_ERROR') as CvCompressionErrorCode,
      e.message ?? 'An unexpected error occurred.',
    )
  }

  if (responseText === null) {
    throwCompressionError('RESPONSE_INVALID', 'AI returned an empty response.')
  }

  // JSON.parse returns `any`; we treat it as `unknown` and validate in parseCvCompressionProposal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedJson: any
  try {
    parsedJson = JSON.parse(responseText)
  } catch {
    throwCompressionError('RESPONSE_INVALID', 'AI response is not valid JSON.')
  }

  const proposal = parseCvCompressionProposal(parsedJson as unknown)

  const validation = validateCompressionProposal(proposal, cv)
  if (!validation.valid) {
    const detail = validation.issues.map((i) => i.detail).join('; ')
    throwCompressionError('VALIDATION_FAILED', `AI proposal failed validation: ${detail}`)
  }

  const mergedCv = mergeCvWithProposal(cv, proposal)

  const fitResult = await checkCvFitsOnePage(mergedCv, personal)

  return { proposal, originalCv: cv, mergedCv, fits: fitResult.fits, attemptCount: 1 }
}

// ── Adaptive compression (up to 2 attempts) ───────────────────────────────────

/**
 * Compresses a CV with up to two AI attempts.
 *
 * Attempt 1: standard budgets + vacancy context.
 * Attempt 2 (only if attempt 1 overflows): stricter budgets, attempt 1 merged CV as input.
 *
 * Always returns a result — never throws for PDF overflow.
 * The returned `originalCv` is always the caller-supplied CV for before/after comparison.
 * The returned `fits` is `false` if both attempts still overflow.
 */
export async function compressCvWithAiAdaptive(
  cv: GeneratedCv,
  personal: PersonalInfo,
  settings: ExtensionSettings,
  options?: CvCompressionContextOptions,
  signal?: AbortSignal,
  callbacks?: { onRetryStarted?: () => void },
): Promise<CvCompressionResult> {
  const result1 = await compressCvWithAi(cv, personal, settings, signal, {
    ...options,
    isRetry: false,
  })

  if (result1.fits) {
    return result1
  }

  // Check abort before making the second API call.
  if (signal?.aborted) {
    throwCompressionError('REQUEST_ABORTED', 'Compression was cancelled.')
  }

  callbacks?.onRetryStarted?.()

  // Second attempt — use the first compressed CV as input with stricter budgets.
  const result2 = await compressCvWithAi(result1.mergedCv, personal, settings, signal, {
    ...options,
    isRetry: true,
  })

  // Always return the original caller-supplied CV for before/after comparison.
  return {
    ...result2,
    originalCv: cv,
    attemptCount: 2,
  }
}
