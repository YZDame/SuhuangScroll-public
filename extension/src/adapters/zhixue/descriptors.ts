import type { TargetDescriptor } from '../core/descriptor'
import { ZHIXUE_ANSWER_IMAGE_DESCRIPTOR } from './capture'

export const ZHIXUE_SCORE_INPUT_SELECTORS = [
  'input[name="topicTxt"].topictxt_input',
  'input[name="topicTxt"]',
  'input.topictxt_input',
  'input.scores.fl',
  'input[placeholder*="满分"]',
  'input[placeholder*="分"]',
  'input[placeholder="分数"]',
  'input[type="number"]',
  'input[name="score"]',
  'input[name="finalScore"]',
  'input.score-input',
  '.score-input input',
  'input.el-input__inner',
  'input[placeholder*="score"]',
]

export const ZHIXUE_SUBMIT_BUTTON_SELECTORS = [
  'button.submit-btn',
  'button[name="submit"]',
  'button.primary',
  '.el-button--primary',
  '.submit-button',
  'button[type="submit"]',
]

export const ZHIXUE_QUESTION_LABEL_SELECTORS = [
  '.marking_left .title',
  '.title',
  '.topic-title',
  '.title_box',
  '.main_title',
]

export const ZHIXUE_SCORE_INPUT_DESCRIPTOR: TargetDescriptor = {
  target: 'scoreInput',
  locators: [
    ...ZHIXUE_SCORE_INPUT_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
    { type: 'placeholder', text: '满分', selector: 'input' },
    { type: 'placeholder', text: '分数', selector: 'input' },
    {
      type: 'nearestToAnchor',
      anchor: { type: 'text', text: '分数', selector: 'label, span, div' },
      target: { type: 'role', role: 'textbox' },
      maxDistancePx: 220,
    },
  ],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
  },
}

export const ZHIXUE_SUBMIT_BUTTON_DESCRIPTOR: TargetDescriptor = {
  target: 'submitButton',
  locators: [
    { type: 'role', role: 'button', name: '提交分数' },
    { type: 'role', role: 'button', name: '提交' },
    { type: 'role', role: 'button', name: '确认' },
    { type: 'role', role: 'button', name: '保存' },
    { type: 'text', text: '提交分数', selector: 'button, a, span, div' },
    { type: 'text', text: '提交', selector: 'button, a, span, div' },
    { type: 'text', text: '确认', selector: 'button, a, span, div' },
    { type: 'text', text: '保存', selector: 'button, a, span, div' },
    ...ZHIXUE_SUBMIT_BUTTON_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
  ],
  validation: {
    visible: true,
    expectedType: 'button',
  },
}

export const ZHIXUE_BATCH_SCORE_INPUTS_DESCRIPTOR: TargetDescriptor = {
  ...ZHIXUE_SCORE_INPUT_DESCRIPTOR,
  target: 'batchScoreInputs',
}

export const ZHIXUE_NEXT_ITEM_SIGNAL_DESCRIPTOR: TargetDescriptor = {
  target: 'nextItemSignal',
  locators: [
    { type: 'css', selector: '.next-paper' },
    { type: 'css', selector: 'a[href*="next"]' },
    { type: 'css', selector: '.auto-next' },
    { type: 'role', role: 'button', name: '下一份' },
    { type: 'role', role: 'button', name: '继续批改' },
  ],
  validation: {
    visible: true,
  },
}

export const ZHIXUE_QUESTION_LABEL_DESCRIPTOR: TargetDescriptor = {
  target: 'questionLabel',
  locators: ZHIXUE_QUESTION_LABEL_SELECTORS.map(selector => ({ type: 'css' as const, selector })),
  validation: {
    visible: true,
    expectedType: 'text',
  },
}

export const ZHIXUE_VALIDATION_DESCRIPTORS = [
  ZHIXUE_ANSWER_IMAGE_DESCRIPTOR,
  ZHIXUE_SCORE_INPUT_DESCRIPTOR,
  ZHIXUE_SUBMIT_BUTTON_DESCRIPTOR,
  ZHIXUE_BATCH_SCORE_INPUTS_DESCRIPTOR,
  ZHIXUE_NEXT_ITEM_SIGNAL_DESCRIPTOR,
  ZHIXUE_QUESTION_LABEL_DESCRIPTOR,
]
