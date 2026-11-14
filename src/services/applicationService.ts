import type { GeneratedApplication, ApplicationError } from '@/types/application'
import type { MasterProfile } from '@/types/profile'
import type { ValidatedAnalysis } from '@/types/jobAnalysis'
import type { ExtensionSettings } from '@/types/settings'
import { isProfileEmpty } from '@/types/profile'
import {
  buildApplicationSystemPrompt,
  buildApplicationUserMessage,
  APPLICATION_GENERATION_SCHEMA,
} from '@/prompts/generateApplication'
import { callResponsesAPI, extractOutputText } from '@/services/openaiService'
import { parseAndValidateApplication, verifyApplicationSources } from '@/utils/applicationValidator'

const MAX_INPUT_CHARS = 400_000

function throwError(code: ApplicationError['code'], message: string): never {
  throw { code, message } satisfies ApplicationError
}

function devLog(stage: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  if (data !== undefined) {
    console.log(`[generateApplication] ${stage}`, data)
  } else {
    console.log(`[generateApplication] ${stage}`)
  }
}

/**
 * Copies canonical project URLs from Master Profile into the generated CV projects.
 *
 * URL enrichment always runs AFTER successful source ID verification so that
 * invalid project sourceIds are still caught before this step executes. The AI
 * never produces project URLs (URL is not in the generation schema); every URL
 * in the returned application originates exclusively from the Master Profile.
 */
export function enrichProjectUrls(
  application: GeneratedApplication,
  profile: MasterProfile,
): GeneratedApplication {
  const urlByProjectId = new Map(
    profile.projects.map((p) => [p.id, p.url]),
  )
  return {
    ...application,
    cv: {
      ...application.cv,
      projects: application.cv.projects.map((proj) => {
        const url = urlByProjectId.get(proj.sourceId) ?? ''
        return url ? { ...proj, url } : proj
      }),
    },
  }
}

/**
 * Replaces AI-generated education and language entries with canonical values
 * taken directly from the Master Profile, preserving the profile's order and
 * exact factual values (institution names, degree titles, language names, proficiency levels).
 *
 * This runs after schema validation and before source ID verification so the
 * verification step sees valid profile IDs for education and languages.
 */
export function canonicalizeEducationAndLanguages(
  application: GeneratedApplication,
  profile: MasterProfile,
): GeneratedApplication {
  return {
    ...application,
    cv: {
      ...application.cv,
      education: profile.education.map((edu) => ({
        sourceId: edu.id,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
      })),
      languages: profile.languages.map((lang) => ({
        sourceId: lang.id,
        language: lang.language,
        proficiency: lang.proficiency,
      })),
    },
  }
}

export function isApplicationError(value: unknown): value is ApplicationError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  )
}

/**
 * Runs the complete application generation pipeline:
 *   1. Validates inputs
 *   2. Builds the OpenAI request payload
 *   3. Calls the Responses API
 *   4. Parses and validates the structured JSON response
 *   5. Verifies source ID references against the actual profile
 *
 * Always throws an ApplicationError on any failure.
 */
export async function generateApplication(
  jobDescription: string,
  profile: MasterProfile,
  analysis: ValidatedAnalysis,
  language: 'en' | 'cs',
  settings: ExtensionSettings,
  signal?: AbortSignal,
): Promise<GeneratedApplication> {
  try {
    return await runGenerationPipeline(jobDescription, profile, analysis, language, settings, signal)
  } catch (err) {
    if (isApplicationError(err)) throw err
    if (import.meta.env.DEV) {
      console.error('[generateApplication] Unexpected error:', {
        name: err instanceof Error ? err.name : 'unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? (err.stack ?? '').slice(0, 500) : undefined,
      })
    }
    const msg = err instanceof Error ? err.message : String(err)
    throwError('API_ERROR', `Unexpected generation error: ${msg}`)
  }
}

