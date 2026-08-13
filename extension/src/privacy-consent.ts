/**
 * User-data consent shared by the Side Panel, service worker, and content
 * scripts. Page context and answer images are not processed until this flag is
 * explicitly accepted in the extension UI.
 */
export const DATA_CONSENT_STORAGE_KEY = 'suhuangDataConsentAccepted'

export async function readDataConsent(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(DATA_CONSENT_STORAGE_KEY)
    return stored[DATA_CONSENT_STORAGE_KEY] === true
  } catch {
    return false
  }
}
