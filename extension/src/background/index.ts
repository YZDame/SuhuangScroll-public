/**
 * Background Service Worker
 * 负责消息路由、API代理、状态管理
 */

import { RuntimeBrowserAdapter } from '../adapter/runtime-browser-adapter'
import {
  type AgentBrowserAction,
  type CaptureImageResult,
  type GradeCurrentAnswerRequest,
  type PageContextResult,
  type SubmitBatchScoresRequest,
  type SubmitScoreRequest,
  type WriteScoreRequest,
} from '../adapter/contracts'
import { getRegisteredAdapters, resolveAdapterById, resolveAdapterByUrl, type SiteGradingAdapter } from '../adapters/core'
import { registerBuiltInAdapters } from '../adapters'
import { CONTENT_MESSAGE_TYPES } from '../content/messages'
import type { AutomationStatusResponse, BackendHealth } from '../generated/backend-contracts'
import { DATA_CONSENT_STORAGE_KEY, readDataConsent } from '../privacy-consent'

// API 配置
const API_BASE = 'http://127.0.0.1:8000'
// 扩展期望的后端协议契约版本，须与后端 /api/health 的 protocol_version 一致。
// 不一致通常意味着扩展与主程序不是同一 release，应升级到同一版本。
// 递增规则见 docs/protocol-version.md。
const EXPECTED_PROTOCOL_VERSION = 1
const runtimeAdapter = new RuntimeBrowserAdapter()
registerBuiltInAdapters()

let dataConsentAccepted = false
let dataConsentLoaded = false

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[DATA_CONSENT_STORAGE_KEY]) return
  dataConsentAccepted = changes[DATA_CONSENT_STORAGE_KEY].newValue === true
  dataConsentLoaded = true
  if (!dataConsentAccepted) {
    void stopAutomationAfterConsentRevoked()
  }
})

async function hasDataConsent(): Promise<boolean> {
  if (!dataConsentLoaded) {
    dataConsentAccepted = await readDataConsent()
    dataConsentLoaded = true
  }
  return dataConsentAccepted
}

async function stopAutomationAfterConsentRevoked(): Promise<void> {
  try {
    const statusResponse = await fetch(`${API_BASE}/api/automation/status`)
    if (!statusResponse.ok) return
    const status = await statusResponse.json() as { active?: boolean; run?: { state?: string } | null }
    if (!status.active || !status.run) return
    await fetch(`${API_BASE}/api/automation/stop`, { method: 'POST' })
  } catch {
    // Consent revocation still blocks all new browser actions even if the
    // local API is temporarily unavailable. A later explicit start remains
    // gated by the consent check.
  }
}

export type BackendCheckResult =
  | { ok: true; version: string; protocolVersion: number }
  | {
      ok: false
      reason: 'unreachable' | 'protocol_mismatch'
      message: string
      version?: string
      protocolVersion?: number
    }

/**
 * 校验本地后端是否可达且协议契约版本兼容。
 * 不兼容时返回清晰的中文提示而非静默失败，供启动日志与 Side Panel 展示。
 */
async function checkBackendProtocol(): Promise<BackendCheckResult> {
  let health: BackendHealth
  try {
    const response = await fetch(`${API_BASE}/api/health`)
    if (!response.ok) {
      return { ok: false, reason: 'unreachable', message: `后端 /api/health 返回 HTTP ${response.status}` }
    }
    health = (await response.json()) as BackendHealth
  } catch (error) {
    return { ok: false, reason: 'unreachable', message: `无法连接本地后端（${API_BASE}）：${String(error)}` }
  }

  const protocolVersion = typeof health.protocol_version === 'number' ? health.protocol_version : undefined
  const version = typeof health.version === 'string' ? health.version : undefined

  if (protocolVersion === undefined) {
    return {
      ok: false,
      reason: 'protocol_mismatch',
      message: '后端未上报 protocol_version，可能是较旧版本。请将主程序与扩展升级到同一 release。',
      version,
    }
  }

  if (protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: 'protocol_mismatch',
      message:
        `扩展协议版本 ${EXPECTED_PROTOCOL_VERSION} 与后端协议版本 ${protocolVersion} 不一致` +
        `（后端主程序版本 ${version ?? '未知'}）。请将主程序与扩展升级到同一 release。`,
      version,
      protocolVersion,
    }
  }

  return { ok: true, version: version ?? 'unknown', protocolVersion }
}

