import { RuntimeBrowserAdapter } from '../../adapter/runtime-browser-adapter'
import type { SubmitBatchScoresRequest, SubmitScoreRequest, SubmitScoreResult, WriteScoreRequest, WriteScoreResult } from '../../adapter/contracts'
import { CONTENT_MESSAGE_TYPES } from '../../content/messages'
import type { DescriptorProbe } from '../core/descriptor'
import {
  type SiteAdapterHealthcheckResult,
  type SiteGradingAdapter,
} from '../core/site-adapter'

const runtimeAdapter = new RuntimeBrowserAdapter()

export const ReadboyAdapter: SiteGradingAdapter = {
  id: 'readboy',
  displayName: 'Readboy',
  capabilities: {
    singleScore: true,
    batchScores: true,
    domSubmit: true,
    networkSubmit: false,
    observeNext: true,
    healthcheck: true,
  },
  match(url: URL): boolean {
    return url.hostname === 'readboy.com' || url.hostname.endsWith('.readboy.com')
  },
  getPageContext(tabId) {
    return runtimeAdapter.getPageContext(tabId, this.id)
  },
  captureCurrentAnswer(tabId, selector) {
    return runtimeAdapter.captureCurrentImage(tabId, selector, this.id)
  },
  async writeScore(tabId, request) {
    return writeReadboyScore(tabId, request)
  },
  async submitScore(tabId, request) {
    return submitReadboyScore(tabId, request)
  },
  async submitBatchScores(tabId, request) {
    return submitReadboyBatchScores(tabId, request)
  },
  observePageChange(tabId, timeoutMs) {
    return runtimeAdapter.observePageChange(tabId, timeoutMs, this.id)
  },
  async healthcheck(tabId): Promise<SiteAdapterHealthcheckResult> {
    const tab = await chrome.tabs.get(tabId)
    const matched = tab.url ? safelyMatchUrl(this, tab.url) : false
    const context = await this.getPageContext(tabId)
    const probes = await probeAdapterTargets(tabId, this.id)
    const checks = {
      adapterMatch: matched,
      pageContext: Boolean(context.success && context.site === this.id),
      answerImage: hasProbe(probes, 'answerImage'),
      nextItemSignal: hasProbe(probes, 'nextItemSignal'),
      scoreInput: hasProbe(probes, 'scoreInput'),
      batchScoreInputs: hasProbe(probes, 'batchScoreInputs'),
      submitButton: hasProbe(probes, 'submitButton'),
    }
    const requiredChecks = ['adapterMatch', 'pageContext', 'answerImage', 'scoreInput', 'submitButton']
    const failures = requiredChecks.filter(check => !checks[check as keyof typeof checks])
    const validationPassed = failures.length === 0

    return {
      success: validationPassed,
      adapterId: this.id,
      matched,
      checks,
      probes,
      validationPassed,
      requiredChecks,
      failures,
      message: validationPassed ? 'Readboy adapter validation passed' : `Readboy adapter validation failed: ${failures.join(', ')}`,
      error: context.error || (failures.length > 0 ? failures.join(', ') : undefined),
    }
  },
}

async function writeReadboyScore(tabId: number, request: WriteScoreRequest): Promise<WriteScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: writeReadboyScoreInPage,
      args: [request.score, Boolean(request.dryRun)],
    })
    const result = injection?.result as { success: boolean; message?: string; error?: string } | undefined
    const success = Boolean(result?.success)
    return {
      success,
      paperIndex: request.paperIndex,
      score: request.score,
      timestamp: Date.now(),
      method: request.dryRun ? 'dry-run' : 'dom-write',
      message: result?.message || (success ? 'Score written to input' : '写分失败'),
      error: success ? undefined : result?.error || result?.message || 'write_failed',
    }
  } catch (error) {
    return {
      success: false,
      paperIndex: request.paperIndex,
      score: request.score,
      timestamp: Date.now(),
      method: 'dom-write',
      message: `写分异常: ${String(error)}`,
      error: String(error),
    }
  }
}

async function submitReadboyScore(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: submitReadboyBatchScoresInPage,
      args: [{ 0: request.score }, Boolean(request.dryRun)],
    })
    return normalizeSubmitResult(injection?.result, request, request.dryRun ? 'dry-run' : 'dom-submit')
  } catch (error) {
    return {
      success: false,
      paperIndex: request.paperIndex,
      score: request.score,
      timestamp: Date.now(),
      method: 'dom-submit',
      message: `提交异常: ${String(error)}`,
      details: { error: String(error) },
    }
  }
}