async function runGenerationPipeline(
  jobDescription: string,
  profile: MasterProfile,
  analysis: ValidatedAnalysis,
  language: 'en' | 'cs',
  settings: ExtensionSettings,
  signal?: AbortSignal,
): Promise<GeneratedApplication> {
  // ── Input validation ───────────────────────────────────────────────────────

  if (!settings.openaiApiKey.trim()) {
    throwError('NO_API_KEY', 'No API key configured. Add your OpenAI API key in Settings.')
  }

  if (!jobDescription.trim()) {
    throwError('EMPTY_JOB', 'The job description is empty. Scan a job listing first.')
  }

  if (isProfileEmpty(profile)) {
    throwError(
      'EMPTY_PROFILE',
      'Your Master Profile is empty. Add experience or projects in the My Profile tab.',
    )
  }

  devLog('build-user-message')
  const userMessage = buildApplicationUserMessage(jobDescription, profile, analysis, language)
  if (userMessage.length > MAX_INPUT_CHARS) {
    throwError(
      'INPUT_TOO_LARGE',
      'The combined input exceeds the size limit. Shorten some descriptions and try again.',
    )
  }

  // ── Build request ──────────────────────────────────────────────────────────

  const request = {
    model: settings.openaiModel,
    instructions: buildApplicationSystemPrompt(),
    input: [{ role: 'user' as const, content: userMessage }],
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'generated_application',
        strict: true as const,
        schema: APPLICATION_GENERATION_SCHEMA as Record<string, unknown>,
      },
    },
    store: false as const,
    temperature: 0.4,
    max_output_tokens: 8192,
  }

  // ── Call API ───────────────────────────────────────────────────────────────

  devLog('call-api', { model: settings.openaiModel, language })
  const response = await callResponsesAPI(request, settings.openaiApiKey, signal)

  devLog('response-received', {
    status: response.status,
    outputItemTypes: response.output.map((item) => item.type),
  })

  if (response.status === 'incomplete') {
    throwError(
      'RESPONSE_INCOMPLETE',
      'The generation was cut off (output limit reached). The job description or profile may be too long.',
    )
  }

  if (response.status !== 'completed') {
    throwError(
      'RESPONSE_INVALID',
      `Unexpected response status: "${response.status}". Please retry.`,
    )
  }

  const rawText = extractOutputText(response)
  devLog('extract-output-text', { found: rawText !== null, length: rawText?.length ?? 0 })

  if (!rawText) {
    throwError('RESPONSE_INVALID', 'The API returned no text output. Please retry.')
  }

  // ── Parse and validate ─────────────────────────────────────────────────────

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
    devLog('json-parse-ok')
  } catch {
    devLog('json-parse-failed')
    throwError('RESPONSE_INVALID', 'The API response could not be parsed as JSON. Please retry.')
  }

  let application: GeneratedApplication
  try {
    application = parseAndValidateApplication(parsed)
    devLog('schema-validate-ok')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    devLog('schema-validate-failed', { detail })
    throwError('SCHEMA_VIOLATION', `Generated application schema error: ${detail}`)
  }

  // Replace AI-generated education/languages with the canonical Master Profile values.
  // The AI may omit, paraphrase, or reorder these; the profile is the authoritative source.
  application = canonicalizeEducationAndLanguages(application, profile)
  devLog('canonicalize-edu-lang', {
    educationCount: application.cv.education.length,
    languagesCount: application.cv.languages.length,
  })

  // ── Verify source ID references ────────────────────────────────────────────

  const sourceIssues = verifyApplicationSources(application, profile)
  devLog('source-verify', { issueCount: sourceIssues.length })

  if (sourceIssues.length > 0) {
    const details = sourceIssues.map((i) => i.message).join('; ')
    throwError(
      'INVALID_SOURCE_IDS',
      `Generated content references profile entries that do not exist: ${details}. Please retry.`,
    )
  }

  // Copy canonical project URLs from Master Profile after source IDs are verified.
  // URL enrichment runs after verification so invalid sourceIds are still caught first.
  application = enrichProjectUrls(application, profile)
  devLog('enrich-project-urls', { projectCount: application.cv.projects.length })

  return application
}
