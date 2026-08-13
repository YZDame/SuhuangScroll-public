import type { TargetDescriptor } from '../core/descriptor'
import { READBOY_ANSWER_IMAGE_DESCRIPTOR } from './capture'

export const READBOY_SCORE_INPUT_DESCRIPTOR: TargetDescriptor = {
  target: 'scoreInput',
  locators: [
    { type: 'css', selector: 'input[data-score-point-input]' },
    { type: 'placeholder', text: '分', selector: 'input' },
    { type: 'placeholder', text: '得分', selector: 'input' },
    { type: 'css', selector: 'input[type="number"]' },
    { type: 'css', selector: 'input[name*="score" i]' },
    { type: 'css', selector: 'input[class*="score" i]' },
    { type: 'css', selector: 'input[class*="point" i]' },
    { type: 'css', selector: 'input[class*="mark" i]' },
    { type: 'css', selector: 'input.el-input__inner' },
    {
      type: 'nearestToAnchor',
      anchor: { type: 'text', text: '得分', selector: 'label, span, div' },
      target: { type: 'role', role: 'textbox' },
      maxDistancePx: 240,
    },
    {
      type: 'nearestToAnchor',
      anchor: { type: 'text', text: '分数', selector: 'label, span, div' },
      target: { type: 'role', role: 'textbox' },
      maxDistancePx: 240,
    },
  ],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
  },
}

export const READBOY_SUBMIT_BUTTON_DESCRIPTOR: TargetDescriptor = {
  target: 'submitButton',
  locators: [
    { type: 'role', role: 'button', name: '提交' },
    { type: 'role', role: 'button', name: '保存' },
    { type: 'role', role: 'button', name: '确认' },
    { type: 'role', role: 'button', name: '完成批改' },
    { type: 'text', text: '提交', selector: 'button, a, span, div' },
    { type: 'text', text: '保存', selector: 'button, a, span, div' },
    { type: 'text', text: '确认', selector: 'button, a, span, div' },
    { type: 'text', text: '完成批改', selector: 'button, a, span, div' },
    { type: 'css', selector: 'button[type="submit"]' },
    { type: 'css', selector: 'button[class*="submit" i]' },
    { type: 'css', selector: 'a[class*="submit" i]' },
    { type: 'css', selector: 'button[class*="save" i]' },
    { type: 'css', selector: 'a[class*="save" i]' },
  ],
  validation: {
    visible: true,
    expectedType: 'button',
  },
}

export const READBOY_BATCH_SCORE_INPUTS_DESCRIPTOR: TargetDescriptor = {
  target: 'batchScoreInputs',
  locators: [
    { type: 'css', selector: 'input[data-score-point-input]' },
    { type: 'css', selector: '.score-input input[type="number"]' },
    { type: 'css', selector: 'section#score-point-form input[type="number"]' },
  ],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
  },
}

export const READBOY_QUESTION_LABEL_DESCRIPTOR: TargetDescriptor = {
  target: 'questionLabel',
  locators: [
    { type: 'css', selector: '.question-title' },
    { type: 'css', selector: '.paper-title' },
    { type: 'css', selector: '.title' },
    { type: 'text', text: '题', selector: 'h1, h2, h3, .title, .question-title' },
  ],
  validation: {
    visible: true,
    expectedType: 'text',
  },
}

export const READBOY_NEXT_ITEM_SIGNAL_DESCRIPTOR: TargetDescriptor = {
  target: 'nextItemSignal',
  locators: [
    { type: 'css', selector: '.next-paper' },
    { type: 'css', selector: '.next-question' },
    { type: 'css', selector: 'a[href*="next"]' },
    { type: 'role', role: 'button', name: '下一份' },
    { type: 'role', role: 'button', name: '下一题' },
  ],
  validation: {
    visible: true,
  },
}

export const READBOY_VALIDATION_DESCRIPTORS = [
  READBOY_ANSWER_IMAGE_DESCRIPTOR,
  READBOY_SCORE_INPUT_DESCRIPTOR,
  READBOY_SUBMIT_BUTTON_DESCRIPTOR,
  READBOY_BATCH_SCORE_INPUTS_DESCRIPTOR,
  READBOY_QUESTION_LABEL_DESCRIPTOR,
  READBOY_NEXT_ITEM_SIGNAL_DESCRIPTOR,
]