async function submitReadboyBatchScores(tabId: number, request: SubmitBatchScoresRequest): Promise<SubmitScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: submitReadboyBatchScoresInPage,
      args: [request.batchScores, Boolean(request.dryRun)],
    })
    return normalizeSubmitResult(injection?.result, request, request.dryRun ? 'dry-run' : 'dom-batch-submit')
  } catch (error) {
    return {
      success: false,
      paperIndex: request.paperIndex,
      timestamp: Date.now(),
      method: 'dom-batch-submit',
      message: `批量提交异常: ${String(error)}`,
      details: { error: String(error) },
    }
  }
}

function normalizeSubmitResult(
  raw: unknown,
  request: SubmitScoreRequest | SubmitBatchScoresRequest,
  method: string
): SubmitScoreResult {
  const result = raw as { success?: boolean; message?: string; error?: string } | undefined
  const success = Boolean(result?.success)
  return {
    success,
    paperIndex: request.paperIndex,
    score: 'score' in request ? request.score : undefined,
    timestamp: Date.now(),
    method,
    message: result?.message || (result ? (success ? 'Readboy submit completed' : '提交失败') : '页面注入未返回结果'),
    details: success ? undefined : { error: result?.error || result?.message || (result ? 'submit_failed' : 'page_injection_no_result') },
  }
}

