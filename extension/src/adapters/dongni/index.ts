import { RuntimeBrowserAdapter } from '../../adapter/runtime-browser-adapter'
import type { SubmitScoreRequest, SubmitScoreResult, WriteScoreRequest, WriteScoreResult } from '../../adapter/contracts'
import { CONTENT_MESSAGE_TYPES } from '../../content/messages'
import type { DescriptorProbe } from '../core/descriptor'
import {
  unsupportedSubmitResult,
  type SiteAdapterHealthcheckResult,
  type SiteGradingAdapter,
} from '../core/site-adapter'

const runtimeAdapter = new RuntimeBrowserAdapter()

export const DongniAdapter: SiteGradingAdapter = {
  id: 'dongni',
  displayName: 'Dongni Education',
  capabilities: {
    singleScore: true,
    batchScores: false,
    domSubmit: true,
    networkSubmit: false,
    observeNext: true,
    healthcheck: true,
  },
  match(url: URL): boolean {
    return url.hostname === 'dongni100.com' || url.hostname.endsWith('.dongni100.com')
  },
  getPageContext(tabId) {
    return runtimeAdapter.getPageContext(tabId, this.id)
  },
  captureCurrentAnswer(tabId, selector) {
    return runtimeAdapter.captureCurrentImage(tabId, selector, this.id)
  },
  async writeScore(tabId, request) {
    return writeScoreWithDescriptor(tabId, this.id, request)
  },
  async submitScore(tabId, request) {
    return submitScoreWithDom(tabId, request)
  },
  submitBatchScores() {
    return Promise.resolve(unsupportedSubmitResult(this, 'submit_batch_scores'))
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
      submitButton: hasProbe(probes, 'submitButton'),
    }
    const requiredChecks = ['adapterMatch', 'pageContext', 'answerImage']
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
      message: validationPassed ? 'Dongni adapter validation passed' : `Dongni adapter validation failed: ${failures.join(', ')}`,
      error: context.error || (failures.length > 0 ? failures.join(', ') : undefined),
    }
  },
}

async function submitScoreWithDom(
  tabId: number,
  request: SubmitScoreRequest
): Promise<SubmitScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: submitDongniScoreInPage,
      args: [request.score, Boolean(request.dryRun)],
    })
    const result = injection?.result as { success: boolean; message?: string; error?: string } | undefined
    const success = Boolean(result?.success)
    return {
      success,
      paperIndex: request.paperIndex,
      score: request.score,
      timestamp: Date.now(),
      method: request.dryRun ? 'dry-run' : 'dom-submit',
      message: result?.message || (success ? 'Submit button clicked' : '提交失败'),
      details: success ? undefined : { error: result?.error || result?.message || 'submit_failed' },
    }
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

