import type { ApplicationDraft } from '@/types/application'
import { parseAndValidateApplication } from '@/utils/applicationValidator'

const KEY_PREFIX = 'appDraft:v1:'

// Tracking params that carry no job identity — safe to strip for stable URL keys.
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'msclkid',
]

/**
 * Returns a stable vacancy identifier from a URL by:
 * - Removing the fragment (#)
 * - Removing known tracking query parameters
 * - Sorting remaining query parameters
 * - Lowercasing scheme and hostname (paths are case-sensitive on many servers)
 */
export function normalizeVacancyId(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param)
    }
    parsed.searchParams.sort()
    // Reconstruct with lowercase scheme + hostname, original-case path and params.
    const origin = `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${parsed.port ? ':' + parsed.port : ''}`
    return `${origin}${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

function draftKey(vacancyId: string): string {
  return `${KEY_PREFIX}${vacancyId}`
}

function validateDraft(raw: unknown, expectedVacancyId: string): ApplicationDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  if (r.schemaVersion !== 1) return null
  if (typeof r.vacancyId !== 'string') return null
  if (r.vacancyId !== expectedVacancyId) return null
  if (typeof r.sourceUrl !== 'string') return null
  if (r.language !== 'en' && r.language !== 'cs') return null
  if (typeof r.savedAt !== 'number') return null

  try {
    parseAndValidateApplication(r.application)
  } catch {
    return null
  }

  return r as unknown as ApplicationDraft
}

/**
 * Persists an application draft to chrome.storage.local.
 * Serializes through JSON to convert Vue reactive proxies into plain objects
 * before passing to the Chrome API (which treats ES6 Proxy arrays as plain objects).
 */
export async function saveApplicationDraft(draft: ApplicationDraft): Promise<void> {
  const plain = JSON.parse(JSON.stringify(draft)) as ApplicationDraft
  const key = draftKey(plain.vacancyId)
  await chrome.storage.local.set({ [key]: plain })
}

/**
 * Loads and validates the draft for a given vacancyId.
 * Returns null if no draft exists, the draft is corrupted, or the vacancyId does not match.
 * Removes corrupted drafts from storage to avoid re-encountering them.
 */
export async function loadApplicationDraft(vacancyId: string): Promise<ApplicationDraft | null> {
  const key = draftKey(vacancyId)
  const result = await chrome.storage.local.get(key)
  const raw = result[key] as unknown
  if (!raw) return null

  const draft = validateDraft(raw, vacancyId)
  if (!draft) {
    if (import.meta.env.DEV) {
      console.error('[applicationDraftService] Corrupted or mismatched draft at key:', key)
    }
    // Remove silently — a corrupted draft should not block the user.
    chrome.storage.local.remove(key).catch(() => {})
    return null
  }

  return draft
}

/**
 * Removes the draft for a given vacancyId from storage.
 */
export async function deleteApplicationDraft(vacancyId: string): Promise<void> {
  const key = draftKey(vacancyId)
  await chrome.storage.local.remove(key)
}
