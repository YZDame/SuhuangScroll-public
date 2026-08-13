import type { CaptureImageResult } from '../../adapter/contracts'
import type { TargetDescriptor } from '../core/descriptor'
import {
  captureImageWithDescriptor,
  getImageHashWithSelectors,
} from '../../content/capture'

export const ZHIXUE_IMAGE_SELECTORS = [
  'img.enhance-definition-bright',
  'div[name="topicImg"] img',
  '#imgMain img',
  '#topicImgContent img',
  '.paper-img img',
  '.answer-sheet img',
  '.student-answer img',
  '.marking-image img',
  'img[src*="zhixue"]',
  'img[src*="answer"]',
  'img[src*="paper"]',
  '.question-content img',
  'canvas.answer-canvas',
]

export const ZHIXUE_ANSWER_IMAGE_DESCRIPTOR: TargetDescriptor = {
  target: 'answerImage',
  locators: [
    ...ZHIXUE_IMAGE_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
    { type: 'largestImage', minWidth: 200, minHeight: 50 },
    { type: 'canvas', selector: 'canvas.answer-canvas', minWidth: 200, minHeight: 50 },
    { type: 'canvas', minWidth: 200, minHeight: 50 },
  ],
  validation: {
    visible: true,
    minImageWidth: 200,
    minImageHeight: 50,
  },
}

export async function getZhixueQuestionImageBase64(selector?: string): Promise<CaptureImageResult> {
  return captureImageWithDescriptor({
    descriptor: selector
      ? {
          ...ZHIXUE_ANSWER_IMAGE_DESCRIPTOR,
          locators: [
            { type: 'css', selector },
            ...ZHIXUE_ANSWER_IMAGE_DESCRIPTOR.locators,
          ],
        }
      : ZHIXUE_ANSWER_IMAGE_DESCRIPTOR,
    notFoundMessage: '未找到智学网答题图片，请尝试重新刷新页面',
  })
}

export function getZhixueImageHash(): string | null {
  return getImageHashWithSelectors([
    'div[name="topicImg"] img',
    '#imgMain img',
    '#topicImgContent img',
  ])
}