// service worker 启动时主动校验一次，便于尽早在控制台暴露版本错配。
// 后端尚未启动时会得到 unreachable，仅记录日志、不影响后续按需重试。
void checkBackendProtocol().then((result) => {
  if (result.ok) {
    console.log(`[agentic-grading] 后端已连接：版本 ${result.version}，协议 v${result.protocolVersion}`)
  } else {
    console.warn('[agentic-grading] 后端协议检查:', result.message)
  }
})

// 类型定义
interface GradeRequestPayload {
  exam_id: string
  student_id: string
  answers: {
    question_id: string
    image_data: string
    meta: {
      subject: string
      type: string
      max_score: number
      criteria?: string
    }
  }[]
  question_config?: GradeCurrentAnswerRequest['questionConfig']
  execution?: GradeCurrentAnswerRequest['execution']
}

interface AgentBrowserActionMessage {
  type: 'AGENT_BROWSER_ACTION'
  action: AgentBrowserAction
  tabId?: number
  adapterId?: string
  selector?: string
  input?: SubmitScoreRequest | WriteScoreRequest | SubmitBatchScoresRequest | GradeCurrentAnswerRequest
}

type AutomationStatusPayload = AutomationStatusResponse

const automationBusyTabs = new Set<number>()
const NEXT_PAGE_RETRY_DELAY_MS = 250
const NEXT_PAGE_MAX_ATTEMPTS = 24
const CAPTURE_RETRY_DELAY_MS = 800
const CAPTURE_MAX_ATTEMPTS = 8

interface AutomationTiming {
  capture_ms?: number
  capture_attempts?: number
  capture_retry_reasons?: string[]
  grade_api_ms?: number
  decision_report_ms?: number
  validation_ms?: number
  pre_submit_capture_ms?: number
  pre_submit_capture_attempts?: number
  pre_submit_capture_retry_reasons?: string[]
  submit_ms?: number
  submit_report_ms?: number
  next_page_wait_ms?: number
  next_page_attempts?: number
  total_browser_cycle_ms?: number
}

// 监听插件安装
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[agentic-grading] Extension installed:', details.reason)
  
  // 设置 Side Panel 行为
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})

// 监听来自 Side Panel 和 Content Script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Never log the full message or sender here. Before consent is granted,
  // either value could contain page data, credentials, or a tab URL.
  const messageType = message && typeof message.type === 'string' ? message.type : 'unknown'
  console.log('[agentic-grading] Message received:', messageType)

  switch (message.type) {
    case 'PING':
      // 测试连接
      sendResponse({ type: 'PONG', timestamp: Date.now() })
      break

    case 'CHECK_BACKEND':
      // 校验后端可达性与协议契约版本，结果回传给 Side Panel
      checkBackendProtocol().then((result) => {
        if (!result.ok) {
          console.warn('[agentic-grading] 后端协议检查失败:', result.message)
        }
        sendResponse(result)
      })
      return true // 异步响应

    case 'GET_IMAGE':
      // 从 Content Script 获取图片
      handleGetImage(message, sender, sendResponse)
      return true // 异步响应

    case 'GRADE_REQUEST':
      // 评分请求 - 转发到后端API
      handleGradeRequest(message, sendResponse)
      return true // 异步响应

    case 'AGENT_BROWSER_ACTION':
      handleAgentBrowserAction(message, sender, sendResponse)
      return true

    case 'GET_ADAPTER_DEBUG_STATE':
      handleGetAdapterDebugState(message, sender, sendResponse)
      return true

    case CONTENT_MESSAGE_TYPES.automationHeartbeat:
      handleAutomationHeartbeat(sender)
      sendResponse({ success: true })
      return false

    default:
      console.warn('[agentic-grading] Unknown message type:', message.type)
      sendResponse({ error: 'Unknown message type' })
  }

  return false
})

