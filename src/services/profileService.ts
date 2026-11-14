import type { MasterProfile } from '@/types/profile'

const STORAGE_KEY = 'masterProfile'

const ARRAY_FIELDS = ['experience', 'projects', 'education', 'languages'] as const

/** Returned by loadProfile when storage contains data with invalid field types. */
export interface ProfileLoadResult {
  profile: MasterProfile
  /** true when at least one array field was found in an unexpected type (e.g. {}) */
  corrupted: boolean
  /** Names of array fields that had non-array, non-null values in storage */
  corruptedFields: string[]
}

export async function loadProfile(): Promise<ProfileLoadResult | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const raw = result[STORAGE_KEY] as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record.schemaVersion !== 1) {
    console.error('[profileService] Unrecognized schemaVersion:', record.schemaVersion)
    return null
  }

  const corruptedFields: string[] = []
  for (const field of ARRAY_FIELDS) {
    if (record[field] === undefined || record[field] === null) {
      // Missing or null field — safe default (field added after original save, or never set).
      record[field] = []
    } else if (!Array.isArray(record[field])) {
      // Non-array, non-null value — genuine storage corruption, not a missing field.
      // Normalize to [] for in-memory use but preserve the caller's ability to warn.
      if (import.meta.env.DEV) {
        console.error(
          `[profileService] Corrupted field "${field}": expected array, got`,
          typeof record[field],
          '— normalized to [] in memory',
        )
      }
      corruptedFields.push(field)
      record[field] = []
    }
  }
  if (typeof record.generalNotes !== 'string') record.generalNotes = ''

  return {
    profile: record as unknown as MasterProfile,
    corrupted: corruptedFields.length > 0,
    corruptedFields,
  }
}

/** Verify that all array fields in the serialized snapshot are real Arrays. */
function validateSnapshot(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return ['profile is not a plain object']
  }
  const record = profile as Record<string, unknown>
  return ARRAY_FIELDS.filter((f) => !Array.isArray(record[f])).map(
    (f) => `"${f}" is not an array (got ${typeof record[f]})`,
  )
}

export async function saveProfile(profile: MasterProfile): Promise<void> {
  // Serialize through JSON before passing to chrome.storage.local.set().
  //
  // Root cause: Vue reactive arrays are ES6 Proxy objects. Chrome's C++ V8 value
  // converter calls val->IsArray(), which returns false for Proxies (it checks the
  // C++ heap type, not ECMAScript [[IsArray]]). The converter then treats reactive
  // arrays as plain objects and calls GetOwnPropertyNames(), which excludes integer
  // indices — producing {} instead of [{...}] in storage.
  //
  // JSON.stringify uses ECMAScript IsArray (which recursively checks Proxy targets
  // and returns true for a Proxy over an Array), so the round-trip produces a plain
  // JS object that Chrome's converter handles correctly.
  const plain = JSON.parse(JSON.stringify(profile)) as MasterProfile

  if (import.meta.env.DEV) {
    const errors = validateSnapshot(plain)
    if (errors.length > 0) {
      console.error('[profileService] saveProfile — snapshot validation failed:', errors)
    } else {
      console.log('[profileService] saveProfile — snapshot ok', {
        experienceCount: (plain.experience as unknown[]).length,
        projectCount: (plain.projects as unknown[]).length,
      })
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: plain })
}
