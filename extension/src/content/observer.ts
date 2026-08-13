import { CONTENT_MESSAGE_TYPES } from './messages'

export function startImageObserver(getCurrentImageHash: () => string | null): () => void {
  let lastImageHash: string | null = null
  let imageObserver: MutationObserver | null = null

  const notifyImageChanged = (imageHash: string, imageSrc: string): void => {
    chrome.runtime.sendMessage({
      type: CONTENT_MESSAGE_TYPES.imageChanged,
      imageHash,
      imageSrc,
      timestamp: Date.now(),
    }).catch(() => {})
  }

  const checkImageChange = (): void => {
    const currentHash = getCurrentImageHash()
    if (currentHash && currentHash !== lastImageHash) {
      lastImageHash = currentHash
      const selectors = [
        'div[name="topicImg"] img',
        '#imgMain img',
        '#topicImgContent img',
        '.answer-card img',
        '.paper-image img',
        '.student-img img',
      ]
      for (const sel of selectors) {
        const img = document.querySelector(sel) as HTMLImageElement | null
        if (img?.src) {
          notifyImageChanged(currentHash, img.src)
          break
        }
      }
    }
  }

  if (imageObserver) return () => imageObserver?.disconnect()
  checkImageChange()
  imageObserver = new MutationObserver(() => {
    checkImageChange()
  })
  imageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  })
  return () => {
    imageObserver?.disconnect()
    imageObserver = null
  }
}