// 处理获取图片请求
async function handleGetImage(
  message: { tabId?: number },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  try {
    if (!(await hasDataConsent())) {
      sendResponse({ success: false, error: 'Data consent is required before reading a page image' })
      return
    }
    const tabId = message.tabId || sender.tab?.id
    if (!tabId) {
      sendResponse({ error: 'No tab ID' })
      return
    }

    // 向 Content Script 请求图片
    const response = await chrome.tabs.sendMessage(tabId, { type: CONTENT_MESSAGE_TYPES.getPageImage })
    sendResponse(response)
  } catch (error) {
    console.error('[agentic-grading] Get image error:', error)
    sendResponse({ error: String(error) })
  }
}

async function handleAgentBrowserAction(
  message: AgentBrowserActionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  try {
    if (requiresDataConsent(message.action) && !(await hasDataConsent())) {
      sendResponse({ success: false, error: 'Data consent is required before accessing grading-page data' })
      return
    }
    const tabId = message.tabId || sender.tab?.id
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' })
      return
    }

    const adapterResolution = await resolveAdapterForTab(tabId, message.adapterId)
    if (!adapterResolution.success) {
      sendResponse(adapterResolution.response)
      return
    }
    const adapter = adapterResolution.adapter
    if (requiresActivatedCore(message.action, message.input)) {
      const access = await checkActivatedCore()
      if (!access.success) {
        sendResponse(access)
        return
      }
    }

    switch (message.action) {
      case 'capture_current_answer':
        sendResponse(await adapter.captureCurrentAnswer(tabId, message.selector))
        return

      case 'get_page_context':
        sendResponse(await adapter.getPageContext(tabId))
        return

      case 'write_score':
        if (
          !message.input ||
          !('score' in message.input) ||
          typeof message.input.score !== 'number' ||
          typeof message.input.paperIndex !== 'number'
        ) {
          sendResponse({ success: false, error: 'write_score requires numeric score and paperIndex' })
          return
        }
        sendResponse(await adapter.writeScore(tabId, message.input))
        return

      case 'submit_score':
        if (
          !message.input ||
          !('score' in message.input) ||
          typeof message.input.score !== 'number' ||
          typeof message.input.paperIndex !== 'number'
        ) {
          sendResponse({ success: false, error: 'submit_score requires numeric score and paperIndex' })
          return
        }
        sendResponse(await adapter.submitScore(tabId, message.input))
        return

      case 'submit_batch_scores':
        if (
          !message.input ||
          !('paperIndex' in message.input) ||
          typeof message.input.paperIndex !== 'number' ||
          !('batchScores' in message.input) ||
          typeof message.input.batchScores !== 'object'
        ) {
          sendResponse({ success: false, error: 'submit_batch_scores requires paperIndex and batchScores' })
          return
        }
        sendResponse(await adapter.submitBatchScores(tabId, message.input))
        return

      case 'grade_current_answer':
        if (
          !message.input ||
          !('questionConfig' in message.input) ||
          typeof message.input.examId !== 'string' ||
          typeof message.input.studentId !== 'string'
        ) {
          sendResponse({ success: false, error: 'grade_current_answer requires examId, studentId, questionConfig' })
          return
        }
        sendResponse(await handleGradeCurrentAnswer(tabId, adapter, message.input))
        return

      case 'observe_page_change':
        sendResponse(await adapter.observePageChange(tabId, 10000))
        return

      case 'healthcheck':
        sendResponse(await adapter.healthcheck(tabId))
        return

      default:
        sendResponse({ success: false, error: `Unsupported action: ${message.action}` })
    }
  } catch (error) {
    sendResponse({ success: false, error: String(error) })
  }
}

function requiresActivatedCore(
  action: AgentBrowserAction,
  input?: AgentBrowserActionMessage['input']
): boolean {
  if (isDryRunInput(input)) return false
  return [
    'write_score',
    'submit_score',
    'submit_batch_scores',
    'grade_current_answer',
  ].includes(action)
}

function isDryRunInput(input?: AgentBrowserActionMessage['input']): boolean {
  return Boolean(
    input &&
    typeof input === 'object' &&
    'dryRun' in input &&
    (input as { dryRun?: unknown }).dryRun === true
  )
}

function requiresDataConsent(action: AgentBrowserAction): boolean {
  return [
    'capture_current_answer',
    'get_page_context',
    'observe_page_change',
    'write_score',
    'submit_score',
    'submit_batch_scores',
    'grade_current_answer',
    'healthcheck',
  ].includes(action)
}

