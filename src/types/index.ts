export interface PageData {
  title: string
  url: string
  text: string
}

export interface ExtractionResult extends PageData {
  characterCount: number
  extractedAt: number
}

export type ExtractionErrorCode =
  | 'RESTRICTED_PAGE'
  | 'TAB_NOT_FOUND'
  | 'EXTRACTION_FAILED'
  | 'PERMISSION_DENIED'

export interface ExtractionError {
  code: ExtractionErrorCode
  message: string
}

export type ScanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ExtractionResult }
  | { status: 'error'; error: ExtractionError }
