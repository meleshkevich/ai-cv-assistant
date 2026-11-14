export interface JobOverview {
  title: string
  company: string | null
  language: 'en' | 'cs'
  seniority: string | null
  summary: string
}

export interface JobRequirement {
  id: string
  requirement: string
  priority: 'required' | 'preferred'
  category: 'technical' | 'experience' | 'other'
}

export interface EvidenceItem {
  sourceType: 'experience' | 'project' | 'generalNotes'
  sourceId: string | null
  supportingExcerpt: string
}

export interface RequirementMatch {
  requirementId: string
  status: 'supported' | 'partial' | 'unsupported'
  explanation: string
  evidence: EvidenceItem[]
}

export interface RelevantExperience {
  sourceType: 'experience' | 'project'
  sourceId: string
  relevanceReason: string
}

export interface JobRecommendation {
  category: 'application_strategy' | 'profile_improvement'
  text: string
}

export interface JobAnalysis {
  job: JobOverview
  requirements: JobRequirement[]
  matches: RequirementMatch[]
  relevantExperience: RelevantExperience[]
  recommendations: JobRecommendation[]
}

export interface VerificationIssue {
  type:
    | 'invalid-requirement-ref'
    | 'invalid-source-id'
    | 'duplicate-requirement-id'
    | 'empty-excerpt'
    | 'unexpected-null-source-id'
  requirementId?: string
  sourceId?: string
  message: string
}

export interface ValidatedAnalysis {
  analysis: JobAnalysis
  issues: VerificationIssue[]
}

export type AnalysisErrorCode =
  | 'NO_API_KEY'
  | 'EMPTY_JOB'
  | 'EMPTY_PROFILE'
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
  | 'API_ERROR'