async function checkActivatedCore(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const backend = await checkBackendProtocol()
    if (!backend.ok) {
      return { success: false, error: backend.message }
    }
    const response = await fetch(`${API_BASE}/api/license/status`)
    if (!response.ok) {
      return { success: false, error: 'Local license status is unavailable' }
    }
    const status = await response.json()
    if (status?.ok === true) {
      return { success: true }
    }
    return { success: false, error: status?.reason || 'Preview license is not active' }
  } catch (error) {
    return { success: false, error: `Local core unavailable: ${String(error)}` }
  }
}

async function handleGetAdapterDebugState(
  message: { tabId?: number; adapterId?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  try {
    if (!(await hasDataConsent())) {
      sendResponse({ success: false, error: 'Data consent is required before inspecting a grading page' })
      return
    }
    const tabId = message.tabId || sender.tab?.id
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' })
      return
    }

    const tab = await chrome.tabs.get(tabId)
    const tabUrl = tab.url || ''
    const matchedResolution = tabUrl ? resolveAdapterByUrl(tabUrl) : null
    const selectedResolution = message.adapterId ? resolveAdapterById(message.adapterId) : matchedResolution
    const status = await fetchAutomationStatusSafe()
    const runAdapterId = status?.run?.adapter || null

    sendResponse({
      success: true,
      tabUrl,
      matchedAdapterId: matchedResolution?.success ? matchedResolution.adapter.id : null,
      selectedAdapterId: selectedResolution?.success ? selectedResolution.adapter.id : null,
      selectedMatched: Boolean(
        selectedResolution?.success &&
        tabUrl &&
        selectedResolution.adapter.match(new URL(tabUrl))
      ),
      runAdapterId,
      adapters: getRegisteredAdapters().map(adapter => ({
        id: adapter.id,
        displayName: adapter.displayName,
        capabilities: adapter.capabilities,
      })),
    })
  } catch (error) {
    sendResponse({ success: false, error: String(error) })
  }
}

async function fetchAutomationStatusSafe(): Promise<AutomationStatusPayload | null> {
  try {
    const response = await fetch(`${API_BASE}/api/automation/status`)
    if (!response.ok) {
      return null
    }
    return await response.json() as AutomationStatusPayload
  } catch {
    return null
  }
}

function buildBatchScoresFromGradePayload(payload: unknown): Record<number, number> {
  const result: Record<number, number> = {}
  const items = (payload as { results?: Array<{ blank_scores?: Array<{ score?: number }> }> })?.results?.[0]?.blank_scores || []
  for (const [index, item] of items.entries()) {
    result[index] = Number(item.score || 0)
  }
  return result
}

function buildSuggestedScoreFromGradePayload(payload: unknown): number {
  const value = (payload as { results?: Array<{ suggested_score?: number }> })?.results?.[0]?.suggested_score
  return Number(value || 0)
}

