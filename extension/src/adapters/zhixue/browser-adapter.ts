import type {
  BrowserSubmitAdapter,
  SubmitBatchScoresRequest,
  SubmitScoreRequest,
  SubmitScoreResult,
  WriteScoreRequest,
  WriteScoreResult,
} from '../../adapter/contracts'
import type { DescriptorProbe } from '../core/descriptor'
import { CONTENT_MESSAGE_TYPES } from '../../content/messages'

interface RuntimeSubmitResponse {
  success?: boolean
  message?: string
  error?: string
  result?: {
    paperIndex: number
    score: number
    timestamp: number
    submitMethod?: string
    method?: string
    message: string
  }
}

interface DescriptorProbeResponse {
  success?: boolean
  probes?: DescriptorProbe[]
  error?: string
}

function isRejectedResult(data: RuntimeSubmitResponse | undefined): boolean {
  const method = data?.result?.submitMethod || data?.result?.method
  return method === 'rejected'
}

export class ZhixueBrowserAdapter implements BrowserSubmitAdapter {
  async writeScore(tabId: number, request: WriteScoreRequest): Promise<WriteScoreResult> {
    if (request.dryRun) {
      const probeResult = await this.probeTargets(tabId)
      const scoreInputReady = probeResult.probes.some(probe => probe.target === 'scoreInput' && probe.success)
      return {
        success: scoreInputReady,
        paperIndex: request.paperIndex,
        score: request.score,
        timestamp: Date.now(),
        method: 'dry-run',
        message: scoreInputReady
          ? 'Dry-run passed: score input target resolved without writing'
          : 'Dry-run failed: score input target was not resolved',
        error: scoreInputReady ? undefined : probeResult.error || 'score_input_not_found',
      }
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.scoreBridgeWrite,
        score: request.score,
        paperIndex: request.paperIndex,
      })
      const data = response as RuntimeSubmitResponse | undefined
      if (!data?.success || !data.result || isRejectedResult(data)) {
        return {
          success: false,
          paperIndex: request.paperIndex,
          score: request.score,
          timestamp: Date.now(),
          method: 'dom-write',
          message: data?.error || data?.message || '写分失败',
          error: data?.error || data?.message || '写分失败',
        }
      }

      return {
        success: true,
        paperIndex: data.result.paperIndex,
        score: data.result.score,
        timestamp: data.result.timestamp,
        method: data.result.submitMethod || data.result.method || 'dom-write',
        message: data.result.message,
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

  async submitScore(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult> {
    if (request.dryRun) {
      return this.dryRunSubmit(tabId, request.paperIndex, request.score)
    }

    const postResult = await this.tryPostSubmit(tabId, request)
    if (postResult.success) {
      return postResult
    }

    const domResult = await this.tryDomSubmit(tabId, request)
    if (domResult.success) {
      return domResult
    }

    return {
      success: false,
      paperIndex: request.paperIndex,
      score: request.score,
      message: domResult.message || postResult.message || '提交失败',
      details: domResult.details || postResult.details,
    }
  }

  async submitBatchScores(
    tabId: number,
    request: SubmitBatchScoresRequest
  ): Promise<SubmitScoreResult> {
    if (request.dryRun) {
      return this.dryRunSubmit(
        tabId,
        request.paperIndex,
        Object.values(request.batchScores).reduce((a, b) => a + b, 0),
        true
      )
    }

    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.scoreBridgeBatch,
        paperIndex: request.paperIndex,
        batchScores: request.batchScores,
        reason: request.reason || 'batch submit from sidepanel',
      })
      const data = response as RuntimeSubmitResponse | undefined
      if (!data?.success || !data.result || isRejectedResult(data)) {
        return {
          success: false,
          paperIndex: request.paperIndex,
          score: Object.values(request.batchScores).reduce((a, b) => a + b, 0),
          message: data?.result?.message || data?.error || data?.message || '批量提交失败',
        }
      }

      return {
        success: true,
        paperIndex: data.result.paperIndex,
        score: data.result.score,
        timestamp: data.result.timestamp,
        method: data.result.submitMethod || data.result.method || 'batch-dom-bridge',
        message: data.result.message,
      }
    } catch (error) {
      return {
        success: false,
        paperIndex: request.paperIndex,
        score: Object.values(request.batchScores).reduce((a, b) => a + b, 0),
        message: `批量提交异常: ${String(error)}`,
      }
    }
  }

  private async dryRunSubmit(
    tabId: number,
    paperIndex: number,
    score: number,
    batch = false
  ): Promise<SubmitScoreResult> {
    const probeResult = await this.probeTargets(tabId)
    const scoreTarget = batch ? 'batchScoreInputs' : 'scoreInput'
    const scoreInputReady = probeResult.probes.some(probe => probe.target === scoreTarget && probe.success)
    const submitButtonReady = probeResult.probes.some(probe => probe.target === 'submitButton' && probe.success)
    const success = scoreInputReady && submitButtonReady

    return {
      success,
      paperIndex,
      score,
      timestamp: Date.now(),
      method: 'dry-run',
      message: success
        ? 'Dry-run passed: score and submit targets resolved without committing'
        : 'Dry-run failed: required score or submit target was not resolved',
      details: success
        ? undefined
        : {
            error: probeResult.error || `missing ${scoreInputReady ? 'submitButton' : scoreTarget}`,
          },
    }
  }

  private async probeTargets(tabId: number): Promise<{ probes: DescriptorProbe[]; error?: string }> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.probeAdapterTargets,
        adapterId: 'zhixue',
      })
      const data = response as DescriptorProbeResponse | undefined
      return {
        probes: data?.probes || [],
        error: data?.error,
      }
    } catch (error) {
      return {
        probes: [],
        error: String(error),
      }
    }
  }

  private async tryPostSubmit(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.submitToZhixuePost,
        data: request,
      })
      const result = response as SubmitScoreResult | undefined
      if (!result?.success) {
        return {
          success: false,
          paperIndex: request.paperIndex,
          score: request.score,
          message: result?.message || 'POST 提交失败',
          details: result?.details,
        }
      }
      return result
    } catch (error) {
      return {
        success: false,
        paperIndex: request.paperIndex,
        score: request.score,
        message: `POST 提交异常: ${String(error)}`,
      }
    }
  }

  private async tryDomSubmit(tabId: number, request: SubmitScoreRequest): Promise<SubmitScoreResult> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: CONTENT_MESSAGE_TYPES.scoreBridgeExecute,
        score: request.score,
        paperIndex: request.paperIndex,
      })
      const data = response as RuntimeSubmitResponse | undefined
      if (!data?.success || !data.result || isRejectedResult(data)) {
        return {
          success: false,
          paperIndex: request.paperIndex,
          score: request.score,
          message: data?.result?.message || data?.error || data?.message || 'DOM 提交失败',
        }
      }

      return {
        success: true,
        paperIndex: data.result.paperIndex,
        score: data.result.score,
        timestamp: data.result.timestamp,
        method: data.result.submitMethod || data.result.method || 'dom-bridge',
        message: data.result.message,
      }
    } catch (error) {
      return {
        success: false,
        paperIndex: request.paperIndex,
        score: request.score,
        message: `DOM 提交异常: ${String(error)}`,
      }
    }
  }
}
