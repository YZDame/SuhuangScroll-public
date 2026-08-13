export type DescriptorTarget =
  | 'answerImage'
  | 'scoreInput'
  | 'submitButton'
  | 'batchScoreInputs'
  | 'nextItemSignal'
  | 'questionLabel'

export type ExpectedElementType =
  | 'any'
  | 'img'
  | 'canvas'
  | 'input'
  | 'button'
  | 'text'

export type LocatorStrategy =
  | {
      type: 'css'
      selector: string
    }
  | {
      type: 'text'
      text: string
      selector?: string
      exact?: boolean
    }
  | {
      type: 'placeholder'
      text: string
      selector?: string
      exact?: boolean
    }
  | {
      type: 'role'
      role: string
      name?: string
      exact?: boolean
    }
  | {
      type: 'nearestToAnchor'
      anchor: LocatorStrategy
      target: LocatorStrategy
      maxDistancePx?: number
    }
  | {
      type: 'largestImage'
      selector?: string
      minWidth?: number
      minHeight?: number
    }
  | {
      type: 'canvas'
      selector?: string
      minWidth?: number
      minHeight?: number
    }

export interface DescriptorValidation {
  visible?: boolean
  expectedType?: ExpectedElementType
  minImageWidth?: number
  minImageHeight?: number
  scoreMin?: number
  scoreMax?: number
  disallowDuplicateCandidates?: boolean
}

export interface TargetDescriptor {
  target: DescriptorTarget
  locators: LocatorStrategy[]
  validation?: DescriptorValidation
}

export interface DescriptorDebugMetadata {
  target: DescriptorTarget
  locator?: LocatorStrategy
  locatorIndex?: number
  candidateCount: number
  duplicateCandidates: boolean
  failures: string[]
}

export type DescriptorResolution =
  | {
      success: true
      element: HTMLElement | HTMLImageElement | HTMLCanvasElement
      metadata: DescriptorDebugMetadata
    }
  | {
      success: false
      metadata: DescriptorDebugMetadata
      error: string
    }

export interface DescriptorProbe {
  success: boolean
  target: DescriptorTarget
  element?: string
  metadata: DescriptorDebugMetadata
  error?: string
}

export function resolveDescriptor(
  descriptor: TargetDescriptor,
  context: Document | Element = document
): DescriptorResolution {
  const failures: string[] = []

  for (const [locatorIndex, locator] of descriptor.locators.entries()) {
    const candidates = findCandidates(locator, context)
    const duplicateCandidates = candidates.length > 1
    const metadata: DescriptorDebugMetadata = {
      target: descriptor.target,
      locator,
      locatorIndex,
      candidateCount: candidates.length,
      duplicateCandidates,
      failures,
    }

    if (
      descriptor.validation?.disallowDuplicateCandidates &&
      duplicateCandidates
    ) {
      failures.push(`locator ${locatorIndex} produced ${candidates.length} candidates`)
      continue
    }

    for (const candidate of candidates) {
      const validation = validateCandidate(candidate, descriptor.validation)
      if (validation.success) {
        return {
          success: true,
          element: candidate,
          metadata: {
            ...metadata,
            failures: [...failures],
          },
        }
      }
      failures.push(validation.error)
    }
  }

  return {
    success: false,
    metadata: {
      target: descriptor.target,
      candidateCount: 0,
      duplicateCandidates: false,
      failures,
    },
    error: failures[0] || `No element resolved for ${descriptor.target}`,
  }
}

export function probeDescriptor(
  descriptor: TargetDescriptor,
  context: Document | Element = document
): DescriptorProbe {
  const resolution = resolveDescriptor(descriptor, context)
  if (!resolution.success) {
    return {
      success: false,
      target: descriptor.target,
      metadata: resolution.metadata,
      error: resolution.error,
    }
  }

  return {
    success: true,
    target: descriptor.target,
    element: describeElement(resolution.element),
    metadata: resolution.metadata,
  }
}