async function handleGradeCurrentAnswer(
  tabId: number,
  adapter: SiteGradingAdapter,
  request: GradeCurrentAnswerRequest
) {
  const capture = await adapter.captureCurrentAnswer(tabId)
  if (!capture.success || !capture.imageData) {
    return { success: false, step: 'capture', error: capture.error || 'capture failed' }
  }

  const payload: GradeRequestPayload = {
    exam_id: request.examId,
    student_id: request.studentId,
    question_config: request.questionConfig,
    execution: request.execution,
    answers: [
      {
        question_id: request.questionConfig.id,
        image_data: capture.imageData,
        meta: {
          subject: request.questionConfig.subject,
          type: request.questionConfig.type,
          max_score: request.questionConfig.maxScore,
          criteria: request.questionConfig.criteria?.map(item => `${item.step}: ${item.desc}`).join('\n'),
        },
      },
    ],
  }

  const gradeResponse = await fetch(`${API_BASE}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!gradeResponse.ok) {
    return { success: false, step: 'grade', error: `API error: ${gradeResponse.status}` }
  }

  const gradePayload = await gradeResponse.json()
  const batchScores = buildBatchScoresFromGradePayload(gradePayload)
  const suggestedScore = buildSuggestedScoreFromGradePayload(gradePayload)
  const submitPolicy = request.execution?.submit_policy || 'manual_confirm'

  if (submitPolicy !== 'auto_submit') {
    return {
      success: true,
      step: 'graded',
      capture: {
        width: capture.width,
        height: capture.height,
        source: capture.source,
      },
      batchScores,
      gradePayload,
    }
  }

  const validation = await validateAdapterForAutoSubmit(tabId, adapter, request.questionConfig.type)
  if (!validation.success) {
    return {
      success: false,
      step: 'validation_failed',
      error: validation.error,
      healthcheck: validation.healthcheck,
      batchScores,
      gradePayload,
    }
  }

  const pageContext = await adapter.getPageContext(tabId)
  const paperIndex = pageContext.paperIndex ?? 0
  const submitResult = request.questionConfig.type === 'fill_blank'
    ? await adapter.submitBatchScores(tabId, {
        paperIndex,
        batchScores,
        reason: 'auto submit from grade_current_answer',
      })
    : await adapter.submitScore(tabId, {
        paperIndex,
        score: suggestedScore,
        reason: 'auto submit from grade_current_answer',
        questionId: request.questionConfig.id,
        subject: request.questionConfig.subject,
      })

  return {
    success: submitResult.success,
    step: submitResult.success ? 'submitted' : 'submit_failed',
    batchScores,
    gradePayload,
    submitResult,
  }
}

async function handleAutomationHeartbeat(sender: chrome.runtime.MessageSender) {
  if (!(await hasDataConsent())) {
    return
  }
  const tabId = sender.tab?.id
  const tabUrl = sender.tab?.url || ''
  if (!tabId || automationBusyTabs.has(tabId)) {
    return
  }

  automationBusyTabs.add(tabId)
  try {
    const statusResponse = await fetch(`${API_BASE}/api/automation/status`)
    if (!statusResponse.ok) {
      return
    }

    const status = await statusResponse.json() as AutomationStatusPayload
    const run = status.run
    if (!status.active || !run) {
      return
    }

    const adapterResolution = await resolveAdapterForTab(tabId, run.adapter, tabUrl)
    if (!adapterResolution.success) {
      console.warn('[agentic-grading] automation heartbeat skipped:', adapterResolution.response)
      return
    }
    const adapter = adapterResolution.adapter

    if (run.state === 'starting' || run.state === 'capturing') {
      await runAutomationCaptureGradeCycle(tabId, adapter, run)
      return
    }

    if (run.state === 'submitting') {
      await executePendingSubmission(tabId, adapter, run)
    }
  } catch (error) {
    console.error('[agentic-grading] automation heartbeat error', error)
  } finally {
    automationBusyTabs.delete(tabId)
  }
}

async function runAutomationCaptureGradeCycle(
  tabId: number,
  adapter: SiteGradingAdapter,
  run: NonNullable<AutomationStatusPayload['run']>
) {
  const cycleStartedAt = Date.now()
  const timing: AutomationTiming = {}
  const pageContext = await adapter.getPageContext(tabId)
  const captureStartedAt = Date.now()
  const captureAttempt = await captureCurrentAnswerWithRetry(adapter, tabId)
  const capture = captureAttempt.result
  timing.capture_ms = Date.now() - captureStartedAt
  timing.capture_attempts = captureAttempt.attempts
  timing.capture_retry_reasons = captureAttempt.retryReasons
  if (!capture.success || !capture.imageData) {
    await fetch(`${API_BASE}/api/automation/report/capture-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: capture.error || 'capture failed',
        page_context: pageContext,
      }),
    })
    return
  }

  const payload: GradeRequestPayload = {
    exam_id: run.exam_id,
    student_id: run.student_id,
    question_config: run.question,
    execution: run.execution,
    answers: [
      {
        question_id: run.question.id,
        image_data: capture.imageData,
        meta: {
          subject: run.question.subject,
          type: run.question.type,
          max_score: run.question.maxScore,
          criteria: run.question.criteria?.map(item => `${item.step}: ${item.desc}`).join('\n'),
        },
      },
    ],
  }

  const gradeStartedAt = Date.now()
  const gradeResponse = await fetch(`${API_BASE}/api/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  timing.grade_api_ms = Date.now() - gradeStartedAt
  if (!gradeResponse.ok) {
    await fetch(`${API_BASE}/api/automation/report/capture-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `grade failed with status ${gradeResponse.status}`,
        page_context: pageContext,
      }),
    })
    return
  }

  const gradePayload = await gradeResponse.json()
  const batchScores = buildBatchScoresFromGradePayload(gradePayload)
  const suggestedScore = buildSuggestedScoreFromGradePayload(gradePayload)
  const decisionStartedAt = Date.now()
  const decisionResponse = await fetch(`${API_BASE}/api/automation/report/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page_context: pageContext,
      grade_payload: gradePayload,
      batch_scores: batchScores,
      timing,
    }),
  })
  timing.decision_report_ms = Date.now() - decisionStartedAt

  if (!decisionResponse.ok) {
    return
  }

  const decisionPayload = await decisionResponse.json() as {
    decision?: string
    run?: NonNullable<AutomationStatusPayload['run']>
  }
  if (decisionPayload.decision === 'submit') {
    await executePendingSubmission(
      tabId,
      adapter,
      decisionPayload.run || run,
      batchScores,
      pageContext.paperIndex ?? 0,
      suggestedScore,
      timing,
      cycleStartedAt
    )
  }
}

async function executePendingSubmission(
  tabId: number,
  adapter: SiteGradingAdapter,
  run: NonNullable<AutomationStatusPayload['run']>,
  explicitBatchScores?: Record<number, number>,
  explicitPaperIndex = 0,
  explicitSuggestedScore?: number,
  timing: AutomationTiming = {},
  cycleStartedAt = Date.now()
) {
  const validationStartedAt = Date.now()
  const validation = await validateAdapterForAutoSubmit(tabId, adapter, run.question.type)
  timing.validation_ms = Date.now() - validationStartedAt
  if (!validation.success) {
    await fetch(`${API_BASE}/api/automation/report/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timing,
        submit_result: {
          success: false,
          method: 'validation',
          message: validation.error,
          details: {
            error: 'adapter_validation_failed',
            healthcheck: validation.healthcheck,
          },
        },
      }),
    })
    return
  }

  const batchScores = explicitBatchScores || run.pending_decision?.batch_scores
  const pageContext = await adapter.getPageContext(tabId)
  const preSubmitCaptureStartedAt = Date.now()
  const preSubmitCaptureAttempt = await captureCurrentAnswerWithRetry(adapter, tabId)
  const preSubmitCapture = preSubmitCaptureAttempt.result
  timing.pre_submit_capture_ms = Date.now() - preSubmitCaptureStartedAt
  timing.pre_submit_capture_attempts = preSubmitCaptureAttempt.attempts
  timing.pre_submit_capture_retry_reasons = preSubmitCaptureAttempt.retryReasons
  const paperIndex = pageContext.paperIndex ?? explicitPaperIndex ?? run.current_page_context?.paperIndex ?? 0
  const suggestedScore = Number(explicitSuggestedScore ?? run.pending_decision?.suggested_score ?? 0)
  const isFillBlank = run.question.type === 'fill_blank'
  const submitStartedAt = Date.now()
  const submitResult = isFillBlank
    ? await adapter.submitBatchScores(tabId, {
        paperIndex,
        batchScores: batchScores || {},
        reason: `automation ${run.run_id}`,
      })
    : await adapter.submitScore(tabId, {
        paperIndex,
        score: suggestedScore,
        reason: `automation ${run.run_id}`,
        questionId: run.question.id,
        subject: run.question.subject,
      })
  timing.submit_ms = Date.now() - submitStartedAt

  const submitReportStartedAt = Date.now()
  const submitResponse = await fetch(`${API_BASE}/api/automation/report/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submit_result: submitResult, timing }),
  })
  timing.submit_report_ms = Date.now() - submitReportStartedAt
  if (!submitResponse.ok || !submitResult.success) {
    return
  }

  const transition = await waitForNextCaptureCycle(adapter, tabId, preSubmitCapture, pageContext)
  timing.next_page_wait_ms = transition.elapsedMs
  timing.next_page_attempts = transition.attempts
  timing.total_browser_cycle_ms = Date.now() - cycleStartedAt
  await fetch(`${API_BASE}/api/automation/report/page-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition, timing }),
  })
}

