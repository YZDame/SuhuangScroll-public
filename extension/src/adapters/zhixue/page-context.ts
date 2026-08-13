import type { PageContextResult } from '../../adapter/contracts'
import {
  getBasePageContext,
  readNumericValue,
  readStringValue,
  readValueFromDom,
} from '../../content/page-context'

const PAPER_INDEX_KEYS = ['paperIndex', 'paper_index', 'paperNo', 'paper', 'index']
const QUESTION_ID_KEYS = ['questionId', 'question_id', 'topicId', 'topic_id']

export function getZhixuePageContext(): PageContextResult {
  try {
    const url = new URL(window.location.href)
    const paperIndex = readNumericValue(url.searchParams, PAPER_INDEX_KEYS) ?? findPaperIndexInDom()
    const questionId = readStringValue(url.searchParams, QUESTION_ID_KEYS) ?? findQuestionIdInDom()

    return {
      ...getBasePageContext('zhixue'),
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
      'input[name="paperIndex"]',
      'input[name="paper_index"]',
    ],
    ['data-paper-index', 'data-paperindex', 'value']
  )
  if (!raw) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : value
}

function findQuestionIdInDom(): string | null {
  return readValueFromDom(
    [
      '[data-question-id]',
      '[data-questionid]',
      '[data-topic-id]',
      'input[name="questionId"]',
      'input[name="topicId"]',
    ],
    ['data-question-id', 'data-questionid', 'data-topic-id', 'value']
  )
}