export function probeDescriptors(
  descriptors: TargetDescriptor[],
  context: Document | Element = document
): DescriptorProbe[] {
  return descriptors.map(descriptor => probeDescriptor(descriptor, context))
}

function findCandidates(
  locator: LocatorStrategy,
  context: Document | Element
): HTMLElement[] {
  switch (locator.type) {
    case 'css':
      return queryElements(context, locator.selector)

    case 'text':
      return queryElements(context, locator.selector || 'button, a, label, span, div')
        .filter(element => textMatches(element.textContent || '', locator.text, locator.exact))

    case 'placeholder':
      return queryElements(context, locator.selector || 'input, textarea')
        .filter(element => {
          const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? element.placeholder
            : ''
          return textMatches(placeholder, locator.text, locator.exact)
        })

    case 'role':
      return findByRole(locator, context)

    case 'nearestToAnchor':
      return findNearestToAnchor(locator, context)

    case 'largestImage':
      return findLargestImage(locator, context)

    case 'canvas':
      return findCanvas(locator, context)

    default:
      return []
  }
}

function queryElements(context: Document | Element, selector: string): HTMLElement[] {
  try {
    return Array.from(context.querySelectorAll(selector))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
  } catch {
    return []
  }
}

function findByRole(
  locator: Extract<LocatorStrategy, { type: 'role' }>,
  context: Document | Element
): HTMLElement[] {
  const explicit = queryElements(context, `[role="${cssEscape(locator.role)}"]`)
  const implicit = implicitRoleSelector(locator.role)
    ? queryElements(context, implicitRoleSelector(locator.role) || '')
    : []
  const seen = new Set<HTMLElement>()

  return [...explicit, ...implicit]
    .filter(element => {
      if (seen.has(element)) return false
      seen.add(element)
      if (!locator.name) return true
      return textMatches(getAccessibleName(element), locator.name, locator.exact)
    })
}

function findNearestToAnchor(
  locator: Extract<LocatorStrategy, { type: 'nearestToAnchor' }>,
  context: Document | Element
): HTMLElement[] {
  const anchors = findCandidates(locator.anchor, context).filter(isElementVisible)
  const targets = findCandidates(locator.target, context).filter(isElementVisible)
  if (anchors.length === 0 || targets.length === 0) {
    return []
  }

  const ranked = targets
    .map(target => ({
      target,
      distance: Math.min(...anchors.map(anchor => distanceBetween(anchor, target))),
    }))
    .filter(item => !locator.maxDistancePx || item.distance <= locator.maxDistancePx)
    .sort((a, b) => a.distance - b.distance)

  return ranked.map(item => item.target)
}

function findLargestImage(
  locator: Extract<LocatorStrategy, { type: 'largestImage' }>,
  context: Document | Element
): HTMLElement[] {
  const minWidth = locator.minWidth ?? 200
  const minHeight = locator.minHeight ?? 100
  return queryElements(context, locator.selector || 'img')
    .filter((element): element is HTMLImageElement => element instanceof HTMLImageElement)
    .filter(img => img.naturalWidth >= minWidth && img.naturalHeight >= minHeight)
    .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))
}