async function captureCurrentAnswerWithRetry(
  adapter: SiteGradingAdapter,
  tabId: number
): Promise<{ result: CaptureImageResult; attempts: number; retryReasons: string[] }> {
  let lastCapture: CaptureImageResult | null = null
  const retryReasons: string[] = []

  for (let attempt = 1; attempt <= CAPTURE_MAX_ATTEMPTS; attempt += 1) {
    lastCapture = await adapter.captureCurrentAnswer(tabId)
    if (lastCapture.success && lastCapture.imageData) {
      return { result: lastCapture, attempts: attempt, retryReasons }
    }
    retryReasons.push(lastCapture.error || 'capture returned no image data')
    if (!isTransientCaptureError(lastCapture.error) || attempt === CAPTURE_MAX_ATTEMPTS) {
      return { result: lastCapture, attempts: attempt, retryReasons }
    }
    await sleep(CAPTURE_RETRY_DELAY_MS)
  }

  return {
    result: lastCapture || { success: false, error: 'capture failed' },
    attempts: CAPTURE_MAX_ATTEMPTS,
    retryReasons,
  }
}

function isTransientCaptureError(error?: string): boolean {
  if (!error) return true
  return /not visible|未找到.*图片|图片获取失败|loading|not complete/i.test(error)
}

