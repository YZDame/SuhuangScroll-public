export const SYNTHETIC_FIXTURE_PATH = '/fixture/synthetic-grading.html'

export function isSyntheticFixtureUrl(value: URL | string): boolean {
  const url = value instanceof URL ? value : safeUrl(value)
  if (!url) return false
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  return localHost && url.pathname.replace(/\/+$/, '') === SYNTHETIC_FIXTURE_PATH
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}
