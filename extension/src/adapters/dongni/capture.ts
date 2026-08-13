import type { CaptureImageResult } from '../../adapter/contracts'
import type { TargetDescriptor } from '../core/descriptor'
import {
  captureImageWithDescriptor,
  getImageHashWithSelectors,
} from '../../content/capture'

export const DONGNI_IMAGE_SELECTORS = [
  '.selected img',
  '.active img',
  '.current img',
  '[class*="selected"] img',
  '[class*="active"] img',
  '[class*="current"] img',
  '[class*="paper"] img',
  '[class*="answer"] img',
  '[class*="read"] img',
  '[class*="score"] img',
  'img[src*="dongni"]',
  'img[src*="answer"]',
  'img[src*="paper"]',
  'img[src*=".jpg"]',
  'img[src*=".jpeg"]',
  'img[src*=".png"]',
]

export const DONGNI_ANSWER_IMAGE_DESCRIPTOR: TargetDescriptor = {
  target: 'answerImage',
  locators: [
    ...DONGNI_IMAGE_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
    { type: 'largestImage', minWidth: 180, minHeight: 80 },
    { type: 'canvas', minWidth: 180, minHeight: 80 },
  ],
  validation: {
    visible: true,
    minImageWidth: 180,
    minImageHeight: 80,
  },
}

export async function getDongniQuestionImageBase64(selector?: string): Promise<CaptureImageResult> {
  return captureImageWithDescriptor({
    descriptor: selector
      ? {
          ...DONGNI_ANSWER_IMAGE_DESCRIPTOR,
          locators: [
            { type: 'css', selector },
            ...DONGNI_ANSWER_IMAGE_DESCRIPTOR.locators,
          ],
        }
      : DONGNI_ANSWER_IMAGE_DESCRIPTOR,
    notFoundMessage: '未找到懂你教育答题图片，请尝试重新刷新页面',
  })
}

export function getDongniImageHash(): string | null {
  return getImageHashWithSelectors(DONGNI_IMAGE_SELECTORS)
}