async function validateAdapterForAutoSubmit(
  tabId: number,
  adapter: SiteGradingAdapter,
  questionType: 'single' | 'fill_blank'
): Promise<
  | { success: true; healthcheck: Awaited<ReturnType<SiteGradingAdapter['healthcheck']>> }
  | { success: false; error: string; healthcheck: Awaited<ReturnType<SiteGradingAdapter['healthcheck']>> }
> {
  const healthcheck = await adapter.healthcheck(tabId)
  const requiredChecks = questionType === 'fill_blank'
    ? ['adapterMatch', 'pageContext', 'answerImage', 'batchScoreInputs', 'submitButton']
    : ['adapterMatch', 'pageContext', 'answerImage', 'scoreInput', 'submitButton']
  const checks = healthcheck.checks || {}
  const failures = requiredChecks.filter(check => checks[check] !== true)

  if (!healthcheck.success || failures.length > 0) {
    return {
      success: false,
      error: `Adapter validation failed before auto-submit: ${failures.join(', ') || healthcheck.error || 'unknown failure'}`,
      healthcheck,
    }
  }

  const dryRun = questionType === 'fill_blank'
    ? await adapter.submitBatchScores(tabId, {
        paperIndex: 0,
        batchScores: { 0: 0 },
        dryRun: true,
        reason: 'auto-submit validation dry-run',
      })
    : await adapter.submitScore(tabId, {
        paperIndex: 0,
        score: 0,
        dryRun: true,
        reason: 'auto-submit validation dry-run',
      })

  if (!dryRun.success) {
    return {
      success: false,
      error: `Adapter dry-run failed before auto-submit: ${dryRun.message}`,
      healthcheck,
    }
  }

  return { success: true, healthcheck }
}

async function waitForNextCaptureCycle(
  adapter: SiteGradingAdapter,
  tabId: number,
  previousCapture: CaptureImageResult,
  previousContext?: PageContextResult
) {
  const startedAt = Date.now()
  const previousHash = captureFingerprint(previousCapture)

  // Check state immediately after submit. The previous fixed 300 ms delay was
  // visible in the p50 baseline even when the next page was already ready.
  let lastCapture = await adapter.captureCurrentAnswer(tabId)
  let lastContext = await adapter.getPageContext(tabId)

  for (let attempt = 1; attempt <= NEXT_PAGE_MAX_ATTEMPTS; attempt += 1) {
    const currentHash = captureFingerprint(lastCapture)
    if (currentHash && previousHash && currentHash !== previousHash) {
      return {
        success: true,
        previousHash,
        currentHash,
        pageContext: lastContext,
        elapsedMs: Date.now() - startedAt,
        attempts: attempt,
        message: `next page detected after ${attempt} capture check(s)`,
      }
    }

    if (pageIdentityChanged(previousContext, lastContext)) {
      return {
        success: true,
        previousHash,
        currentHash,
        pageContext: lastContext,
        elapsedMs: Date.now() - startedAt,
        attempts: attempt,
        message: `next page detected by page context after ${attempt} check(s)`,
      }
    }

    if (attempt < NEXT_PAGE_MAX_ATTEMPTS) {
      await sleep(NEXT_PAGE_RETRY_DELAY_MS)
      lastCapture = await adapter.captureCurrentAnswer(tabId)
      lastContext = await adapter.getPageContext(tabId)
    }
  }

  return {
    success: false,
    previousHash,
    currentHash: captureFingerprint(lastCapture),
    pageContext: lastContext,
    elapsedMs: Date.now() - startedAt,
    attempts: NEXT_PAGE_MAX_ATTEMPTS,
    message: `next page capture unchanged after ${NEXT_PAGE_MAX_ATTEMPTS} retries`,
  }
}