function writeReadboyScoreInPage(score: number, dryRun: boolean): { success: boolean; message?: string; error?: string } {
  const isVisible = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
  }
  const uniqueElements = (elements: Element[]): Element[] => {
    const seen = new Set<Element>()
    return elements.filter(element => {
      if (seen.has(element)) return false
      seen.add(element)
      return true
    })
  }
  const describeElement = (element: HTMLElement): string => {
    const id = element.id ? `#${element.id}` : ''
    const className = typeof element.className === 'string' && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).join('.')}`
      : ''
    return `${element.tagName.toLowerCase()}${id}${className}`
  }
  const clickElement = (element: HTMLElement): void => {
    element.focus()
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    element.click()
  }
  const ensureKeyboardMode = (): void => {
    const keyboardButton = Array.from(document.querySelectorAll('button'))
      .find((element): element is HTMLButtonElement =>
        element instanceof HTMLButtonElement &&
        isVisible(element) &&
        (element.textContent || '').trim() === '键盘打分'
      )
    if (!keyboardButton || keyboardButton.classList.contains('active')) return
    clickElement(keyboardButton)
  }
  const findScoreInputs = (): HTMLInputElement[] => {
    const selectors = [
      'input[data-score-point-input]',
      '.score-input input[type="number"]',
      'section#score-point-form input[type="number"]',
      'input[placeholder*="得分"]',
      'input[placeholder*="分"]',
      'input[type="number"]',
      'input[name*="score" i]',
      'input[class*="score" i]',
      'input[class*="point" i]',
      'input[class*="mark" i]',
      'input.el-input__inner',
    ]
    return uniqueElements(
      selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
    ).filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element) && !element.disabled)
  }
  const writeScore = (input: HTMLInputElement): { success: boolean; message?: string; error?: string } => {
    const value = String(score)
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) {
      setter.call(input, value)
    } else {
      input.value = value
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value }))
    input.blur()
    const written = input.value === value || Number(input.value) === Number(value)
    return {
      success: written,
      message: written
        ? `Score written to ${describeElement(input)}`
        : `Score write did not stick for ${describeElement(input)}; current input value is ${input.value}`,
      error: written ? undefined : 'score_write_not_applied',
    }
  }
  const inputNotFound = (): { success: false; message: string; error: string } => {
    const visibleInputs = Array.from(document.querySelectorAll('input'))
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element))
      .map(element => element.placeholder || element.getAttribute('aria-label') || element.name || element.className || element.type || 'input')
      .slice(0, 8)
      .join(', ')
    return {
      success: false,
      error: 'score_input_not_found',
      message: visibleInputs ? `未找到分数输入框；可见输入框: ${visibleInputs}` : '未找到可见分数输入框',
    }
  }

  ensureKeyboardMode()
  const input = findScoreInputs()[0] || null
  if (!input) return inputNotFound()
  if (dryRun) return { success: true, message: `Dry-run passed: score input resolved as ${describeElement(input)}` }
  return writeScore(input)
}

async function submitReadboyBatchScoresInPage(
  batchScores: Record<number, number>,
  dryRun: boolean
): Promise<{ success: boolean; message?: string; error?: string }> {
  const isVisible = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
  }
  const uniqueElements = (elements: Element[]): Element[] => {
    const seen = new Set<Element>()
    return elements.filter(element => {
      if (seen.has(element)) return false
      seen.add(element)
      return true
    })
  }
  const describeElement = (element: HTMLElement): string => {
    const id = element.id ? `#${element.id}` : ''
    const className = typeof element.className === 'string' && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).join('.')}`
      : ''
    return `${element.tagName.toLowerCase()}${id}${className}`
  }
  const clickElement = (element: HTMLElement): void => {
    element.focus()
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    element.click()
  }
  const ensureKeyboardMode = (): void => {
    const keyboardButton = Array.from(document.querySelectorAll('button'))
      .find((element): element is HTMLButtonElement =>
        element instanceof HTMLButtonElement &&
        isVisible(element) &&
        (element.textContent || '').trim() === '键盘打分'
      )
    if (!keyboardButton || keyboardButton.classList.contains('active')) return
    clickElement(keyboardButton)
  }
  const findScoreInputs = (): HTMLInputElement[] => {
    const selectors = [
      'input[data-score-point-input]',
      '.score-input input[type="number"]',
      'section#score-point-form input[type="number"]',
    ]
    return uniqueElements(
      selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
    ).filter((element): element is HTMLInputElement =>
      element instanceof HTMLInputElement && isVisible(element) && !element.disabled
    )
  }
  const findSubmitButton = (options: { includeDisabled?: boolean } = {}): HTMLElement | null => {
    const selectors = [
      'button.submit-btn',
      'button[type="submit"]',
      'button[class*="submit" i]',
      'a[class*="submit" i]',
      'button[class*="save" i]',
      'a[class*="save" i]',
      'button.el-button--primary',
      '.el-button--primary',
    ]
    const selectorCandidates = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
    const textCandidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(element => ['提交', '保存', '确认', '完成批改'].some(text => (element.textContent || '').trim().includes(text)))
    const candidates = uniqueElements([...selectorCandidates, ...textCandidates])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && isVisible(element))
      .filter(element => options.includeDisabled || (!element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true'))
    return candidates.find(element => ['提交', '保存', '确认', '完成批改'].includes((element.textContent || '').trim())) ||
      candidates[0] ||
      null
  }
  const writeScoreToInput = (input: HTMLInputElement, score: number): { success: boolean; message?: string; error?: string } => {
    const value = String(score)
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (setter) {
      setter.call(input, value)
    } else {
      input.value = value
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value }))
    input.blur()
    const written = input.value === value || Number(input.value) === Number(value)
    return {
      success: written,
      message: written
        ? `Score written to ${describeElement(input)}`
        : `Score write did not stick for ${describeElement(input)}; current input value is ${input.value}`,
      error: written ? undefined : 'score_write_not_applied',
    }
  }
  const submitButtonNotFound = (): { success: false; message: string; error: string } => {
    const visibleButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element): element is HTMLElement => element instanceof HTMLElement && isVisible(element))
      .map(element => (element.textContent || element.getAttribute('aria-label') || describeElement(element)).trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(', ')
    return {
      success: false,
      error: 'submit_button_not_found',
      message: visibleButtons ? `未找到提交按钮；可见按钮: ${visibleButtons}` : '未找到可见提交按钮',
    }
  }

  ensureKeyboardMode()
  const entries = Object.entries(batchScores)
    .map(([index, score]) => [Number(index), score] as const)
    .filter(([index, score]) => Number.isFinite(index) && Number.isFinite(score))
    .sort(([left], [right]) => left - right)
  if (entries.length === 0) {
    return { success: false, error: 'empty_batch_scores', message: '没有可提交的批量分数' }
  }
  const inputs = findScoreInputs()
  if (inputs.length < entries.length) {
    return {
      success: false,
      error: 'batch_score_inputs_insufficient',
      message: `批量分数输入框不足: 需要 ${entries.length} 个，找到 ${inputs.length} 个`,
    }
  }
  if (dryRun) {
    const button = findSubmitButton({ includeDisabled: true })
    if (!button) return submitButtonNotFound()
    return {
      success: true,
      message: `Dry-run passed: ${entries.length} batch score(s); inputs=${inputs.length}; submit=${describeElement(button)}`,
    }
  }
  for (let i = 0; i < entries.length; i += 1) {
    const [, score] = entries[i]!
    const result = writeScoreToInput(inputs[i]!, score)
    if (!result.success) return result
  }
  const button = findSubmitButton()
  if (!button) return submitButtonNotFound()
  clickElement(button)
  return { success: true, message: `Wrote ${entries.length} batch score(s), then clicked ${describeElement(button)}` }
}

async function probeAdapterTargets(tabId: number, adapterId: string): Promise<DescriptorProbe[]> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: CONTENT_MESSAGE_TYPES.probeAdapterTargets,
      adapterId,
    })
    return (response as { probes?: DescriptorProbe[] } | undefined)?.probes || []
  } catch {
    return []
  }
}

function hasProbe(probes: DescriptorProbe[], target: DescriptorProbe['target']): boolean {
  return probes.some(probe => probe.target === target && probe.success)
}

function safelyMatchUrl(adapter: SiteGradingAdapter, url: string): boolean {
  try {
    return adapter.match(new URL(url))
  } catch {
    return false
  }
}
