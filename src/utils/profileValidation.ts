import type {
  MasterProfile,
  PersonalInfo,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  LanguageEntry,
} from '@/types/profile'

export type ValidationResult =
  | { valid: true; profile: MasterProfile }
  | { valid: false; errors: string[] }

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function checkString(val: unknown, path: string, errors: string[]): boolean {
  if (typeof val !== 'string') {
    errors.push(`${path}: must be a string (got ${typeof val})`)
    return false
  }
  return true
}

function checkStringOrNull(val: unknown, path: string, errors: string[]): boolean {
  if (val !== null && typeof val !== 'string') {
    errors.push(`${path}: must be a string or null`)
    return false
  }
  return true
}

function validatePersonalInfo(raw: unknown, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push('personal: must be an object')
    return
  }
  const fields: (keyof PersonalInfo)[] = [
    'fullName',
    'title',
    'location',
    'email',
    'phone',
    'linkedIn',
    'github',
  ]
  for (const f of fields) {
    checkString(raw[f], `personal.${f}`, errors)
  }
}

function validateExperienceEntry(raw: unknown, idx: number, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push(`experience[${idx}]: must be an object`)
    return
  }
  const stringFields: (keyof ExperienceEntry)[] = [
    'id',
    'company',
    'position',
    'location',
    'startDate',
    'description',
  ]
  for (const f of stringFields) {
    checkString(raw[f], `experience[${idx}].${f}`, errors)
  }
  checkStringOrNull(raw.endDate, `experience[${idx}].endDate`, errors)
}

function validateProjectEntry(raw: unknown, idx: number, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push(`projects[${idx}]: must be an object`)
    return
  }
  const stringFields: (keyof ProjectEntry)[] = [
    'id',
    'name',
    'role',
    'url',
    'startDate',
    'description',
  ]
  for (const f of stringFields) {
    checkString(raw[f], `projects[${idx}].${f}`, errors)
  }
  checkStringOrNull(raw.endDate, `projects[${idx}].endDate`, errors)
}

function validateEducationEntry(raw: unknown, idx: number, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push(`education[${idx}]: must be an object`)
    return
  }
  const stringFields: (keyof EducationEntry)[] = [
    'id',
    'institution',
    'degree',
    'field',
    'startDate',
    'description',
  ]
  for (const f of stringFields) {
    checkString(raw[f], `education[${idx}].${f}`, errors)
  }
  checkStringOrNull(raw.endDate, `education[${idx}].endDate`, errors)
}

function validateLanguageEntry(raw: unknown, idx: number, errors: string[]): void {
  if (!isObject(raw)) {
    errors.push(`languages[${idx}]: must be an object`)
    return
  }
  const stringFields: (keyof LanguageEntry)[] = ['id', 'language', 'proficiency']
  for (const f of stringFields) {
    checkString(raw[f], `languages[${idx}].${f}`, errors)
  }
}

export function validateProfileJson(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (!isObject(raw)) {
    return { valid: false, errors: ['Profile must be a JSON object'] }
  }

  if (raw.schemaVersion !== 1) {
    return {
      valid: false,
      errors: [
        `Unsupported schema version: ${JSON.stringify(raw.schemaVersion)}. Expected 1.`,
      ],
    }
  }

  validatePersonalInfo(raw.personal, errors)

  if (!Array.isArray(raw.experience)) {
    errors.push('experience: must be an array')
  } else {
    raw.experience.forEach((e, i) => validateExperienceEntry(e, i, errors))
  }

  if (!Array.isArray(raw.projects)) {
    errors.push('projects: must be an array')
  } else {
    raw.projects.forEach((e, i) => validateProjectEntry(e, i, errors))
  }

  if (!Array.isArray(raw.education)) {
    errors.push('education: must be an array')
  } else {
    raw.education.forEach((e, i) => validateEducationEntry(e, i, errors))
  }

  if (!Array.isArray(raw.languages)) {
    errors.push('languages: must be an array')
  } else {
    raw.languages.forEach((e, i) => validateLanguageEntry(e, i, errors))
  }

  checkString(raw.generalNotes, 'generalNotes', errors)

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, profile: raw as unknown as MasterProfile }
}
