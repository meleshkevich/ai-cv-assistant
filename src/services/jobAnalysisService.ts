import type { ValidatedAnalysis } from '@/types/jobAnalysis'
import type { MasterProfile } from '@/types/profile'
import type { ExtensionSettings } from '@/types/settings'
import { isProfileEmpty } from '@/types/profile'
import { buildSystemPrompt, buildUserMessage, JOB_ANALYSIS_SCHEMA } from '@/prompts/analyzeJob'
import { callResponsesAPI, extractOutputText } from '@/services/openaiService'
import type { OpenAIError } from '@/services/openaiService'
import { parseAndValidateAnalysis, verifyAnalysis } from '@/utils/jobAnalysisValidator'

export type { OpenAIError } from '@/services/openaiService'

// Maximum combined size of the user message in characters. Well under gpt-4o-mini's
// 128k-token (≈512k-char) context window; a generous guard against unusually large profiles.
const MAX_INPUT_CHARS = 400_000

function throwAnalysisError(code: string, message: string): never {
  throw { code, message }
}

function devLog(stage: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  if (data !== undefined) {
    console.log(`[analyzeJob] ${stage}`, data)
  } else {
    console.log(`[analyzeJob] ${stage}`)
  }
}

/**
 * Runs the complete analysis pipeline:
 *   1. Validates inputs
 *   2. Builds the OpenAI request payload
 *   3. Calls the Responses API
 *   4. Parses and validates the structured JSON response
 *   5. Verifies evidence references against the actual profile
 *
 * Always throws an object matching OpenAIError on any failure — including
 * unexpected runtime errors (e.g. corrupted profile data).
 */
export async function analyzeJob(
  jobDescription: string,
  profile: MasterProfile,
  settings: ExtensionSettings,
  signal?: AbortSignal,
): Promise<ValidatedAnalysis> {
  try {
    return await runAnalysisPipeline(jobDescription, profile, settings, signal)
  } catch (err) {
    if (isAnalysisError(err)) throw err
    // Convert any unexpected runtime error so callers always see a typed OpenAIError.
    if (import.meta.env.DEV) {
      console.error('[analyzeJob] Unexpected error:', {
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? (err.stack ?? '').slice(0, 500) : undefined,
      })
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw { code: 'API_ERROR', message: `Unexpected analysis error: ${msg}` } satisfies OpenAIError
  }
}

async function runAnalysisPipeline(
  jobDescription: string,
  profile: MasterProfile,
  settings: ExtensionSettings,
  signal?: AbortSignal,
): Promise<ValidatedAnalysis> {
  // ── Input validation ───────────────────────────────────────────────────────

  if (!settings.openaiApiKey.trim()) {
    throwAnalysisError('NO_API_KEY', 'No API key configured. Add your OpenAI API key in Settings.')
  }

  if (!jobDescription.trim()) {
    throwAnalysisError('EMPTY_JOB', 'The job description is empty. Scan a job listing first.')
  }

  if (isProfileEmpty(profile)) {
    throwAnalysisError(
      'EMPTY_PROFILE',
      'Your Master Profile is empty. Add experience or projects in the My Profile tab.',
    )
  }

  devLog('profile-stats', {
    experienceCount: Array.isArray(profile.experience) ? profile.experience.length : 'not-array',
    projectCount: Array.isArray(profile.projects) ? profile.projects.length : 'not-array',
    educationCount: Array.isArray(profile.education) ? profile.education.length : 'not-array',
    languageCount: Array.isArray(profile.languages) ? profile.languages.length : 'not-array',
    hasGeneralNotes: Boolean(profile.generalNotes),
  })

  devLog('build-user-message')
  const userMessage = buildUserMessage(jobDescription, profile)
  if (userMessage.length > MAX_INPUT_CHARS) {
    throwAnalysisError(
      'INPUT_TOO_LARGE',
      'The combined job description and profile exceeds the size limit. Shorten some descriptions and try again.',
    )
  }

  // ── Build request ──────────────────────────────────────────────────────────

  const request = {
    model: settings.openaiModel,
    instructions: buildSystemPrompt(),
    input: [{ role: 'user' as const, content: userMessage }],
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'job_analysis',
        strict: true as const,
        schema: JOB_ANALYSIS_SCHEMA as Record<string, unknown>,
      },
    },
    store: false as const,
    temperature: 0.2,
    max_output_tokens: 4096,
  }

  // ── Call API ───────────────────────────────────────────────────────────────

  devLog('call-api', { model: settings.openaiModel })
  const response = await callResponsesAPI(request, settings.openaiApiKey, signal)

  devLog('response-received', {
    status: response.status,
    outputItemTypes: response.output.map((item) => item.type),
  })

  if (response.status === 'incomplete') {
    throwAnalysisError(
      'RESPONSE_INCOMPLETE',
      'The analysis was cut off (output limit reached). The job description or profile may be too long.',
    )
  }

  if (response.status !== 'completed') {
    throwAnalysisError(
      'RESPONSE_INVALID',
      `Unexpected response status: "${response.status}". Please retry.`,
    )
  }

  const rawText = extractOutputText(response)
  devLog('extract-output-text', { found: rawText !== null, length: rawText?.length ?? 0 })

  if (!rawText) {
    throwAnalysisError(
      'RESPONSE_INVALID',
      'The API returned no text output. Please retry.',
    )
  }

  // ── Parse and validate ─────────────────────────────────────────────────────

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
    devLog('json-parse-ok')
  } catch {
    devLog('json-parse-failed')
    throwAnalysisError(
      'RESPONSE_INVALID',
      'The API response could not be parsed as JSON. Please retry.',
    )
  }

  let analysis
  try {
    analysis = parseAndValidateAnalysis(parsed)
    devLog('schema-validate-ok')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    devLog('schema-validate-failed', { detail })
    throwAnalysisError('SCHEMA_VIOLATION', `Analysis response schema error: ${detail}`)
  }

  // ── Verify evidence references ─────────────────────────────────────────────

  try {
    const result = verifyAnalysis(analysis, profile)
    devLog('verify-ok', { issueCount: result.issues.length })
    return result
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    devLog('verify-failed', { detail })
    throwAnalysisError('SCHEMA_VIOLATION', `Analysis verification error: ${detail}`)
  }
}

// ── Error type guard ──────────────────────────────────────────────────────────

export function isAnalysisError(value: unknown): value is OpenAIError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  )
}
