// Centralized OpenAI model capability detection for the Responses API.
// All AI workflows use buildSamplingOptions() so they never hardcode temperature.

export type ModelCapabilityProfile = 'standard' | 'reasoning' | 'unknown'

export type ReasoningEffort = 'low' | 'medium' | 'high'

export interface SamplingOptions {
  /** Only present for standard models; omitted for reasoning and unknown models. */
  temperature?: number
  /** Only present for reasoning models; omitted for standard and unknown models. */
  reasoning?: { effort: ReasoningEffort }
}

// ── Known model families ─────────────────────────────────────────────────────

// Standard models support temperature. They do NOT support reasoning.effort.
// Matched as prefix: any model whose ID starts with one of these strings is standard.
const STANDARD_PREFIXES: readonly string[] = [
  'gpt-4o',       // gpt-4o, gpt-4o-mini, gpt-4o-realtime-preview, etc.
  'gpt-4.1',      // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  'gpt-4-',       // gpt-4-turbo, gpt-4-0613, gpt-4-32k, etc.
  'gpt-3.5-',     // gpt-3.5-turbo, gpt-3.5-turbo-16k, etc.
  'gpt-5.4-',     // gpt-5.4-mini (project default as of Task 006E)
  'chatgpt-4o',   // chatgpt-4o-latest
]

// Reasoning models do NOT support temperature or top_p.
// They support reasoning.effort.

// Exact model IDs for reasoning models with unusual naming.
const REASONING_EXACT: ReadonlySet<string> = new Set([
  'gpt-6.1-terra',
  'gpt-6.1-sol',
  'gpt-6-astra',
])

// Reasoning model series. Matched as: exact ID OR starts with "<series>-" OR "<series>.".
// Using separator-aware matching avoids false-positives like "o10-preview" matching "o1".
const REASONING_SERIES: readonly string[] = ['o1', 'o3', 'o4']

function matchesReasoningSeries(id: string): boolean {
  for (const series of REASONING_SERIES) {
    if (id === series || id.startsWith(`${series}-`) || id.startsWith(`${series}.`)) {
      return true
    }
  }
  return false
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the capability profile for an OpenAI model ID.
 *
 * - 'standard'  → temperature supported; reasoning.effort not supported
 * - 'reasoning' → temperature NOT supported; reasoning.effort supported
 * - 'unknown'   → model not recognized; callers apply conservative behavior
 */
export function getModelCapabilityProfile(modelId: string): ModelCapabilityProfile {
  const id = modelId.trim().toLowerCase()
  if (!id) return 'unknown'

  if (REASONING_EXACT.has(id)) return 'reasoning'
  if (matchesReasoningSeries(id)) return 'reasoning'

  for (const prefix of STANDARD_PREFIXES) {
    if (id.startsWith(prefix)) return 'standard'
  }

  return 'unknown'
}

/**
 * Returns the max_output_tokens budget for a job analysis request.
 *
 * Standard / unknown → 6144: covers complex jobs with up to ~15 requirements,
 * multi-sentence explanations, and brief evidence excerpts. This was raised from
 * the original 4096 which proved insufficient when Master Profile descriptions are
 * detailed — a dense analysis with 15 requirements can produce ~5 000 output tokens.
 *
 * Reasoning → 8192: reasoning tokens (at effort: 'low', typically 500–1 500) are
 * deducted from max_output_tokens, so the budget must include both internal
 * reasoning and the final JSON payload.
 *
 * These are output-token limits, not context-window limits. gpt-4o-mini's
 * 128k-token context window dwarfs any realistic input, so input size is never
 * the concern here.
 */
export function getAnalysisOutputBudget(modelId: string): number {
  if (getModelCapabilityProfile(modelId) === 'reasoning') return 8192
  return 6144
}

/**
 * Builds model-specific sampling options for a Responses API request.
 *
 * Standard models → `{ temperature: standardTemperature }`
 * Reasoning models → `{ reasoning: { effort: reasoningEffort } }`
 * Unknown models → `{}` (conservative: neither param sent to avoid 400 errors)
 *
 * Spread the returned object directly into the request body.
 * max_output_tokens is NOT included here — set it on the request separately.
 */
export function buildSamplingOptions(
  modelId: string,
  opts: { standardTemperature: number; reasoningEffort: ReasoningEffort },
): SamplingOptions {
  const profile = getModelCapabilityProfile(modelId)

  if (profile === 'standard') return { temperature: opts.standardTemperature }
  if (profile === 'reasoning') return { reasoning: { effort: opts.reasoningEffort } }

  // Unknown model — omit both to avoid 400 errors on either param.
  return {}
}
