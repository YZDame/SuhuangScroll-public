import { RuntimeBrowserAdapter } from '../../adapter/runtime-browser-adapter'
import { CONTENT_MESSAGE_TYPES } from '../../content/messages'
import type { DescriptorProbe } from '../core/descriptor'
import type { SiteAdapterHealthcheckResult, SiteGradingAdapter } from '../core/site-adapter'
import { ZhixueBrowserAdapter } from './browser-adapter'

const runtimeAdapter = new RuntimeBrowserAdapter()
const submitAdapter = new ZhixueBrowserAdapter()

export const ZhixueAdapter: SiteGradingAdapter = {
  id: 'zhixue',
  displayName: 'Zhixue',
  capabilities: {
    singleScore: true,
    batchScores: true,
    domSubmit: true,
    networkSubmit: true,
    observeNext: true,
    healthcheck: true,
  },
  match(url: URL): boolean {
    return url.hostname.includes('zhixue.com')
  },
  getPageContext(tabId) {
    return runtimeAdapter.getPageContext(tabId, this.id)
  },
  captureCurrentAnswer(tabId, selector) {
    return runtimeAdapter.captureCurrentImage(tabId, selector, this.id)
  },
  writeScore(tabId, request) {
    return submitAdapter.writeScore(tabId, request)
  },
  submitScore(tabId, request) {
    return submitAdapter.submitScore(tabId, request)
  },
  submitBatchScores(tabId, request) {
    return submitAdapter.submitBatchScores(tabId, request)
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
      message: validationPassed ? 'Zhixue adapter validation passed' : `Zhixue adapter validation failed: ${failures.join(', ')}`,
      error: context.error || (failures.length > 0 ? failures.join(', ') : undefined),
    }
  },
}

export { ZhixueBrowserAdapter } from './browser-adapter'

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
