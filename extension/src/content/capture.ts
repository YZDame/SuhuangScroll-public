import type { CaptureImageResult } from '../adapter/contracts'
import {
  resolveDescriptor,
  type TargetDescriptor,
} from '../adapters/core/descriptor'

export async function getCurrentQuestionImageBase64(selector?: string): Promise<CaptureImageResult> {
  return captureImageWithSelectors({
    selector,
    selectors: [],
    notFoundMessage: '未找到答题图片，请尝试重新刷新页面',
  })
}

export async function captureImageWithSelectors(options: {
  selector?: string
  selectors: string[]
  notFoundMessage: string
}): Promise<CaptureImageResult> {
  const descriptor: TargetDescriptor = {
    target: 'answerImage',
    locators: [
      ...(options.selector ? [{ type: 'css' as const, selector: options.selector }] : []),
      ...options.selectors.map(selector => ({ type: 'css' as const, selector })),
      { type: 'largestImage', minWidth: 200, minHeight: 100 },
      { type: 'canvas', minWidth: 200, minHeight: 100 },
    ],
    validation: {
      visible: true,
    },
  }

  return captureImageWithDescriptor({
    descriptor,
    notFoundMessage: options.notFoundMessage,
  })
}

export async function captureImageWithDescriptor(options: {
  descriptor: TargetDescriptor
  notFoundMessage: string
}): Promise<CaptureImageResult> {
  try {
    const resolution = resolveDescriptor(options.descriptor)
    if (!resolution.success) {
      return {
        success: false,
        error: `${options.notFoundMessage}: ${resolution.error}`,
      }
    }

    return await extractImageFromElement(
      resolution.element,
      descriptorSource(resolution.metadata.locator)
    )
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function getCurrentImageHash(): string | null {
  return getImageHashWithSelectors([])
}

export function getImageHashWithSelectors(selectors: string[]): string | null {
  for (const sel of selectors) {
    const img = document.querySelector(sel) as HTMLImageElement | null
    if (img?.src) {
      return simpleHash(img.src)
    }
  }
  return null
}

export async function getCurrentImageFingerprint(selector?: string): Promise<string | null> {
  const capture = await getCurrentQuestionImageBase64(selector)
  if (!capture.success || !capture.imageData) {
    return null
  }

  const width = capture.width || 0
  const height = capture.height || 0
  return simpleHash(`${width}x${height}:${capture.imageData}`)
}

async function extractImageFromElement(element: Element, source: string): Promise<CaptureImageResult> {
  try {
    if (element instanceof HTMLCanvasElement) {
      return extractFromCanvas(element, source)
    }
    if (element instanceof HTMLImageElement) {
      return await extractFromImg(element, source)
    }
    return { success: false, error: '不支持的元素类型' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

function extractFromCanvas(canvas: HTMLCanvasElement, source: string): CaptureImageResult {
  try {
    const imageData = canvas.toDataURL('image/png')
    return {
      success: true,
      imageData,
      width: canvas.width,
      height: canvas.height,
      source: `canvas:${source}`,
    }
  } catch (error) {
    return {
      success: false,
      error: `Canvas 导出失败: ${String(error)}`,
    }
  }
}

async function extractFromImg(img: HTMLImageElement, source: string): Promise<CaptureImageResult> {
  const src = img.src
  if (src.startsWith('data:')) {
    return {
      success: true,
      imageData: src,
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: `img-base64:${source}`,
    }
  }

  try {
    const response = await fetch(src, {
      mode: 'cors',
      cache: 'no-cache',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const blob = await response.blob()
    const imageData = await blobToBase64(blob)
    const dimensions = await getImageDimensions(imageData)

    return {
      success: true,
      imageData,
      width: dimensions.width,
      height: dimensions.height,
      source: `img-fetch:${source}`,
    }
  } catch {
    if (img.complete && img.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          return {
            success: true,
            imageData: canvas.toDataURL('image/png'),
            width: img.naturalWidth,
            height: img.naturalHeight,
            source: `img-canvas:${source}`,
          }
        }
      } catch {
        // continue to final error
      }
    }

    return {
      success: false,
      error: '图片获取失败，可能是跨域、签名失效或网络异常',
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = base64
  })
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash &= hash
  }
  return Math.abs(hash).toString(36)
}

function descriptorSource(locator: TargetDescriptor['locators'][number] | undefined): string {
  if (!locator) return 'descriptor'
  if (locator.type === 'css') return locator.selector
  if (locator.type === 'largestImage') return 'largest-image'
  if (locator.type === 'canvas') return 'canvas'
  return `descriptor:${locator.type}`
}
