export interface JobExtractionResult {
  sourceUrl: string
  pageTitle: string
  jobTitle: string | null
  company: string | null
  location: string | null
  description: string
  extractionMethod: 'site-specific' | 'json-ld' | 'dom' | 'manual'
  confidence: 'high' | 'medium' | 'low'
  truncationWarning?: string
}

export type JobScanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: JobExtractionResult }
  | { status: 'error'; error: { code: string; message: string } }
  | { status: 'manual' }
