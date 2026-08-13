import {
  type BridgeConfig,
  ZhixueScoringBridge,
} from '../adapters/zhixue/scoring-bridge'
import {
  executeZhixueBatchPostSubmit,
  executeZhixuePostSubmit,
} from '../adapters/zhixue/network-submitter'
import { getDongniImageHash, getDongniQuestionImageBase64 } from '../adapters/dongni/capture'
import { DONGNI_SCORE_INPUT_DESCRIPTOR, DONGNI_VALIDATION_DESCRIPTORS } from '../adapters/dongni/descriptors'
import { getDongniPageContext } from '../adapters/dongni/page-context'
import { getReadboyImageHash, getReadboyQuestionImageBase64 } from '../adapters/readboy/capture'
import { READBOY_SCORE_INPUT_DESCRIPTOR, READBOY_VALIDATION_DESCRIPTORS } from '../adapters/readboy/descriptors'
import { getReadboyPageContext } from '../adapters/readboy/page-context'
import { getZhixueImageHash, getZhixueQuestionImageBase64 } from '../adapters/zhixue/capture'
import { ZHIXUE_SCORE_INPUT_DESCRIPTOR, ZHIXUE_VALIDATION_DESCRIPTORS } from '../adapters/zhixue/descriptors'
import { getZhixuePageContext } from '../adapters/zhixue/page-context'
import {
  SYNTHETIC_SCORE_INPUT_DESCRIPTOR,
  SYNTHETIC_VALIDATION_DESCRIPTORS,
} from '../adapters/synthetic/descriptors'
import { isSyntheticFixtureUrl } from '../adapters/synthetic/match'
import { probeDescriptors, resolveDescriptor, type TargetDescriptor } from '../adapters/core/descriptor'
import { getCurrentImageFingerprint, getCurrentImageHash, getCurrentQuestionImageBase64 } from './capture'
import { startImageObserver } from './observer'
import { CONTENT_MESSAGE_TYPES } from './messages'
import { getCurrentPageContext, getSyntheticPageContext } from './page-context'
import type { WriteScoreResult } from '../adapter/contracts'
import { DATA_CONSENT_STORAGE_KEY, readDataConsent } from '../privacy-consent'

console.log('[agentic-grading] Content script loaded')

let globalBridge: ZhixueScoringBridge | null = null
let heartbeatTimer: number | null = null
let stopImageObserver: (() => void) | null = null
const AUTOMATION_HEARTBEAT_MS = 500

function isExtensionContextInvalidated(error: unknown): boolean {
  return String(error).includes('Extension context invalidated')
}

function safeRuntimeSendMessage(message: unknown): void {
  try {
    void chrome.runtime.sendMessage(message).catch(error => {
      if (!isExtensionContextInvalidated(error)) {
        console.warn('[agentic-grading] runtime.sendMessage failed:', error)
      }
    })
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) {
      console.warn('[agentic-grading] runtime.sendMessage threw:', error)
    }
  }
}

function getBridge(config?: BridgeConfig, options?: { fresh?: boolean }): ZhixueScoringBridge {
  if (options?.fresh && globalBridge) {
    globalBridge.reset()
    globalBridge = null
  }

  if (!globalBridge || globalBridge.getState() === 'idle') {
    globalBridge = new ZhixueScoringBridge(config)
  }
  return globalBridge
}

function handleCaptureRequest(
  message: { selector?: string; adapterId?: string },
  sendResponse: (response: unknown) => void
): true {
  const capture = message.adapterId === 'zhixue' || window.location.hostname.includes('zhixue')
    ? getZhixueQuestionImageBase64(message.selector)
    : message.adapterId === 'readboy' || isReadboyHost(window.location.hostname)
      ? getReadboyQuestionImageBase64(message.selector)
    : message.adapterId === 'dongni' || isDongniHost(window.location.hostname)
      ? getDongniQuestionImageBase64(message.selector)
    : getCurrentQuestionImageBase64(message.selector)

  capture
    .then(result => {
      const imageHash = getCurrentImageHashForAdapter(message.adapterId)
      sendResponse({ ...result, imageHash })
    })
    .catch(error => {
      sendResponse({ success: false, error: String(error) })
    })
  return true
}

