import type { TargetDescriptor } from '../core/descriptor'

export const SYNTHETIC_ANSWER_IMAGE_DESCRIPTOR: TargetDescriptor = {
  target: 'answerImage',
  locators: [
    { type: 'css', selector: '#answer-image' },
    { type: 'canvas', selector: '#answer-image', minWidth: 640, minHeight: 360 },
  ],
  validation: {
    visible: true,
    expectedType: 'canvas',
    minImageWidth: 640,
    minImageHeight: 360,
  },
}

export const SYNTHETIC_SCORE_INPUT_DESCRIPTOR: TargetDescriptor = {
  target: 'scoreInput',
  locators: [
    { type: 'css', selector: '#score-input' },
    { type: 'css', selector: 'input[data-score-input]' },
  ],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
    scoreMax: 10,
  },
}

export const SYNTHETIC_SUBMIT_BUTTON_DESCRIPTOR: TargetDescriptor = {
  target: 'submitButton',
  locators: [
    { type: 'css', selector: '#submit-button' },
    { type: 'role', role: 'button', name: '提交合成结果', exact: true },
  ],
  validation: {
    visible: true,
    expectedType: 'button',
  },
}

export const SYNTHETIC_BATCH_SCORE_INPUTS_DESCRIPTOR: TargetDescriptor = {
  target: 'batchScoreInputs',
  locators: [{ type: 'css', selector: 'input[data-batch-score]' }],
  validation: {
    visible: true,
    expectedType: 'input',
    scoreMin: 0,
    scoreMax: 10,
  },
}

export const SYNTHETIC_NEXT_ITEM_SIGNAL_DESCRIPTOR: TargetDescriptor = {
  target: 'nextItemSignal',
  locators: [{ type: 'css', selector: '#next-item' }],
  validation: {
    visible: true,
    expectedType: 'button',
  },
}

export const SYNTHETIC_QUESTION_LABEL_DESCRIPTOR: TargetDescriptor = {
  target: 'questionLabel',
  locators: [{ type: 'css', selector: '#question-title' }],
  validation: {
    visible: true,
    expectedType: 'text',
  },
}

export const SYNTHETIC_VALIDATION_DESCRIPTORS = [
  SYNTHETIC_ANSWER_IMAGE_DESCRIPTOR,
  SYNTHETIC_SCORE_INPUT_DESCRIPTOR,
  SYNTHETIC_SUBMIT_BUTTON_DESCRIPTOR,
  SYNTHETIC_BATCH_SCORE_INPUTS_DESCRIPTOR,
  SYNTHETIC_NEXT_ITEM_SIGNAL_DESCRIPTOR,
  SYNTHETIC_QUESTION_LABEL_DESCRIPTOR,
]
