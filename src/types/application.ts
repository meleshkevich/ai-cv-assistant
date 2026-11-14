export interface GeneratedCoverLetter {
  language: 'en' | 'cs'
  subject: string
  body: string
}

export interface GeneratedCvExperience {
  sourceId: string
  company: string
  position: string
  startDate: string
  endDate: string | null
  highlights: string[]
}

export interface GeneratedCvProject {
  sourceId: string
  name: string
  role: string
  highlights: string[]
  url?: string
}

export interface GeneratedCvEducation {
  sourceId: string
  institution: string
  degree: string
  field: string
}

export interface GeneratedCvLanguage {
  sourceId: string
  language: string
  proficiency: string
}

export interface GeneratedCv {
  language: 'en' | 'cs'
  professionalTitle: string
  professionalSummary: string
  technicalSkills: string[]
  experience: GeneratedCvExperience[]
  projects: GeneratedCvProject[]
  education: GeneratedCvEducation[]
  languages: GeneratedCvLanguage[]
}

export interface GeneratedApplication {
  coverLetter: GeneratedCoverLetter
  cv: GeneratedCv
}

export interface ApplicationDraft {
  schemaVersion: 1
  vacancyId: string
  vacancyTitle: string | null
  vacancyCompany: string | null
  sourceUrl: string
  language: 'en' | 'cs'
  application: GeneratedApplication
  savedAt: number
}

export type ApplicationErrorCode =
  | 'NO_API_KEY'
  | 'EMPTY_JOB'
  | 'EMPTY_PROFILE'
  | 'NO_ANALYSIS'
  | 'INPUT_TOO_LARGE'
  | 'INVALID_API_KEY'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'MODEL_NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'REQUEST_ABORTED'
  | 'RESPONSE_INCOMPLETE'
  | 'RESPONSE_INVALID'
  | 'SCHEMA_VIOLATION'
  | 'INVALID_SOURCE_IDS'
  | 'API_ERROR'

export interface ApplicationError {
  code: ApplicationErrorCode
  message: string
}
