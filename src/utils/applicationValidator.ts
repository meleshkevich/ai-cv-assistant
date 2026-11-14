import type {
  GeneratedApplication,
  GeneratedCoverLetter,
  GeneratedCv,
  GeneratedCvExperience,
  GeneratedCvProject,
  GeneratedCvEducation,
  GeneratedCvLanguage,
} from '@/types/application'
import type { MasterProfile } from '@/types/profile'

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

function parseStringArray(v: unknown, path: string): string[] {
  if (!isArray(v)) throw new Error(`${path} must be an array`)
  for (const [i, item] of v.entries()) {
    if (!isString(item)) throw new Error(`${path}[${i}] must be a string`)
  }
  return v as string[]
}

function parseCoverLetter(raw: unknown): GeneratedCoverLetter {
  if (!isObj(raw)) throw new Error('coverLetter must be an object')
  if (raw.language !== 'en' && raw.language !== 'cs')
    throw new Error('coverLetter.language must be "en" or "cs"')
  if (!isString(raw.subject)) throw new Error('coverLetter.subject must be a string')
  if (!isString(raw.body)) throw new Error('coverLetter.body must be a string')
  return raw as unknown as GeneratedCoverLetter
}

function parseCvExperience(raw: unknown, i: number): GeneratedCvExperience {
  if (!isObj(raw)) throw new Error(`cv.experience[${i}] must be an object`)
  if (!isString(raw.sourceId)) throw new Error(`cv.experience[${i}].sourceId must be a string`)
  if (!isString(raw.company)) throw new Error(`cv.experience[${i}].company must be a string`)
  if (!isString(raw.position)) throw new Error(`cv.experience[${i}].position must be a string`)
  if (!isString(raw.startDate)) throw new Error(`cv.experience[${i}].startDate must be a string`)
  if (!isStringOrNull(raw.endDate)) throw new Error(`cv.experience[${i}].endDate must be string or null`)
  parseStringArray(raw.highlights, `cv.experience[${i}].highlights`)
  return raw as unknown as GeneratedCvExperience
}

function parseCvProject(raw: unknown, i: number): GeneratedCvProject {
  if (!isObj(raw)) throw new Error(`cv.projects[${i}] must be an object`)
  if (!isString(raw.sourceId)) throw new Error(`cv.projects[${i}].sourceId must be a string`)
  if (!isString(raw.name)) throw new Error(`cv.projects[${i}].name must be a string`)
  if (!isString(raw.role)) throw new Error(`cv.projects[${i}].role must be a string`)
  parseStringArray(raw.highlights, `cv.projects[${i}].highlights`)
  return raw as unknown as GeneratedCvProject
}

function parseCvEducation(raw: unknown, i: number): GeneratedCvEducation {
  if (!isObj(raw)) throw new Error(`cv.education[${i}] must be an object`)
  if (!isString(raw.sourceId)) throw new Error(`cv.education[${i}].sourceId must be a string`)
  if (!isString(raw.institution)) throw new Error(`cv.education[${i}].institution must be a string`)
  if (!isString(raw.degree)) throw new Error(`cv.education[${i}].degree must be a string`)
  if (!isString(raw.field)) throw new Error(`cv.education[${i}].field must be a string`)
  return raw as unknown as GeneratedCvEducation
}

function parseCvLanguage(raw: unknown, i: number): GeneratedCvLanguage {
  if (!isObj(raw)) throw new Error(`cv.languages[${i}] must be an object`)
  if (!isString(raw.sourceId)) throw new Error(`cv.languages[${i}].sourceId must be a string`)
  if (!isString(raw.language)) throw new Error(`cv.languages[${i}].language must be a string`)
  if (!isString(raw.proficiency)) throw new Error(`cv.languages[${i}].proficiency must be a string`)
  return raw as unknown as GeneratedCvLanguage
}

function parseCv(raw: unknown): GeneratedCv {
  if (!isObj(raw)) throw new Error('cv must be an object')
  if (raw.language !== 'en' && raw.language !== 'cs')
    throw new Error('cv.language must be "en" or "cs"')
  if (!isString(raw.professionalTitle)) throw new Error('cv.professionalTitle must be a string')
  if (!isString(raw.professionalSummary)) throw new Error('cv.professionalSummary must be a string')
  parseStringArray(raw.technicalSkills, 'cv.technicalSkills')

  if (!isArray(raw.experience)) throw new Error('cv.experience must be an array')
  const experience = raw.experience.map((e, i) => parseCvExperience(e, i))

  if (!isArray(raw.projects)) throw new Error('cv.projects must be an array')
  const projects = raw.projects.map((p, i) => parseCvProject(p, i))

  if (!isArray(raw.education)) throw new Error('cv.education must be an array')
  const education = raw.education.map((e, i) => parseCvEducation(e, i))

  if (!isArray(raw.languages)) throw new Error('cv.languages must be an array')
  const languages = raw.languages.map((l, i) => parseCvLanguage(l, i))

  return {
    language: raw.language,
    professionalTitle: raw.professionalTitle as string,
    professionalSummary: raw.professionalSummary as string,
    technicalSkills: raw.technicalSkills as string[],
    experience,
    projects,
    education,
    languages,
  }
}

/**
 * Validates that the raw parsed JSON from the OpenAI response conforms to
 * the GeneratedApplication shape. Returns the typed object or throws with a
 * descriptive message if the structure is wrong.
 */
export function parseAndValidateApplication(raw: unknown): GeneratedApplication {
  if (!isObj(raw)) throw new Error('Response is not an object')
  const coverLetter = parseCoverLetter(raw.coverLetter)
  const cv = parseCv(raw.cv)
  return { coverLetter, cv }
}

export interface ApplicationSourceIssue {
  type: 'invalid-experience-id' | 'invalid-project-id' | 'invalid-education-id' | 'invalid-language-id'
  sourceId: string
  message: string
}

/**
 * Verifies that all sourceIds in the generated application refer to actual
 * Master Profile entries. Returns a list of issues.
 */
export function verifyApplicationSources(
  application: GeneratedApplication,
  profile: MasterProfile,
): ApplicationSourceIssue[] {
  const issues: ApplicationSourceIssue[] = []

  const experienceIds = new Set(profile.experience.map((e) => e.id))
  const projectIds = new Set(profile.projects.map((p) => p.id))
  const educationIds = new Set(profile.education.map((e) => e.id))
  const languageIds = new Set(profile.languages.map((l) => l.id))

  for (const exp of application.cv.experience) {
    if (!experienceIds.has(exp.sourceId)) {
      issues.push({
        type: 'invalid-experience-id',
        sourceId: exp.sourceId,
        message: `CV experience references unknown sourceId: "${exp.sourceId}"`,
      })
    }
  }

  for (const proj of application.cv.projects) {
    if (!projectIds.has(proj.sourceId)) {
      issues.push({
        type: 'invalid-project-id',
        sourceId: proj.sourceId,
        message: `CV project references unknown sourceId: "${proj.sourceId}"`,
      })
    }
  }

  for (const edu of application.cv.education) {
    if (!educationIds.has(edu.sourceId)) {
      issues.push({
        type: 'invalid-education-id',
        sourceId: edu.sourceId,
        message: `CV education references unknown sourceId: "${edu.sourceId}"`,
      })
    }
  }

  for (const lang of application.cv.languages) {
    if (!languageIds.has(lang.sourceId)) {
      issues.push({
        type: 'invalid-language-id',
        sourceId: lang.sourceId,
        message: `CV language references unknown sourceId: "${lang.sourceId}"`,
      })
    }
  }

  return issues
}