async function submitDongniScoreInPage(score: number, dryRun: boolean): Promise<{ success: boolean; message?: string; error?: string }> {
  const isVisible = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
  }
  const describe = (element: HTMLElement): string => {
    const id = element.id ? `#${element.id}` : ''
    const className = typeof element.className === 'string' && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).join('.')}`
      : ''
    return `${element.tagName.toLowerCase()}${id}${className}`
  }
  const findButton = (selectors: string[], text: string, excludeText?: string): HTMLElement | null => {
    const selectorCandidates = selectors
      .flatMap(selector => Array.from(document.querySelectorAll(selector)))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
    const textCandidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter(element => (element.textContent || '').trim().includes(text))
    const seen = new Set<HTMLElement>()
    const candidates = [...selectorCandidates, ...textCandidates]
      .filter(element => {
        if (seen.has(element)) return false
        seen.add(element)
        return isVisible(element) &&
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-disabled') !== 'true'
      })
      .filter(element => !excludeText || !(element.textContent || '').includes(excludeText))
    return candidates.find(element => (element.textContent || '').trim() === text) || candidates[0] || null
  }
  const clickElement = (element: HTMLElement): void => {
    element.focus()
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    element.click()
  }
  const sleep = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms))
  const scoreSelectors = [
    'input.el-input__inner[placeholder*="分"]',
    'input[placeholder*="分"]',
    'input[aria-label*="得分"]',
    'input.el-input__inner',
    'input[type="number"]',
    'input[name*="score" i]',
    'input[class*="score" i]',
  ]
  const findScoreInput = (): HTMLInputElement | null => {
    for (const selector of scoreSelectors) {
      const input = Array.from(document.querySelectorAll(selector))
        .find((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element))
      if (input) return input
    }
    return null
  }
  const writeScore = (input: HTMLInputElement, value: string): boolean => {
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
    return input.value === value || Number(input.value) === Number(value)
  }
  const submitSelectors = [
    'button.el-button--primary',
    'button[type="submit"]',
    'button[class*="submit" i]',
    'a[class*="submit" i]',
  ]
  const nextSelectors = [
    'a[href*="next"]',
    'button[class*="next" i]',
    'a[class*="next" i]',
  ]
  const scoreInput = findScoreInput()
  if (!scoreInput) {
    const visibleInputs = Array.from(document.querySelectorAll('input'))
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element))
      .map(element => element.placeholder || element.getAttribute('aria-label') || element.className || element.type || 'input')
      .slice(0, 8)
      .join(', ')
    return {
      success: false,
      error: 'score_input_not_found',
      message: visibleInputs ? `未找到分数输入框；可见输入框: ${visibleInputs}` : '未找到可见分数输入框',
    }
  }
  const submitButton = findButton(submitSelectors, '提交', '自动提交')
  if (!submitButton) {
    const visibleButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element): element is HTMLElement => element instanceof HTMLElement && isVisible(element))
      .map(element => (element.textContent || element.getAttribute('aria-label') || describe(element)).trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(', ')
    return {
      success: false,
      error: 'submit_button_not_found',
      message: visibleButtons ? `未找到提交按钮；可见按钮: ${visibleButtons}` : '未找到可见提交按钮',
    }
  }
  let nextButton = findButton(nextSelectors, '下一份')
  if (!nextButton) {
    const visibleButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element): element is HTMLElement => element instanceof HTMLElement && isVisible(element))
      .map(element => (element.textContent || element.getAttribute('aria-label') || describe(element)).trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(', ')
    return {
      success: false,
      error: 'next_button_not_found',
      message: visibleButtons ? `未找到下一份按钮；可见按钮: ${visibleButtons}` : '未找到可见下一份按钮',
    }
  }
  const submitDescription = describe(submitButton)
  const nextDescription = describe(nextButton)
  if (dryRun) {
    return { success: true, message: `Dry-run passed: score input resolved; submit=${submitDescription}; next=${nextDescription}` }
  }
  const value = String(score)
  if (!writeScore(scoreInput, value)) {
    return {
      success: false,
      error: 'score_write_not_applied',
      message: `Score write did not stick before submit; current input value is ${scoreInput.value}`,
    }
  }
  clickElement(submitButton)
  await sleep(1000)
  nextButton = findButton(nextSelectors, '下一份')
  if (!nextButton) {
    return {
      success: false,
      error: 'next_button_not_found_after_submit',
      message: `Clicked submit button ${submitDescription}, but next button disappeared after submit`,
    }
  }
  const refreshedNextDescription = describe(nextButton)
  clickElement(nextButton)
  return { success: true, message: `Clicked submit button ${submitDescription}, then next button ${refreshedNextDescription}` }
}

async function writeScoreWithDescriptor(
  tabId: number,
  adapterId: string,
  request: WriteScoreRequest
): Promise<WriteScoreResult> {
  void adapterId
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: writeDongniScoreInPage,
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
      method: 'descriptor-write',
      message: `写分异常: ${String(error)}`,
      error: String(error),
    }
  }
}

function writeDongniScoreInPage(score: number, dryRun: boolean): { success: boolean; message?: string; error?: string } {
  const selectors = [
    'input.el-input__inner[placeholder*="分"]',
    'input[placeholder*="分"]',
    'input[aria-label*="得分"]',
    'input.el-input__inner',
    'input[type="number"]',
    'input[name*="score" i]',
    'input[class*="score" i]',
  ]
  const isVisible = (element: HTMLElement): boolean => {
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
  }
  let input: HTMLInputElement | null = null
  let matchedSelector = ''
  let matchedCount = 0
  for (const selector of selectors) {
    const matches = Array.from(document.querySelectorAll(selector))
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element))
    if (matches.length > 0) {
      input = matches[0] || null
      matchedSelector = selector
      matchedCount = matches.length
      break
    }
  }

  if (!input) {
    const visibleInputs = Array.from(document.querySelectorAll('input'))
      .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && isVisible(element))
      .map(element => element.placeholder || element.getAttribute('aria-label') || element.className || element.type || 'input')
      .slice(0, 8)
      .join(', ')
    return {
      success: false,
      error: 'score_input_not_found',
      message: visibleInputs ? `未找到分数输入框；可见输入框: ${visibleInputs}` : '未找到可见分数输入框',
    }
  }
  if (dryRun) {
    return { success: true, message: `Dry-run passed: ${matchedSelector} resolved ${matchedCount} input(s)` }
  }

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
      ? `Score written to ${matchedSelector}`
      : `Score write did not stick for ${matchedSelector}; current input value is ${input.value}`,
    error: written ? undefined : 'score_write_not_applied',
  }
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
