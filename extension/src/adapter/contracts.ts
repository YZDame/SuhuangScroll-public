export interface CaptureImageResult {
  success: boolean
  imageData?: string
  width?: number
  height?: number
  source?: string
  imageHash?: string | null
  error?: string
}

export type AgentBrowserAction =
  | 'capture_current_answer'
  | 'get_page_context'
  | 'observe_page_change'
  | 'write_score'
  | 'submit_score'
  | 'submit_batch_scores'
  | 'healthcheck'
  | 'grade_current_answer'

export interface PageContextResult {
  success: boolean
  pageUrl?: string
  pageTitle?: string
  site?: string
  paperIndex?: number | null
  questionId?: string | null
  error?: string
}

export interface PageTransitionResult {
  success: boolean
  previousHash?: string | null
  currentHash?: string | null
  pageContext?: PageContextResult
  message?: string
}

export interface SubmitScoreRequest {
  paperIndex: number
  score: number
  dryRun?: boolean
  studentId?: string
  reason?: string
  questionId?: string
  subject?: string
}

export interface SubmitBatchScoresRequest {
  paperIndex: number
  batchScores: Record<number, number>
  dryRun?: boolean
  reason?: string
}

export interface GradeCurrentAnswerRequest {
  examId: string
  studentId: string
  questionConfig: {
    id: string
    subject: string
    content?: string
    answer: string
    maxScore: number
    type: 'single' | 'fill_blank'
    criteria?: Array<{ step: string; score: number; desc: string }>
    blanks?: Array<{ id: string; maxScore: number; description?: string }>
    ignore_rules?: string[]
  }
  execution?: {
    submit_policy?: 'manual_confirm' | 'auto_submit'
    grading_mode?: 'vision_grade_direct' | 'legacy_ocr_then_text_score'
  }
}

export interface SubmitScoreResult {
  success: boolean
  paperIndex?: number
  score?: number
  timestamp?: number
  method?: string
  message: string
  response?: unknown
  details?: {
    httpStatus?: number
    responseText?: string
    error?: string
  }
}

export interface WriteScoreRequest {
  paperIndex: number
  score: number
  dryRun?: boolean
}

export interface WriteScoreResult {
  success: boolean
  paperIndex?: number
  score?: number
  timestamp?: number
  method?: string
  message: string
  error?: string
}

export interface BrowserPageAdapter {
  ping(tabId: number): Promise<boolean>
  captureCurrentImage(tabId: number, selector?: string): Promise<CaptureImageResult>
  observePageChange(tabId: number, timeoutMs?: number): Promise<PageTransitionResult>
}

export interface BrowserContextAdapter {
  getPageContext(tabId: number): Promise<PageContextResult>
}

export interface BrowserSubmitAdapter {
  writeScore(tabId: number, request: WriteScoreRequest): Promise<WriteScoreResult>
  submitScore(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult>
  submitBatchScores(tabId: number, request: SubmitBatchScoresRequest): Promise<SubmitScoreResult>
}
