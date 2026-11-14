export interface MasterProfile {
  schemaVersion: 1
  personal: PersonalInfo
  experience: ExperienceEntry[]
  projects: ProjectEntry[]
  education: EducationEntry[]
  languages: LanguageEntry[]
  generalNotes: string
}

export interface PersonalInfo {
  fullName: string
  title: string
  location: string
  email: string
  phone: string
  linkedIn: string
  github: string
}

export interface ExperienceEntry {
  id: string
  company: string
  position: string
  location: string
  startDate: string
  endDate: string | null
  description: string
}

export interface ProjectEntry {
  id: string
  name: string
  role: string
  url: string
  startDate: string
  endDate: string | null
  description: string
}

export interface EducationEntry {
  id: string
  institution: string
  degree: string
  field: string
  startDate: string
  endDate: string | null
  description: string
}

export interface LanguageEntry {
  id: string
  language: string
  proficiency: string
}

export function createEmptyProfile(): MasterProfile {
  return {
    schemaVersion: 1,
    personal: {
      fullName: '',
      title: '',
      location: '',
      email: '',
      phone: '',
      linkedIn: '',
      github: '',
    },
    experience: [],
    projects: [],
    education: [],
    languages: [],
    generalNotes: '',
  }
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function isProfileEmpty(profile: MasterProfile): boolean {
  const p = profile.personal
  const hasPersonal =
    p.fullName || p.title || p.location || p.email || p.phone || p.linkedIn || p.github
  return (
    !hasPersonal &&
    profile.experience.length === 0 &&
    profile.projects.length === 0 &&
    profile.education.length === 0 &&
    profile.languages.length === 0 &&
    !profile.generalNotes
  )
}
