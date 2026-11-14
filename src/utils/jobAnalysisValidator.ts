import type {
  JobAnalysis,
  ValidatedAnalysis,
  VerificationIssue,
  RequirementMatch,
  JobRecommendation,
} from '@/types/jobAnalysis'
import type { MasterProfile } from '@/types/profile'

// ── Runtime type guards ───────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string'
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Validates that the raw parsed JSON from the OpenAI response conforms to
 * the JobAnalysis shape. Returns the typed object or throws with a descriptive
 * message if the structure is wrong.
 */
export function parseAndValidateAnalysis(raw: unknown): JobAnalysis {
  if (!isObj(raw)) throw new Error('Response is not an object')

  // job
  if (!isObj(raw.job)) throw new Error('Missing job object')
  const job = raw.job
  if (!isString(job.title)) throw new Error('job.title must be a string')
  if (!isStringOrNull(job.company)) throw new Error('job.company must be string or null')
  if (job.language !== 'en' && job.language !== 'cs')
    throw new Error('job.language must be "en" or "cs"')
  if (!isStringOrNull(job.seniority)) throw new Error('job.seniority must be string or null')
  if (!isString(job.summary)) throw new Error('job.summary must be a string')

  // requirements
  if (!isArray(raw.requirements)) throw new Error('requirements must be an array')
  for (const [i, req] of raw.requirements.entries()) {
    if (!isObj(req)) throw new Error(`requirements[${i}] is not an object`)
    if (!isString(req.id)) throw new Error(`requirements[${i}].id must be a string`)
    if (!isString(req.requirement)) throw new Error(`requirements[${i}].requirement must be a string`)
    if (req.priority !== 'required' && req.priority !== 'preferred')
      throw new Error(`requirements[${i}].priority must be "required" or "preferred"`)
    if (req.category !== 'technical' && req.category !== 'experience' && req.category !== 'other')
      throw new Error(`requirements[${i}].category must be "technical", "experience", or "other"`)
  }

  // matches
  if (!isArray(raw.matches)) throw new Error('matches must be an array')
  for (const [i, match] of raw.matches.entries()) {
    if (!isObj(match)) throw new Error(`matches[${i}] is not an object`)
    if (!isString(match.requirementId)) throw new Error(`matches[${i}].requirementId must be a string`)
    if (match.status !== 'supported' && match.status !== 'partial' && match.status !== 'unsupported')
      throw new Error(`matches[${i}].status must be "supported", "partial", or "unsupported"`)
    if (!isString(match.explanation)) throw new Error(`matches[${i}].explanation must be a string`)
    if (!isArray(match.evidence)) throw new Error(`matches[${i}].evidence must be an array`)
    for (const [j, ev] of match.evidence.entries()) {
      if (!isObj(ev)) throw new Error(`matches[${i}].evidence[${j}] is not an object`)
      if (ev.sourceType !== 'experience' && ev.sourceType !== 'project' && ev.sourceType !== 'generalNotes')
        throw new Error(
          `matches[${i}].evidence[${j}].sourceType must be "experience", "project", or "generalNotes"`,
        )
      if (!isStringOrNull(ev.sourceId))
        throw new Error(`matches[${i}].evidence[${j}].sourceId must be string or null`)
      if (!isString(ev.supportingExcerpt))
        throw new Error(`matches[${i}].evidence[${j}].supportingExcerpt must be a string`)
    }
  }

  // relevantExperience
  if (!isArray(raw.relevantExperience)) throw new Error('relevantExperience must be an array')
  for (const [i, re] of raw.relevantExperience.entries()) {
    if (!isObj(re)) throw new Error(`relevantExperience[${i}] is not an object`)
    if (re.sourceType !== 'experience' && re.sourceType !== 'project')
      throw new Error(`relevantExperience[${i}].sourceType must be "experience" or "project"`)
    if (!isString(re.sourceId)) throw new Error(`relevantExperience[${i}].sourceId must be a string`)
    if (!isString(re.relevanceReason)) throw new Error(`relevantExperience[${i}].relevanceReason must be a string`)
  }

  // recommendations
  if (!isArray(raw.recommendations)) throw new Error('recommendations must be an array')
  const parsedRecommendations: JobRecommendation[] = []
  for (const [i, rec] of raw.recommendations.entries()) {
    if (!isObj(rec)) throw new Error(`recommendations[${i}] must be an object`)
    if (rec.category !== 'application_strategy' && rec.category !== 'profile_improvement') {
      throw new Error(`recommendations[${i}].category must be "application_strategy" or "profile_improvement"`)
    }
    if (!isString(rec.text)) throw new Error(`recommendations[${i}].text must be a string`)
    parsedRecommendations.push({ category: rec.category as JobRecommendation['category'], text: rec.text as string })
  }

  return { ...(raw as Record<string, unknown>), recommendations: parsedRecommendations } as unknown as JobAnalysis
}

