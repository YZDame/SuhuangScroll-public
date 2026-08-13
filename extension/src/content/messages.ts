export const CONTENT_MESSAGE_TYPES = {
  ping: 'PING',
  getPageImage: 'GET_PAGE_IMAGE',
  getPageContext: 'GET_PAGE_CONTEXT',
  imageChanged: 'IMAGE_CHANGED',
  scoreBridgeWrite: 'SCORE_BRIDGE_WRITE',
  submitToZhixuePost: 'SUBMIT_TO_ZHIXUE_POST',
  scoreBridgeExecute: 'SCORE_BRIDGE_EXECUTE',
  scoreBridgeReset: 'SCORE_BRIDGE_RESET',
  scoreBridgeUndo: 'SCORE_BRIDGE_UNDO',
  scoreBridgeStatus: 'SCORE_BRIDGE_STATUS',
  scoreBridgeEnterReview: 'SCORE_BRIDGE_ENTER_REVIEW',
  submitBatchPost: 'SUBMIT_BATCH_POST',
  scoreBridgeBatch: 'SCORE_BRIDGE_BATCH',
  descriptorWriteScore: 'DESCRIPTOR_WRITE_SCORE',
  contentScriptReady: 'CONTENT_SCRIPT_READY',
  agentBrowserAction: 'AGENT_BROWSER_ACTION',
  observePageChange: 'OBSERVE_PAGE_CHANGE',
  automationHeartbeat: 'AUTOMATION_HEARTBEAT',
  probeAdapterTargets: 'PROBE_ADAPTER_TARGETS',
} as const

export type ContentMessageType =
  typeof CONTENT_MESSAGE_TYPES[keyof typeof CONTENT_MESSAGE_TYPES]
