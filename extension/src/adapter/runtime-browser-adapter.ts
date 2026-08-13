import type {
  BrowserContextAdapter,
  BrowserPageAdapter,
  CaptureImageResult,
  PageContextResult,
  PageTransitionResult,
} from './contracts'
import { CONTENT_MESSAGE_TYPES } from '../content/messages'

export class RuntimeBrowserAdapter implements BrowserPageAdapter, BrowserContextAdapter {
  async ping(tabId: number): Promise<boolean> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: CONTENT_MESSAGE_TYPES.ping })
      return !!(response as { success?: boolean } | undefined)?.success
    } catch {
      return false
    }
  }

  async captureCurrentImage(
    tabId: number,
    selector?: string,
    adapterId?: string
  ): Promise<CaptureImageResult> {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: CONTENT_MESSAGE_TYPES.getPageImage,
      selector,
      adapterId,
    })
    return response as CaptureImageResult
  }

  async getPageContext(tabId: number, adapterId?: string): Promise<PageContextResult> {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: CONTENT_MESSAGE_TYPES.getPageContext,
      adapterId,
    })
    return response as PageContextResult
  }

  async observePageChange(
    tabId: number,
    timeoutMs = 10000,
    adapterId?: string
  ): Promise<PageTransitionResult> {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: CONTENT_MESSAGE_TYPES.observePageChange,
      timeoutMs,
      adapterId,
    })
    return response as PageTransitionResult
  }
}
