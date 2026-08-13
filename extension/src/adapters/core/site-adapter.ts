import type {
  CaptureImageResult,
  PageContextResult,
  PageTransitionResult,
  SubmitBatchScoresRequest,
  SubmitScoreRequest,
  SubmitScoreResult,
  WriteScoreRequest,
  WriteScoreResult,
} from '../../adapter/contracts'
import type { DescriptorProbe } from './descriptor'

export interface SiteAdapterCapabilities {
  singleScore: boolean
  batchScores: boolean
  domSubmit: boolean
  networkSubmit: boolean
  observeNext: boolean
  healthcheck: boolean
}

export interface SiteAdapterHealthcheckResult {
  success: boolean
  adapterId: string
  matched?: boolean
  checks?: Record<string, boolean>
  probes?: DescriptorProbe[]
  validationPassed?: boolean
  requiredChecks?: string[]
  failures?: string[]
  message?: string
  error?: string
}

export interface SiteGradingAdapter {
  id: string
  displayName: string
  capabilities: SiteAdapterCapabilities
  match(url: URL): boolean
  getPageContext(tabId: number): Promise<PageContextResult>
  captureCurrentAnswer(tabId: number, selector?: string): Promise<CaptureImageResult>
  writeScore(tabId: number, request: WriteScoreRequest): Promise<WriteScoreResult>
  submitScore(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult>
  submitBatchScores(tabId: number, request: SubmitBatchScoresRequest): Promise<SubmitScoreResult>
  observePageChange(tabId: number, timeoutMs?: number): Promise<PageTransitionResult>
  healthcheck(tabId: number): Promise<SiteAdapterHealthcheckResult>
}

export type SiteAdapterErrorCode =
  | 'adapter_not_found'
  | 'adapter_id_not_found'
  | 'invalid_url'
  | 'duplicate_adapter'

export interface SiteAdapterResolutionError {
  code: SiteAdapterErrorCode
  message: string
  adapterId?: string
  url?: string
}

export type SiteAdapterResolution =
  | {
      success: true
      adapter: SiteGradingAdapter
    }
  | {
      success: false
      error: SiteAdapterResolutionError
    }

export function unsupportedSubmitResult(
  adapter: SiteGradingAdapter,
  operation: string
): SubmitScoreResult {
  return {
    success: false,
    method: 'unsupported',
    message: `${adapter.displayName} does not support ${operation}`,
    details: {
      error: 'unsupported_capability',
    },
  }
}

export function unsupportedWriteResult(
  adapter: SiteGradingAdapter,
  operation: string
): WriteScoreResult {
  return {
    success: false,
    method: 'unsupported',
    message: `${adapter.displayName} does not support ${operation}`,
    error: 'unsupported_capability',
  }
}