function getCurrentPageContextForAdapter(adapterId?: string) {
  if (adapterId === 'synthetic' || isSyntheticFixtureUrl(window.location.href)) {
    return getSyntheticPageContext()
  }
  if (adapterId === 'zhixue' || window.location.hostname.includes('zhixue')) {
    return getZhixuePageContext()
  }
  if (adapterId === 'readboy' || isReadboyHost(window.location.hostname)) {
    return getReadboyPageContext()
  }
  if (adapterId === 'dongni' || isDongniHost(window.location.hostname)) {
    return getDongniPageContext()
  }
  return getCurrentPageContext()
}

function getCurrentImageHashForAdapter(adapterId?: string): string | null {
  if (adapterId === 'zhixue' || window.location.hostname.includes('zhixue')) {
    return getZhixueImageHash()
  }
  if (adapterId === 'readboy' || isReadboyHost(window.location.hostname)) {
    return getReadboyImageHash()
  }
  if (adapterId === 'dongni' || isDongniHost(window.location.hostname)) {
    return getDongniImageHash()
  }
  return getCurrentImageHash()
}

async function getCurrentImageFingerprintForAdapter(adapterId?: string): Promise<string | null> {
  if (adapterId === 'zhixue' || window.location.hostname.includes('zhixue')) {
    const capture = await getZhixueQuestionImageBase64()
    if (!capture.success || !capture.imageData) {
      return null
    }
    return simpleFingerprint(capture.width || 0, capture.height || 0, capture.imageData)
  }
  if (adapterId === 'readboy' || isReadboyHost(window.location.hostname)) {
    const capture = await getReadboyQuestionImageBase64()
    if (!capture.success || !capture.imageData) {
      return null
    }
    return simpleFingerprint(capture.width || 0, capture.height || 0, capture.imageData)
  }
  if (adapterId === 'dongni' || isDongniHost(window.location.hostname)) {
    const capture = await getDongniQuestionImageBase64()
    if (!capture.success || !capture.imageData) {
      return null
    }
    return simpleFingerprint(capture.width || 0, capture.height || 0, capture.imageData)
  }
  return getCurrentImageFingerprint()
}

function isReadboyHost(hostname: string): boolean {
  return hostname.includes('readboy.com') || hostname === 'inland.maplebolo.com'
}

function isDongniHost(hostname: string): boolean {
  return hostname === 'dongni100.com' || hostname.endsWith('.dongni100.com')
}

function getValidationDescriptorsForAdapter(adapterId?: string): TargetDescriptor[] {
  if (adapterId === 'synthetic' || isSyntheticFixtureUrl(window.location.href)) {
    return SYNTHETIC_VALIDATION_DESCRIPTORS
  }
  if (adapterId === 'zhixue' || window.location.hostname.includes('zhixue')) {
    return ZHIXUE_VALIDATION_DESCRIPTORS
  }
  if (adapterId === 'readboy' || isReadboyHost(window.location.hostname)) {
    return READBOY_VALIDATION_DESCRIPTORS
  }
  if (adapterId === 'dongni' || isDongniHost(window.location.hostname)) {
    return DONGNI_VALIDATION_DESCRIPTORS
  }
  return []
}

function getScoreInputDescriptorForAdapter(adapterId?: string): TargetDescriptor | null {
  if (adapterId === 'synthetic' || isSyntheticFixtureUrl(window.location.href)) {
    return SYNTHETIC_SCORE_INPUT_DESCRIPTOR
  }
  if (adapterId === 'zhixue' || window.location.hostname.includes('zhixue')) {
    return ZHIXUE_SCORE_INPUT_DESCRIPTOR
  }
  if (adapterId === 'dongni' || isDongniHost(window.location.hostname)) {
    return DONGNI_SCORE_INPUT_DESCRIPTOR
  }
  if (adapterId === 'readboy' || isReadboyHost(window.location.hostname)) {
    return READBOY_SCORE_INPUT_DESCRIPTOR
  }
  return null
}