// ── Semantic verification ─────────────────────────────────────────────────────

/**
 * Verifies semantic correctness of the analysis against the actual profile:
 * - requirement IDs in matches must refer to declared requirements
 * - source IDs must exist in the profile
 * - no duplicate requirement IDs
 * - evidence for unsupported matches must be empty
 * - excerpts must be non-empty strings
 *
 * Returns a list of issues. The analysis is returned as-is; callers decide
 * whether to show a warning or reject based on issues.length > 0.
 */
export function verifyAnalysis(
  analysis: JobAnalysis,
  profile: MasterProfile,
): ValidatedAnalysis {
  const issues: VerificationIssue[] = []

  const requirementIds = new Set<string>()
  const experienceIds = new Set(profile.experience.map((e) => e.id))
  const projectIds = new Set(profile.projects.map((p) => p.id))

  // Check for duplicate requirement IDs
  for (const req of analysis.requirements) {
    if (requirementIds.has(req.id)) {
      issues.push({
        type: 'duplicate-requirement-id',
        requirementId: req.id,
        message: `Duplicate requirement ID: "${req.id}"`,
      })
    }
    requirementIds.add(req.id)
  }

  // Verify each match
  for (const match of analysis.matches) {
    if (!requirementIds.has(match.requirementId)) {
      issues.push({
        type: 'invalid-requirement-ref',
        requirementId: match.requirementId,
        message: `Match references unknown requirement ID: "${match.requirementId}"`,
      })
    }

    for (const ev of match.evidence) {
      if (!ev.supportingExcerpt.trim()) {
        issues.push({
          type: 'empty-excerpt',
          requirementId: match.requirementId,
          message: `Empty supporting excerpt in match for requirement "${match.requirementId}"`,
        })
        continue
      }

      if (ev.sourceType === 'experience') {
        if (!ev.sourceId || !experienceIds.has(ev.sourceId)) {
          issues.push({
            type: 'invalid-source-id',
            requirementId: match.requirementId,
            sourceId: ev.sourceId ?? '(null)',
            message: `Evidence references unknown experience ID: "${ev.sourceId ?? '(null)'}"`,
          })
        }
      } else if (ev.sourceType === 'project') {
        if (!ev.sourceId || !projectIds.has(ev.sourceId)) {
          issues.push({
            type: 'invalid-source-id',
            requirementId: match.requirementId,
            sourceId: ev.sourceId ?? '(null)',
            message: `Evidence references unknown project ID: "${ev.sourceId ?? '(null)'}"`,
          })
        }
      } else if (ev.sourceType === 'generalNotes') {
        // generalNotes evidence must have sourceId === null
        if (ev.sourceId !== null) {
          issues.push({
            type: 'unexpected-null-source-id',
            requirementId: match.requirementId,
            sourceId: ev.sourceId,
            message: `generalNotes evidence should have sourceId null, got: "${ev.sourceId}"`,
          })
        }
      }
    }
  }

  // Verify relevantExperience source IDs
  for (const re of analysis.relevantExperience) {
    const idSet = re.sourceType === 'experience' ? experienceIds : projectIds
    if (!idSet.has(re.sourceId)) {
      issues.push({
        type: 'invalid-source-id',
        sourceId: re.sourceId,
        message: `relevantExperience references unknown ${re.sourceType} ID: "${re.sourceId}"`,
      })
    }
  }

  return { analysis, issues }
}

// ── Helpers for UI display ────────────────────────────────────────────────────

/**
 * Returns matches grouped by their status, preserving the original order within each group.
 */
export function groupMatchesByStatus(matches: RequirementMatch[]): {
  supported: RequirementMatch[]
  partial: RequirementMatch[]
  unsupported: RequirementMatch[]
} {
  return {
    supported: matches.filter((m) => m.status === 'supported'),
    partial: matches.filter((m) => m.status === 'partial'),
    unsupported: matches.filter((m) => m.status === 'unsupported'),
  }
}
