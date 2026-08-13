import type { TargetDescriptor } from '../core/descriptor'
import { DONGNI_ANSWER_IMAGE_DESCRIPTOR } from './capture'

export const DONGNI_SCORE_INPUT_DESCRIPTOR: TargetDescriptor = {
  target: 'scoreInput',
  locators: [
    { type: 'placeholder', text: '分', selector: 'input' },
    { type: 'css', selector: 'input[type="number"]' },
    { type: 'css', selector: 'input[name*="score" i]' },
    { type: 'css', selector: 'input[class*="score" i]' },
    { type: 'css', selector: 'input[class*="el-input__inner"]' },
    {
      type: 'nearestToAnchor',
      anchor: { type: 'text', text: '全部分数', selector: 'label, span, div' },
      target: { type: 'role', role: 'textbox' },
      maxDistancePx: 260,
    },
    {
      type: 'nearestToAnchor',
      anchor: { type: 'text', text: '打分间隔', selector: 'label, span, div' },
      target: { type: 'role', role: 'textbox' },
      maxDistancePx: 260,
    },
  ],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
  },
}

export const DONGNI_SUBMIT_BUTTON_DESCRIPTOR: TargetDescriptor = {
  target: 'submitButton',
  locators: [
    { type: 'role', role: 'button', name: '提交' },
    { type: 'text', text: '提交', selector: 'button, a, span, div' },
    { type: 'css', selector: 'button[type="submit"]' },
    { type: 'css', selector: 'button[class*="submit" i]' },
    { type: 'css', selector: 'a[class*="submit" i]' },
  ],
  validation: {
    visible: true,
    expectedType: 'button',
  },
}

export const DONGNI_BATCH_SCORE_INPUTS_DESCRIPTOR: TargetDescriptor = {
  ...DONGNI_SCORE_INPUT_DESCRIPTOR,
  target: 'batchScoreInputs',
}

export const DONGNI_NEXT_ITEM_SIGNAL_DESCRIPTOR: TargetDescriptor = {
  target: 'nextItemSignal',
  locators: [
    { type: 'role', role: 'button', name: '下一份' },
    { type: 'text', text: '下一份', selector: 'button, a, span, div' },
    { type: 'css', selector: 'button[class*="next" i]' },
    { type: 'css', selector: 'a[class*="next" i]' },
  ],
  validation: {
    visible: true,
  },
}

export const DONGNI_QUESTION_LABEL_DESCRIPTOR: TargetDescriptor = {
  target: 'questionLabel',
  locators: [
    { type: 'text', text: '题块', selector: 'label, span, div' },
    { type: 'text', text: '题目总量', selector: 'label, span, div' },
    { type: 'css', selector: '[class*="question" i]' },
    { type: 'css', selector: '[class*="title" i]' },
  ],
  validation: {
    visible: true,
    expectedType: 'text',
  },
}

export const DONGNI_VALIDATION_DESCRIPTORS = [
  DONGNI_ANSWER_IMAGE_DESCRIPTOR,
  DONGNI_SCORE_INPUT_DESCRIPTOR,
  DONGNI_SUBMIT_BUTTON_DESCRIPTOR,
  DONGNI_BATCH_SCORE_INPUTS_DESCRIPTOR,
  DONGNI_NEXT_ITEM_SIGNAL_DESCRIPTOR,
  DONGNI_QUESTION_LABEL_DESCRIPTOR,
]
