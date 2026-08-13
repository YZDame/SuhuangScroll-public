import type { PageContextResult } from '../adapter/contracts'

export function getCurrentPageContext(): PageContextResult {
  try {
    const url = new URL(window.location.href)
    const site = detectSite(url.hostname)

    return {
      ...getBasePageContext(site),
      site,
    }
  } catch (error) {
    return {
      success: false,
      error: String(error),
    }
  }
}

export function getSyntheticPageContext(): PageContextResult {
  try {
    const url = new URL(window.location.href)
    const paperIndex = readNumericValue(url.searchParams, ['paperIndex', 'index'])
      ?? readNumericValueFromFixtureDom()
    const questionId = readStringValue(url.searchParams, ['questionId'])
      ?? readStringValueFromFixtureDom()

    return {
      ...getBasePageContext('synthetic'),
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

function readNumericValueFromFixtureDom(): number | null {
  const raw = readValueFromDom(['[data-paper-index]'], ['data-paper-index'])
  if (!raw) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : value
}

function readStringValueFromFixtureDom(): string | null {
  return readValueFromDom(['[data-question-id]'], ['data-question-id'])
}

export function getBasePageContext(site: string): PageContextResult {
  return {
    success: true,
    pageUrl: window.location.href,
    pageTitle: document.title || '',
    site,
  }
}

function detectSite(hostname: string): string {
  void hostname
  return 'unknown'
}

export function readNumericValue(searchParams: URLSearchParams, keys: string[]): number | null {
  for (const key of keys) {
    const raw = searchParams.get(key)
    if (!raw) continue
    const value = Number(raw)
    if (!Number.isNaN(value)) {
      return value
    }
  }
  return null
}

export function readStringValue(searchParams: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = searchParams.get(key)
    if (value) return value
  }
  return null
}

export function readValueFromDom(selectors: string[], attributes: string[]): string | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    const raw = readCandidateValue(element, attributes)
    if (raw) return raw
  }

  return null
}

function readCandidateValue(element: Element | null, attributes: string[]): string | null {
  if (!element) return null
  for (const attr of attributes) {
    const value = element.getAttribute(attr)
    if (value) return value
  }
  return null
}
