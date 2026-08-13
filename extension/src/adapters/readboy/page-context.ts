import type { PageContextResult } from '../../adapter/contracts'
import {
  getBasePageContext,
  readNumericValue,
  readStringValue,
  readValueFromDom,
} from '../../content/page-context'

const PAPER_INDEX_KEYS = ['paperIndex', 'paper_index', 'paperNo', 'paper', 'index']
const QUESTION_ID_KEYS = ['questionId', 'question_id', 'topicId', 'topic_id', 'questionNo']

export function getReadboyPageContext(): PageContextResult {
  try {
    const url = new URL(window.location.href)
    const paperIndex = readNumericValue(url.searchParams, PAPER_INDEX_KEYS) ?? findPaperIndexInDom()
    const questionId = readStringValue(url.searchParams, QUESTION_ID_KEYS) ?? findQuestionIdInDom()

    return {
      ...getBasePageContext('readboy'),
      paperIndex,
      questionId,
    }
  } catch (error) {
    return {
      success: false,
      error: String(error),
    }
  }
}

function findPaperIndexInDom(): number | null {
  const raw = readValueFromDom(
    [
      '[data-paper-index]',
      '[data-paperindex]',
      '[data-question-index]',
      'input[name="paperIndex"]',
      'input[name="paper_index"]',
    ],
    ['data-paper-index', 'data-paperindex', 'data-question-index', 'value']
  )
  if (!raw) return findPaperIndexInText()
  const value = Number(raw)
  return Number.isNaN(value) ? findPaperIndexInText() : value
}

function findPaperIndexInText(): number | null {
  const text = document.body?.innerText || ''
  const match = text.match(/第\s*(\d+)\s*份题块/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isNaN(value) ? null : value
}

function findQuestionIdInDom(): string | null {
  return readValueFromDom(
    [
      '[data-question-id]',
      '[data-questionid]',
      '[data-topic-id]',
      '[data-question-no]',
      'input[name="questionId"]',
      'input[name="topicId"]',
    ],
    ['data-question-id', 'data-questionid', 'data-topic-id', 'data-question-no', 'value']
  )
}