function writeScoreWithDescriptor(options: {
  adapterId?: string
  paperIndex: number
  score: number
  dryRun?: boolean
}): WriteScoreResult {
  const descriptor = getScoreInputDescriptorForAdapter(options.adapterId)
  if (!descriptor) {
    return {
      success: false,
      paperIndex: options.paperIndex,
      score: options.score,
      timestamp: Date.now(),
      method: 'descriptor-write',
      message: `No score input descriptor for ${options.adapterId || 'current page'}`,
      error: 'score_input_descriptor_not_found',
    }
  }

  const resolution = resolveDescriptor(descriptor)
  if (!resolution.success) {
    return {
      success: false,
      paperIndex: options.paperIndex,
      score: options.score,
      timestamp: Date.now(),
      method: 'descriptor-write',
      message: `Score input not found: ${resolution.error}`,
      error: resolution.error,
    }
  }

  const input = resolution.element
  if (!(input instanceof HTMLInputElement)) {
    return {
      success: false,
      paperIndex: options.paperIndex,
      score: options.score,
      timestamp: Date.now(),
      method: 'descriptor-write',
      message: 'Resolved score target is not an input',
      error: 'score_target_not_input',
    }
  }

  if (options.dryRun) {
    return {
      success: true,
      paperIndex: options.paperIndex,
      score: options.score,
      timestamp: Date.now(),
      method: 'dry-run',
      message: 'Dry-run passed: score input target resolved without writing',
    }
  }

  const value = String(options.score)
  setInputValue(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  input.blur()

  const written = input.value === value || Number(input.value) === Number(value)
  return {
    success: written,
    paperIndex: options.paperIndex,
    score: options.score,
    timestamp: Date.now(),
    method: 'descriptor-write',
    message: written ? 'Score written to input' : `Score write did not stick; current input value is ${input.value}`,
    error: written ? undefined : 'score_write_not_applied',
  }
}

function setInputValue(input: HTMLInputElement, value: string): void {
  input.focus()
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (setter) {
    setter.call(input, value)
  } else {
    input.value = value
  }
}

function handleObservePageChange(
  timeoutMs: number,
  adapterId: string | undefined,
  sendResponse: (response: unknown) => void
): true {
  const previousSrcHash = getCurrentImageHashForAdapter(adapterId)
  const previousPageContext = getCurrentPageContextForAdapter(adapterId)
  const previousScoreValues = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="topicTxt"], input.topictxt_input, input.scores.fl')
  ).map(input => input.value.trim())
  const previousTopicLabel = (
    document.querySelector('.marking_left .title, .title, .topic-title, .title_box, .main_title')?.textContent || ''
  ).trim()

  const run = async (): Promise<void> => {
    const previousFingerprint = await getCurrentImageFingerprintForAdapter(adapterId)
    const deadline = Date.now() + timeoutMs

    const tick = async (): Promise<void> => {
      const currentSrcHash = getCurrentImageHashForAdapter(adapterId)
      const currentPageContext = getCurrentPageContextForAdapter(adapterId)
      const currentFingerprint = await getCurrentImageFingerprintForAdapter(adapterId)
      const currentScoreValues = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="topicTxt"], input.topictxt_input, input.scores.fl')
      ).map(input => input.value.trim())
      const currentTopicLabel = (
        document.querySelector('.marking_left .title, .title, .topic-title, .title_box, .main_title')?.textContent || ''
      ).trim()
      const fingerprintChanged = Boolean(
        previousFingerprint && currentFingerprint && currentFingerprint !== previousFingerprint
      )
      const pageContextChanged = Boolean(
        currentPageContext.pageUrl !== previousPageContext.pageUrl ||
        currentPageContext.paperIndex !== previousPageContext.paperIndex ||
        currentPageContext.questionId !== previousPageContext.questionId
      )
      const scoreInputsReset = Boolean(
        previousScoreValues.some(value => value !== '') &&
        currentScoreValues.length > 0 &&
        currentScoreValues.every(value => value === '')
      )
      const topicChanged = Boolean(previousTopicLabel && currentTopicLabel && previousTopicLabel !== currentTopicLabel)

      if (fingerprintChanged || pageContextChanged || scoreInputsReset || topicChanged) {
        const message = fingerprintChanged
          ? 'page changed by image fingerprint'
          : pageContextChanged
            ? 'page changed by context'
            : scoreInputsReset
              ? 'page changed by score input reset'
              : 'page changed by topic label'
        sendResponse({
          success: true,
          previousHash: previousFingerprint || previousSrcHash,
          currentHash: currentFingerprint || currentSrcHash,
          pageContext: currentPageContext,
          message,
        })
        return
      }

      if (Date.now() >= deadline) {
        sendResponse({
          success: false,
          previousHash: previousFingerprint || previousSrcHash,
          currentHash: currentFingerprint || currentSrcHash,
          pageContext: currentPageContext,
          message: 'wait for next page timed out',
        })
        return
      }

      window.setTimeout(() => {
        void tick()
      }, 500)
    }

    await tick()
  }

  void run().catch(error => {
    sendResponse({
      success: false,
      previousHash: previousSrcHash,
      currentHash: null,
      pageContext: getCurrentPageContextForAdapter(adapterId),
      message: String(error),
    })
  })
  return true
}

