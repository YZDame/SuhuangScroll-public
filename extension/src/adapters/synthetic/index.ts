import { RuntimeBrowserAdapter } from '../../adapter/runtime-browser-adapter'
import type {
  SubmitBatchScoresRequest,
  SubmitScoreRequest,
  SubmitScoreResult,
  WriteScoreResult,
} from '../../adapter/contracts'
import { CONTENT_MESSAGE_TYPES } from '../../content/messages'
import type { DescriptorProbe } from '../core/descriptor'
import type { SiteAdapterHealthcheckResult, SiteGradingAdapter } from '../core/site-adapter'
import { isSyntheticFixtureUrl } from './match'

const runtimeAdapter = new RuntimeBrowserAdapter()

/**
 * A deterministic, local-only adapter used by release reviewers and smoke tests.
 * It never matches a real grading website and its submit action only updates the
 * synthetic fixture page.
 */
export const SyntheticReviewAdapter: SiteGradingAdapter = {
  id: 'synthetic',
  displayName: 'Synthetic review fixture',
  capabilities: {
    singleScore: true,
    batchScores: true,
    domSubmit: true,
    networkSubmit: false,
    observeNext: true,
    healthcheck: true,
  },
  match(url: URL): boolean {
    return isSyntheticFixtureUrl(url)
  },
  getPageContext(tabId) {
    return runtimeAdapter.getPageContext(tabId, this.id)
  },
  captureCurrentAnswer(tabId, selector) {
    return runtimeAdapter.captureCurrentImage(tabId, selector, this.id)
  },
  async writeScore(tabId, request) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.descriptorWriteScore,
        adapterId: this.id,
        paperIndex: request.paperIndex,
        score: request.score,
        dryRun: Boolean(request.dryRun),
      })
      return response as WriteScoreResult
    } catch (error) {
      return {
        success: false,
        paperIndex: request.paperIndex,
        score: request.score,
        timestamp: Date.now(),
        method: 'descriptor-write',
        message: `Synthetic fixture write failed: ${String(error)}`,
        error: String(error),
      }
    }
  },
  async submitScore(tabId, request) {
    return submitSyntheticScore(tabId, request, this.id)
  },
  async submitBatchScores(tabId, request) {
    return submitSyntheticBatchScores(tabId, request, this.id)
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
      scoreInput: hasProbe(probes, 'scoreInput'),
      submitButton: hasProbe(probes, 'submitButton'),
      batchScoreInputs: hasProbe(probes, 'batchScoreInputs'),
      nextItemSignal: hasProbe(probes, 'nextItemSignal'),
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
      message: validationPassed
        ? 'Synthetic review fixture validation passed'
        : `Synthetic review fixture validation failed: ${failures.join(', ')}`,
      error: context.error || (failures.length > 0 ? failures.join(', ') : undefined),
    }
  },
}

async function submitSyntheticScore(
  tabId: number,
  request: SubmitScoreRequest,
  adapterId: string,
): Promise<SubmitScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: submitSyntheticScoreInPage,
      args: [request.score, Boolean(request.dryRun)],
    })
    return normalizeSubmitResult(injection?.result, request, request.dryRun ? 'dry-run' : 'synthetic-submit')
  } catch (error) {
    return {
      success: false,
      paperIndex: request.paperIndex,
      score: request.score,
      timestamp: Date.now(),
      method: adapterId,
      message: `Synthetic fixture submit failed: ${String(error)}`,
      details: { error: String(error) },
    }
  }
}

async function submitSyntheticBatchScores(
  tabId: number,
  request: SubmitBatchScoresRequest,
  adapterId: string,
): Promise<SubmitScoreResult> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: submitSyntheticBatchInPage,
      args: [request.batchScores, Boolean(request.dryRun)],
    })
    return normalizeSubmitResult(injection?.result, request, request.dryRun ? 'dry-run' : 'synthetic-batch-submit')
  } catch (error) {
    return {
      success: false,
      paperIndex: request.paperIndex,
      timestamp: Date.now(),
      method: adapterId,
      message: `Synthetic fixture batch submit failed: ${String(error)}`,
      details: { error: String(error) },
    }
  }
}

function submitSyntheticScoreInPage(score: number, dryRun: boolean): { success: boolean; message?: string; error?: string } {
  const input = document.querySelector<HTMLInputElement>('#score-input')
  const button = document.querySelector<HTMLButtonElement>('#submit-button')
  if (!input || !button) return { success: false, error: 'synthetic_targets_not_found' }
  if (dryRun) return { success: true, message: 'Synthetic dry-run passed: score input and submit button resolved' }
  input.value = String(score)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  button.click()
  return { success: true, message: 'Synthetic score submitted to the local fixture page' }
}

function submitSyntheticBatchInPage(
  batchScores: Record<number, number>,
  dryRun: boolean,
): { success: boolean; message?: string; error?: string } {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-batch-score]'))
  const button = document.querySelector<HTMLButtonElement>('#submit-button')
  if (inputs.length === 0 || !button) return { success: false, error: 'synthetic_batch_targets_not_found' }
  if (dryRun) return { success: true, message: `Synthetic dry-run passed: ${inputs.length} batch inputs resolved` }
  for (const input of inputs) {
    const index = Number(input.dataset.batchScore)
    if (!Number.isFinite(index) || batchScores[index] === undefined) continue
    input.value = String(batchScores[index])
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  button.click()
  return { success: true, message: 'Synthetic batch scores submitted to the local fixture page' }
}

function normalizeSubmitResult(
  raw: unknown,
  request: SubmitScoreRequest | SubmitBatchScoresRequest,
  method: string,
): SubmitScoreResult {
  const result = raw as { success?: boolean; message?: string; error?: string } | undefined
  const success = Boolean(result?.success)
  return {
    success,
    paperIndex: request.paperIndex,
    score: 'score' in request ? request.score : undefined,
    timestamp: Date.now(),
    method,
    message: result?.message || (success ? 'Synthetic fixture submit completed' : 'Synthetic fixture submit failed'),
    details: success ? undefined : { error: result?.error || 'synthetic_submit_failed' },
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
