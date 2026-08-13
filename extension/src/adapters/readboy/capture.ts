import type { CaptureImageResult } from '../../adapter/contracts'
import type { TargetDescriptor } from '../core/descriptor'
import {
  captureImageWithDescriptor,
  getImageHashWithSelectors,
} from '../../content/capture'

export const READBOY_IMAGE_SELECTORS = [
  '.answer-card img',
  '.paper-image img',
  '.paper-img',
  'img.paper-img',
  '.student-img img',
  '.qbm-paper img',
  '.qbm-content img',
  'img[src*="readboy"]',
  'img[src*="answersheet"]',
  'img[src*="answer"]',
  'img[src*="paper"]',
  'img[src*=".jpg"]',
  'img[src*=".jpeg"]',
  '.scan-img img',
  '.exam-img img',
  'img[alt*="答题"]',
  'img[alt*="试卷"]',
]

export const READBOY_ANSWER_IMAGE_DESCRIPTOR: TargetDescriptor = {
  target: 'answerImage',
  locators: [
    ...READBOY_IMAGE_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
    { type: 'largestImage', minWidth: 200, minHeight: 100 },
    { type: 'canvas', minWidth: 200, minHeight: 100 },
  ],
  validation: {
    visible: true,
    minImageWidth: 200,
    minImageHeight: 100,
  },
}

export async function getReadboyQuestionImageBase64(selector?: string): Promise<CaptureImageResult> {
  return captureImageWithDescriptor({
    descriptor: selector
      ? {
          ...READBOY_ANSWER_IMAGE_DESCRIPTOR,
          locators: [
            { type: 'css', selector },
            ...READBOY_ANSWER_IMAGE_DESCRIPTOR.locators,
          ],
        }
      : READBOY_ANSWER_IMAGE_DESCRIPTOR,
    notFoundMessage: '未找到 Readboy 答题图片，请尝试重新刷新页面',
  })
}

export function getReadboyImageHash(): string | null {
  return getImageHashWithSelectors([
    ...READBOY_IMAGE_SELECTORS,
  ])
}