function captureFingerprint(capture: CaptureImageResult): string | null {
  if (capture.imageHash) return capture.imageHash
  if (!capture.success || !capture.imageData) return null
  return simpleHash(`${capture.width || 0}x${capture.height || 0}:${capture.imageData}`)
}

function pageIdentityChanged(
  previousContext: PageContextResult | undefined,
  currentContext: PageContextResult | undefined
): boolean {
  if (!previousContext || !currentContext) return false
  return Boolean(
    (previousContext.pageUrl && currentContext.pageUrl && previousContext.pageUrl !== currentContext.pageUrl) ||
      (previousContext.paperIndex !== null &&
        previousContext.paperIndex !== undefined &&
        currentContext.paperIndex !== null &&
        currentContext.paperIndex !== undefined &&
        previousContext.paperIndex !== currentContext.paperIndex) ||
      (previousContext.questionId && currentContext.questionId && previousContext.questionId !== currentContext.questionId)
  )
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash &= hash
  }
  return Math.abs(hash).toString(36)
}

async function resolveAdapterForTab(
  tabId: number,
  explicitAdapterId?: string,
  knownTabUrl?: string
): Promise<
  | { success: true; adapter: SiteGradingAdapter }
  | { success: false; response: { success: false; error: string; details: unknown } }
> {
  if (explicitAdapterId) {
    const byId = resolveAdapterById(explicitAdapterId)
    if (byId.success) {
      return byId
    }
    return {
      success: false,
      response: {
        success: false,
        error: byId.error.message,
        details: byId.error,
      },
    }
  }

  const tabUrl = knownTabUrl || (await chrome.tabs.get(tabId)).url || ''
  if (tabUrl) {
    const byUrl = resolveAdapterByUrl(tabUrl)
    if (byUrl.success) {
      return byUrl
    }
  }

  try {
    const pageContext = await runtimeAdapter.getPageContext(tabId)
    if (pageContext.site) {
      const byContext = resolveAdapterById(pageContext.site)
      if (byContext.success) {
        return byContext
      }
      return {
        success: false,
        response: {
          success: false,
          error: byContext.error.message,
          details: {
            ...byContext.error,
            pageContext,
          },
        },
      }
    }
  } catch (error) {
    return {
      success: false,
      response: {
        success: false,
        error: `Failed to inspect page context for adapter resolution: ${String(error)}`,
        details: { tabId },
      },
    }
  }

  return {
    success: false,
    response: {
      success: false,
      error: 'No grading adapter matched the active tab',
      details: { tabId, tabUrl },
    },
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 处理评分请求
async function handleGradeRequest(
  message: { payload: GradeRequestPayload },
  sendResponse: (response: unknown) => void
) {
  try {
    if (!(await hasDataConsent())) {
      sendResponse({ success: false, error: 'Data consent is required before sending grading data' })
      return
    }
    const response = await fetch(`${API_BASE}/api/grade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message.payload),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    sendResponse({ type: 'GRADE_RESPONSE', payload: data })
  } catch (error) {
    console.error('[agentic-grading] Grade request error:', error)
    sendResponse({ error: String(error) })
  }
}

// 监听标签页更新，在智学网页面显示提示
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  void hasDataConsent().then((consented) => {
    if (!consented || !tab.url) return
    const adapterResolution = resolveAdapterByUrl(tab.url || '')
    if (adapterResolution.success) {
      console.log('[agentic-grading] Adapter page detected:', adapterResolution.adapter.id)
    }
  })
})

console.log('[agentic-grading] Background service worker initialized')
