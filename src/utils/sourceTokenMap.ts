/**
 * Short, deterministic source reference tokens for AI application generation.
 *
 * Root cause of UUID hallucination: the AI had to reproduce 36-character UUIDs
 * verbatim. It confused experience UUIDs with project UUIDs and occasionally
 * invented plausible-looking but non-existent IDs.
 *
 * Fix: for each generation request, build a stable mapping from short category-
 * scoped tokens (EXP_1, PROJ_1, …) to actual profile UUIDs. The AI sees and
 * returns tokens; this module resolves them back to canonical UUIDs.
 *
 * The mapping is built from profile array order, so it is deterministic and
 * stable for a given profile snapshot. It is scoped to a single request —
 * never persisted. All stored drafts continue to use canonical UUIDs.
 */

import type { MasterProfile } from '@/types/profile'
import type { GeneratedApplication } from '@/types/application'

// ── Token patterns ────────────────────────────────────────────────────────────

const EXP_PATTERN = /^EXP_\d+$/
const PROJ_PATTERN = /^PROJ_\d+$/

function isExpToken(token: string): boolean {
  return EXP_PATTERN.test(token)
}

function isProjToken(token: string): boolean {
  return PROJ_PATTERN.test(token)
}

// ── Map types ─────────────────────────────────────────────────────────────────

export interface SourceTokenMap {
  /** EXP_1, EXP_2, … → canonical profile UUID */
  readonly expTokenToId: ReadonlyMap<string, string>
  /** PROJ_1, PROJ_2, … → canonical profile UUID */
  readonly projTokenToId: ReadonlyMap<string, string>
  /** EDU_1, EDU_2, … → canonical profile UUID (for prompt building only) */
  readonly eduTokenToId: ReadonlyMap<string, string>
  /** LANG_1, LANG_2, … → canonical profile UUID (for prompt building only) */
  readonly langTokenToId: ReadonlyMap<string, string>
  /** canonical UUID → EXP_N (for converting analysis relevantExperience refs) */
  readonly expIdToToken: ReadonlyMap<string, string>
  /** canonical UUID → PROJ_N (for converting analysis relevantExperience refs) */
  readonly projIdToToken: ReadonlyMap<string, string>
}

/**
 * Builds the token map for a generation request.
 *
 * EXP_N and PROJ_N tokens are 1-indexed, matching profile array positions.
 * The map is deterministic: same profile → same mapping every time.
 */
export function buildSourceTokenMap(profile: MasterProfile): SourceTokenMap {
  const expTokenToId = new Map<string, string>()
  const expIdToToken = new Map<string, string>()
  for (const [i, exp] of profile.experience.entries()) {
    const token = `EXP_${i + 1}`
    expTokenToId.set(token, exp.id)
    expIdToToken.set(exp.id, token)
  }

  const projTokenToId = new Map<string, string>()
  const projIdToToken = new Map<string, string>()
  for (const [i, proj] of profile.projects.entries()) {
    const token = `PROJ_${i + 1}`
    projTokenToId.set(token, proj.id)
    projIdToToken.set(proj.id, token)
  }

  const eduTokenToId = new Map<string, string>()
  for (const [i, edu] of profile.education.entries()) {
    eduTokenToId.set(`EDU_${i + 1}`, edu.id)
  }

  const langTokenToId = new Map<string, string>()
  for (const [i, lang] of profile.languages.entries()) {
    langTokenToId.set(`LANG_${i + 1}`, lang.id)
  }

  return { expTokenToId, projTokenToId, eduTokenToId, langTokenToId, expIdToToken, projIdToToken }
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface TokenResolutionIssue {
  section: 'experience' | 'projects'
  token: string
  message: string
}

export interface TokenResolutionResult {
  /** Application with tokens in experience/projects replaced by canonical UUIDs. */
  application: GeneratedApplication
  /** Non-empty when any token was invalid, unknown, mismatched, or duplicated. */
  issues: TokenResolutionIssue[]
}

/**
 * Resolves short source tokens in experience and projects to canonical profile UUIDs.
 *
 * Validates:
 * - EXP_N tokens must appear only in cv.experience (not cv.projects)
 * - PROJ_N tokens must appear only in cv.projects (not cv.experience)
 * - Tokens must exist in the map (unknown tokens are rejected)
 * - No duplicate tokens within the same section
 *
 * Education and languages are skipped — they are always replaced by
 * canonicalizeEducationAndLanguages() after this step.
 *
 * Returns the resolved application and any issues. Callers should throw
 * INVALID_SOURCE_IDS when issues.length > 0.
 */
export function resolveTokensToIds(
  application: GeneratedApplication,
  map: SourceTokenMap,
): TokenResolutionResult {
  const issues: TokenResolutionIssue[] = []

  // ── Resolve experience tokens ──────────────────────────────────────────────

  const seenExpIds = new Set<string>()
  const experience = application.cv.experience.map((entry) => {
    const token = entry.sourceId

    if (isProjToken(token)) {
      issues.push({
        section: 'experience',
        token,
        message: `Project token "${token}" used in cv.experience — category mismatch`,
      })
      return entry
    }

    if (!isExpToken(token)) {
      issues.push({
        section: 'experience',
        token,
        message: `Unknown or malformed experience token: "${token}"`,
      })
      return entry
    }

    const canonicalId = map.expTokenToId.get(token)
    if (!canonicalId) {
      issues.push({
        section: 'experience',
        token,
        message: `Experience token "${token}" has no matching profile entry`,
      })
      return entry
    }

    if (seenExpIds.has(canonicalId)) {
      issues.push({
        section: 'experience',
        token,
        message: `Duplicate experience token: "${token}"`,
      })
      return entry
    }
    seenExpIds.add(canonicalId)

    return { ...entry, sourceId: canonicalId }
  })

  // ── Resolve project tokens ─────────────────────────────────────────────────

  const seenProjIds = new Set<string>()
  const projects = application.cv.projects.map((proj) => {
    const token = proj.sourceId

    if (isExpToken(token)) {
      issues.push({
        section: 'projects',
        token,
        message: `Experience token "${token}" used in cv.projects — category mismatch`,
      })
      return proj
    }

    if (!isProjToken(token)) {
      issues.push({
        section: 'projects',
        token,
        message: `Unknown or malformed project token: "${token}"`,
      })
      return proj
    }

    const canonicalId = map.projTokenToId.get(token)
    if (!canonicalId) {
      issues.push({
        section: 'projects',
        token,
        message: `Project token "${token}" has no matching profile entry`,
      })
      return proj
    }

    if (seenProjIds.has(canonicalId)) {
      issues.push({
        section: 'projects',
        token,
        message: `Duplicate project token: "${token}"`,
      })
      return proj
    }
    seenProjIds.add(canonicalId)

    return { ...proj, sourceId: canonicalId }
  })

  return {
    application: {
      ...application,
      cv: { ...application.cv, experience, projects },
    },
    issues,
  }
}