function simpleFingerprint(width: number, height: number, imageData: string): string {
  let hash = 0
  const input = `${width}x${height}:${imageData}`
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash &= hash
  }
  return Math.abs(hash).toString(36)
}

const CONSENT_REQUIRED_CONTENT_MESSAGES = new Set<string>([
  CONTENT_MESSAGE_TYPES.getPageImage,
  CONTENT_MESSAGE_TYPES.getPageContext,
  CONTENT_MESSAGE_TYPES.observePageChange,
  CONTENT_MESSAGE_TYPES.probeAdapterTargets,
  CONTENT_MESSAGE_TYPES.descriptorWriteScore,
  CONTENT_MESSAGE_TYPES.scoreBridgeWrite,
  CONTENT_MESSAGE_TYPES.submitToZhixuePost,
  CONTENT_MESSAGE_TYPES.scoreBridgeExecute,
  CONTENT_MESSAGE_TYPES.scoreBridgeReset,
  CONTENT_MESSAGE_TYPES.scoreBridgeUndo,
  CONTENT_MESSAGE_TYPES.scoreBridgeStatus,
  CONTENT_MESSAGE_TYPES.scoreBridgeEnterReview,
  CONTENT_MESSAGE_TYPES.submitBatchPost,
  CONTENT_MESSAGE_TYPES.scoreBridgeBatch,
])