function findCanvas(
  locator: Extract<LocatorStrategy, { type: 'canvas' }>,
  context: Document | Element
): HTMLElement[] {
  const minWidth = locator.minWidth ?? 200
  const minHeight = locator.minHeight ?? 100
  return queryElements(context, locator.selector || 'canvas')
    .filter((element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement)
    .filter(canvas => canvas.width >= minWidth && canvas.height >= minHeight)
}

function validateCandidate(
  element: HTMLElement,
  validation: DescriptorValidation = {}
): { success: true } | { success: false; error: string } {
  if (validation.visible !== false && !isElementVisible(element)) {
    return { success: false, error: `${describeElement(element)} is not visible` }
  }

  if (validation.expectedType && validation.expectedType !== 'any') {
    const typeOk = matchesExpectedType(element, validation.expectedType)
    if (!typeOk) {
      return {
        success: false,
        error: `${describeElement(element)} is not a ${validation.expectedType}`,
      }
    }
  }

  if (
    (validation.minImageWidth || validation.minImageHeight) &&
    (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement)
  ) {
    const width = element instanceof HTMLImageElement ? element.naturalWidth : element.width
    const height = element instanceof HTMLImageElement ? element.naturalHeight : element.height
    if (validation.minImageWidth && width < validation.minImageWidth) {
      return { success: false, error: `${describeElement(element)} width ${width} is below ${validation.minImageWidth}` }
    }
    if (validation.minImageHeight && height < validation.minImageHeight) {
      return { success: false, error: `${describeElement(element)} height ${height} is below ${validation.minImageHeight}` }
    }
  }

  if (
    (typeof validation.scoreMin === 'number' || typeof validation.scoreMax === 'number') &&
    element instanceof HTMLInputElement
  ) {
    const min = numberAttribute(element, 'min')
    const max = numberAttribute(element, 'max')
    const lowerBound = validation.scoreMin ?? Number.NEGATIVE_INFINITY
    const upperBound = validation.scoreMax ?? Number.POSITIVE_INFINITY
    if (typeof min === 'number' && min < lowerBound) {
      return { success: false, error: `${describeElement(element)} min ${min} is below ${lowerBound}` }
    }
    if (typeof max === 'number' && max > upperBound) {
      return { success: false, error: `${describeElement(element)} max ${max} is above ${upperBound}` }
    }
  }

  return { success: true }
}

export function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetParent !== null
}

function matchesExpectedType(element: HTMLElement, expectedType: ExpectedElementType): boolean {
  if (expectedType === 'img') return element instanceof HTMLImageElement
  if (expectedType === 'canvas') return element instanceof HTMLCanvasElement
  if (expectedType === 'input') return element instanceof HTMLInputElement
  if (expectedType === 'button') {
    return element instanceof HTMLButtonElement ||
      (element instanceof HTMLInputElement && /button|submit/.test(element.type)) ||
      element.getAttribute('role') === 'button'
  }
  if (expectedType === 'text') return Boolean((element.textContent || '').trim())
  return true
}

function textMatches(value: string, expected: string, exact = false): boolean {
  const normalizedValue = value.trim().toLowerCase()
  const normalizedExpected = expected.trim().toLowerCase()
  return exact
    ? normalizedValue === normalizedExpected
    : normalizedValue.includes(normalizedExpected)
}

function getAccessibleName(element: HTMLElement): string {
  return [
    element.getAttribute('aria-label') || '',
    element.getAttribute('title') || '',
    element.textContent || '',
    element instanceof HTMLInputElement ? element.value : '',
  ].join(' ').trim()
}

function implicitRoleSelector(role: string): string | null {
  if (role === 'button') return 'button, input[type="button"], input[type="submit"], a[role="button"]'
  if (role === 'textbox') return 'input:not([type]), input[type="text"], input[type="number"], textarea'
  if (role === 'img') return 'img, canvas[role="img"]'
  return null
}

function distanceBetween(a: HTMLElement, b: HTMLElement): number {
  const aRect = a.getBoundingClientRect()
  const bRect = b.getBoundingClientRect()
  const ax = aRect.left + aRect.width / 2
  const ay = aRect.top + aRect.height / 2
  const bx = bRect.left + bRect.width / 2
  const by = bRect.top + bRect.height / 2
  return Math.hypot(ax - bx, ay - by)
}

function numberAttribute(element: HTMLElement, name: string): number | null {
  const raw = element.getAttribute(name)
  if (raw === null || raw.trim() === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function cssEscape(value: string): string {
  if ('CSS' in window && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

function describeElement(element: HTMLElement): string {
  const id = element.id ? `#${element.id}` : ''
  const className = typeof element.className === 'string' && element.className.trim()
    ? `.${element.className.trim().split(/\s+/).join('.')}`
    : ''
  return `${element.tagName.toLowerCase()}${id}${className}`
}
