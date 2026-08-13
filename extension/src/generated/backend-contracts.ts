/**
 * Backend HTTP contracts consumed by the extension.
 *
 * Source of truth: FastAPI response/request models in core/python.
 * Run `python scripts/release/check_api_contracts.py` after changing an API
 * model. The check fails if required backend fields drift from these types.
 */

export interface BackendHealth {
  status: 'ok'
  timestamp: string
  version: string
  protocol_version: number
}

export interface ResourceOption {
  value: string
  label: string
  hint?: string | null
}

export interface ResourcesResponse {
  providers: ResourceOption[]
  modelsByProvider: Record<string, ResourceOption[]>
  adapters: ResourceOption[]
  defaultProvider?: string | null
  defaultAdapter?: string | null
}

export interface SpecOption {
  value: string
  label: string
}

export interface SpecsResponse {
  specs: SpecOption[]
  dir: string
}

export interface AutomationRun {
  run_id: string
  state: string
  adapter: string
  exam_id: string
  student_id: string
  completed_count: number
  elapsed_seconds: number
  active_seconds: number
  warning_count: number
  question: {
    id: string
    subject: string
    content?: string
    answer: string
    type: 'single' | 'fill_blank'
    maxScore: number
    criteria?: { step: string; desc: string; score: number }[]
    blanks?: { id: string; maxScore: number; description?: string }[]
    ignore_rules?: string[]
  }
  execution: any
  current_page_context?: { paperIndex?: number | null } | null
  pending_decision?: {
    batch_scores?: Record<number, number>
    suggested_score?: number
    confidence?: number
  } | null
}

export interface AutomationStatusResponse {
  active: boolean
  run?: AutomationRun | null
}
