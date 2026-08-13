import type {
  SiteAdapterResolution,
  SiteGradingAdapter,
} from './site-adapter'

const adapters = new Map<string, SiteGradingAdapter>()

export function registerAdapter(adapter: SiteGradingAdapter): SiteAdapterResolution {
  const existing = adapters.get(adapter.id)
  if (existing && existing !== adapter) {
    return {
      success: false,
      error: {
        code: 'duplicate_adapter',
        message: `Adapter already registered: ${adapter.id}`,
        adapterId: adapter.id,
      },
    }
  }

  adapters.set(adapter.id, adapter)
  return { success: true, adapter }
}

export function resolveAdapterByUrl(url: URL | string): SiteAdapterResolution {
  const parsedUrl = parseUrl(url)
  if (!parsedUrl) {
    return {
      success: false,
      error: {
        code: 'invalid_url',
        message: `Invalid adapter URL: ${String(url)}`,
        url: String(url),
      },
    }
  }

  for (const adapter of adapters.values()) {
    if (adapter.match(parsedUrl)) {
      return { success: true, adapter }
    }
  }

  return {
    success: false,
    error: {
      code: 'adapter_not_found',
      message: `No grading adapter matched URL: ${parsedUrl.href}`,
      url: parsedUrl.href,
    },
  }
}

export function resolveAdapterById(id: string): SiteAdapterResolution {
  const adapter = adapters.get(id)
  if (adapter) {
    return { success: true, adapter }
  }

  return {
    success: false,
    error: {
      code: 'adapter_id_not_found',
      message: `No grading adapter registered with id: ${id}`,
      adapterId: id,
    },
  }
}

export function getRegisteredAdapters(): SiteGradingAdapter[] {
  return Array.from(adapters.values())
}

export function clearRegisteredAdaptersForTests(): void {
  adapters.clear()
}

function parseUrl(url: URL | string): URL | null {
  if (url instanceof URL) {
    return url
  }

  try {
    return new URL(url)
  } catch {
    return null
  }
}