function handleContentMessage(
  message: Record<string, any>,
  sendResponse: (response: unknown) => void
): boolean {
  switch (message.type) {
    case CONTENT_MESSAGE_TYPES.getPageImage:
      return handleCaptureRequest(message, sendResponse)

    case CONTENT_MESSAGE_TYPES.ping:
      sendResponse({ success: true })
      break

    case CONTENT_MESSAGE_TYPES.getPageContext:
      sendResponse(getCurrentPageContextForAdapter(message.adapterId))
      break

    case CONTENT_MESSAGE_TYPES.observePageChange:
      return handleObservePageChange(Number(message.timeoutMs || 10000), message.adapterId, sendResponse)

    case CONTENT_MESSAGE_TYPES.probeAdapterTargets: {
      const descriptors = getValidationDescriptorsForAdapter(message.adapterId)
      sendResponse({
        success: descriptors.length > 0,
        adapterId: message.adapterId,
        probes: probeDescriptors(descriptors),
        error: descriptors.length > 0 ? undefined : `No validation descriptors for ${message.adapterId || 'current page'}`,
      })
      break
    }

    case CONTENT_MESSAGE_TYPES.descriptorWriteScore:
      sendResponse(writeScoreWithDescriptor({
        adapterId: message.adapterId,
        paperIndex: Number(message.paperIndex ?? 0),
        score: Number(message.score),
        dryRun: Boolean(message.dryRun),
      }))
      break

    case CONTENT_MESSAGE_TYPES.scoreBridgeWrite:
      getBridge(message.config, { fresh: true })
        .writeOnly(message.score, message.paperIndex, message.customConfig)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case CONTENT_MESSAGE_TYPES.submitToZhixuePost:
      executeZhixuePostSubmit(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: String(error) }))
      return true

    case CONTENT_MESSAGE_TYPES.scoreBridgeExecute:
      getBridge(message.config, { fresh: true })
        .execute(message.score, message.paperIndex, message.customConfig)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    case CONTENT_MESSAGE_TYPES.scoreBridgeReset:
      if (globalBridge) {
        globalBridge.reset()
        sendResponse({ success: true, message: '已重置' })
      } else {
        sendResponse({ success: false, message: '无活动桥接' })
      }
      break

    case CONTENT_MESSAGE_TYPES.scoreBridgeUndo:
      if (globalBridge) {
        globalBridge.undoSubmit()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, message: String(error) }))
      } else {
        sendResponse({ success: false, message: '无活动桥接' })
      }
      return true

    case CONTENT_MESSAGE_TYPES.scoreBridgeStatus:
      if (globalBridge) {
        sendResponse({
          success: true,
          state: globalBridge.getState(),
          config: globalBridge.getConfig(),
        })
      } else {
        sendResponse({ success: false, message: '桥接未初始化' })
      }
      break

    case CONTENT_MESSAGE_TYPES.scoreBridgeEnterReview:
      if (globalBridge) {
        globalBridge.enterReviewMode()
        sendResponse({ success: true, message: '已进入复审模式' })
      } else {
        sendResponse({ success: false, message: '桥接未初始化' })
      }
      break

    case CONTENT_MESSAGE_TYPES.submitBatchPost:
      executeZhixueBatchPostSubmit(message.data)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: String(error) }))
      return true

    case CONTENT_MESSAGE_TYPES.scoreBridgeBatch:
      getBridge(message.config, { fresh: true })
        .executeBatchFillBlank(message as {
          paperIndex: number
          batchScores: Record<number, number>
          reason: string
        })
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: String(error) }))
      return true

    default:
      sendResponse({ error: 'Unknown message type' })
  }

  return false
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!CONSENT_REQUIRED_CONTENT_MESSAGES.has(message.type)) {
    return handleContentMessage(message, sendResponse)
  }

  void readDataConsent().then((accepted) => {
    if (!accepted) {
      sendResponse({ success: false, error: 'Data consent is required before accessing grading-page data' })
      return
    }
    handleContentMessage(message, sendResponse)
  }).catch((error) => {
    sendResponse({ success: false, error: `Unable to verify data consent: ${String(error)}` })
  })
  return true
})

async function syncImageObserverWithConsent(): Promise<void> {
  const accepted = await readDataConsent()
  if (accepted && !stopImageObserver) {
    const start = async () => {
      // The tab may finish loading after the user revokes consent. Re-check
      // immediately before observing DOM mutations so a pending load callback
      // cannot re-enable page observation.
      if (!(await readDataConsent())) return
      if (!stopImageObserver) {
        stopImageObserver = startImageObserver(() => getCurrentImageHashForAdapter())
      }
    }
    if (document.readyState === 'complete') void start()
    else window.addEventListener('load', start, { once: true })
  } else if (!accepted && stopImageObserver) {
    stopImageObserver()
    stopImageObserver = null
  }
}

function stopAutomationHeartbeat(): void {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

async function syncAutomationHeartbeatWithConsent(): Promise<void> {
  const accepted = await readDataConsent()
  if (!accepted) {
    stopAutomationHeartbeat()
    return
  }
  if (heartbeatTimer !== null) return

  safeRuntimeSendMessage({
    type: CONTENT_MESSAGE_TYPES.contentScriptReady,
    url: window.location.href,
    features: ['image-capture', 'score-bridge', 'post-submit'],
  })
  heartbeatTimer = window.setInterval(() => {
    safeRuntimeSendMessage({
      type: CONTENT_MESSAGE_TYPES.automationHeartbeat,
      url: window.location.href,
    })
  }, AUTOMATION_HEARTBEAT_MS)
}

void syncImageObserverWithConsent()
void syncAutomationHeartbeatWithConsent()
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[DATA_CONSENT_STORAGE_KEY]) {
    void syncImageObserverWithConsent()
    void syncAutomationHeartbeatWithConsent()
  }
})

window.addEventListener('pagehide', () => {
  stopAutomationHeartbeat()
  stopImageObserver?.()
  stopImageObserver = null
})

console.log('[agentic-grading] Content script with adapter modules loaded')
