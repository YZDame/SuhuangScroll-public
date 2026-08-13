import type {
  AutomationStatusResponse,
  ResourcesResponse,
  SpecsResponse,
} from './generated/backend-contracts'
import { DATA_CONSENT_STORAGE_KEY, readDataConsent } from './privacy-consent'

const styles = `
  :root {
    color-scheme: light dark;
    font-family: "Geist", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --bg: #f7f7f8;
    --fg: #18181b;
    --muted: #71717a;
    --panel: #ffffff;
    --line: #e4e4e7;
    --button: #18181b;
    --button-fg: #ffffff;
    --subtle: #f4f4f5;
    --subtle-strong: #ececef;
    --inverse: #18181b;
    --inverse-fg: #ffffff;
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    background: var(--bg);
    color: var(--fg);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0b0c;
      --fg: #fafafa;
      --muted: #a1a1aa;
      --panel: #18181b;
      --line: #27272a;
      --button: #fafafa;
      --button-fg: #18181b;
      --subtle: #202024;
      --subtle-strong: #2a2a2f;
      --inverse: #fafafa;
      --inverse-fg: #18181b;
    }
  }

  * { box-sizing: border-box; }
  html { background: var(--bg); }

  body {
    margin: 0;
    min-width: 360px;
    background: var(--bg);
    transition: background 220ms var(--ease), color 220ms var(--ease);
  }

  /* ── Layout ─────────────────────────────────────────────────────── */

  .panel {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 18px;
    animation: panel-in 240ms var(--ease) both;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .brand-name {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* 主内容区:弹性拉伸,底部 footer 贴底 */
  .grading-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── 状态指示 ──────────────────────────────────────────────────── */

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    background: var(--subtle);
    border-radius: 999px;
    font-size: 12px;
    color: var(--muted);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #d92d20;
    box-shadow: 0 0 0 3px rgba(217,45,32,0.14);
    flex-shrink: 0;
    transition: background 260ms, box-shadow 260ms;
  }

  .status-dot.connected {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22,163,74,0.14);
  }

  .privacy-notice {
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--subtle);
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.55;
  }

  .privacy-notice[hidden] { display: none; }
  .privacy-notice-title { margin: 0 0 4px; font-weight: 600; }
  .privacy-notice-copy { margin: 0; color: var(--muted); }
  .privacy-consent-label {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 8px;
    color: var(--fg);
    cursor: pointer;
  }
  .privacy-consent-label input {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    margin: 2px 0 0;
    padding: 0;
  }
  .privacy-link {
    display: inline-block;
    margin-top: 8px;
    color: var(--fg);
    font-size: 12px;
  }

  /* ── 字段 ──────────────────────────────────────────────────────── */

  .field-group { display: flex; flex-direction: column; gap: 8px; }

  .field { display: flex; flex-direction: column; gap: 4px; }

  .label {
    display: block;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  input, select, textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 12px;
    font: inherit;
    font-size: 13px;
    background: var(--panel);
    color: var(--fg);
    transition: border-color 160ms var(--ease), box-shadow 160ms var(--ease);
  }

  select {
    appearance: none;
    background:
      linear-gradient(45deg, transparent 50%, var(--muted) 50%) calc(100% - 14px) 50% / 5px 5px no-repeat,
      linear-gradient(135deg, var(--muted) 50%, transparent 50%) calc(100% - 9px) 50% / 5px 5px no-repeat,
      var(--panel);
    padding-right: 30px;
  }

  input:focus, select:focus, textarea:focus {
    outline: 1px solid var(--fg);
    outline-offset: 0;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--fg) 8%, transparent);
  }

  /* ── 状态行 ────────────────────────────────────────────────────── */

  .run-state-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .run-state-label { color: var(--muted); }

  .spin { animation: spin 1s linear infinite; display: inline-block; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* ── 按钮 ──────────────────────────────────────────────────────── */

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 14px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    background: var(--button);
    color: var(--button-fg);
    min-height: 38px;
    transition: transform 160ms var(--ease), border-color 160ms var(--ease),
                background 160ms var(--ease), color 160ms var(--ease),
                box-shadow 160ms var(--ease), opacity 160ms var(--ease);
  }

  button.secondary { background: var(--subtle); color: var(--fg); }
  button.ghost { background: var(--subtle); color: var(--fg); }
  button.danger { border-color: var(--fg); background: var(--fg); color: var(--bg); }
  button.active { background: var(--fg); color: var(--bg); border-color: var(--fg); }

  button:hover, button.secondary:hover, button.ghost:hover {
    background: var(--subtle-strong);
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--fg) 22%, var(--line));
  }

  button.active:hover { background: color-mix(in srgb, var(--fg) 85%, transparent); }

  button[disabled] { opacity: 0.45; pointer-events: none; }

  button:active { transform: translateY(0) scale(0.965); box-shadow: none; }
  button:focus-visible { outline: 1px solid var(--fg); outline-offset: 2px; }

  .control-row { display: flex; gap: 8px; }
  .control-row button { flex: 1; }
  .control-row button.icon-only {
    flex: 0 0 auto;
    width: 38px;
    padding: 0;
  }

  /* ── 进度 ──────────────────────────────────────────────────────── */

  .progress-track {
    height: 4px;
    background: var(--subtle);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--fg);
    border-radius: 999px;
    transition: width 400ms var(--ease);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .stat-card {
    background: var(--subtle);
    border-radius: 10px;
    padding: 9px 11px;
  }

  .stat-value {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .stat-value.good { color: #16a34a; }
  .stat-value.warn { color: #ca8a04; }

  .stat-label { font-size: 11px; color: var(--muted); }

  /* ── 底部工具栏 ────────────────────────────────────────────────── */

  .bottom-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    margin-top: auto;
    border-top: 1px solid var(--line);
  }

  .text-btn {
    background: transparent;
    border: 0;
    border-radius: 6px;
    padding: 4px 8px;
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    cursor: pointer;
    min-height: auto;
    gap: 5px;
  }

  .text-btn:hover {
    color: var(--fg);
    background: var(--subtle);
    transform: none;
    border-color: transparent;
    box-shadow: none;
  }

  .text-btn:active { transform: none; }

  /* ── 开发页(整页覆盖,而非内联展开) ──────────────────────────── */

  .dev-page {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    padding: 18px;
    background: var(--bg);
    overflow-y: auto;
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
    transition: transform 280ms var(--ease), opacity 200ms var(--ease);
  }

  .dev-page.open {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }

  .dev-page-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  .dev-page-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 8px;
    background: var(--subtle);
    color: var(--fg);
    border: 1px solid var(--line);
    flex: 0 0 auto;
  }

  .back-btn:hover { background: var(--subtle-strong); }

  .section { margin-top: 14px; }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .surface {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    padding: 14px;
    transition: border-color 180ms var(--ease);
  }

  .surface + .surface, .section + .surface { margin-top: 12px; }

  h2 { margin: 0; font-size: 15px; line-height: 1.2; }

  .muted { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }

  .eyebrow {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .mode-switcher {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 8px;
  }

  .icon-button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    padding: 0;
  }

  .icon-button.mode-btn { width: 100%; }

  .action-group {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }

  .adapter-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 8px; }

  .adapter-status {
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--subtle);
    padding: 10px;
    color: var(--fg);
    font-size: 12px;
    line-height: 1.45;
    min-height: 72px;
  }

  .action-title {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
  }

  .action-button {
    width: 100%;
    justify-content: flex-start;
    min-width: 0;
    padding-inline: 10px;
    font-size: 12px;
  }

  .action-button .action-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  pre {
    margin: 14px 0 0;
    padding: 12px;
    border-radius: 8px;
    background: #101010;
    color: #f4f4f4;
    border: 1px solid var(--line);
    font-family: "SF Mono", "IBM Plex Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 160px;
    transition: border-color 180ms var(--ease), box-shadow 180ms var(--ease);
  }

  pre.updated { border-color: var(--fg); }

  .output-label { margin: 0; color: var(--muted); font-size: 12px; }

  .adapter-summary { display: grid; gap: 8px; }

  .adapter-summary-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--line);
    padding-bottom: 7px;
  }

  .adapter-summary-row:last-child { border-bottom: 0; padding-bottom: 0; }
  .adapter-summary-label { color: var(--muted); }
  .adapter-summary-value { text-align: right; overflow-wrap: anywhere; }

  .warning { margin-top: 8px; color: var(--muted); }

  textarea { min-height: 88px; resize: vertical; }

  @keyframes panel-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  a.button-link {
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px;
    color: var(--button-fg); background: var(--button);
    text-decoration: none; font-size: 13px;
    transition: transform 160ms var(--ease), border-color 160ms var(--ease),
                background 160ms var(--ease), color 160ms var(--ease);
  }

  .icon { width: 16px; height: 16px; flex: 0 0 auto; stroke-width: 1.9; }
`

type AgentAction =
  | 'get_page_context'
  | 'capture_current_answer'
  | 'write_score'
  | 'submit_score'
  | 'submit_batch_scores'
  | 'healthcheck'
  | 'grade_current_answer'

type QuestionMode = 'single' | 'fill_blank'
type IconName =
  | 'book' | 'camera' | 'edit' | 'grid' | 'grid-check' | 'grid-send'
  | 'layers' | 'panel' | 'pen' | 'pulse' | 'refresh' | 'scan' | 'send'
  | 'spark' | 'spark-send' | 'terminal' | 'trash' | 'play' | 'pause'
  | 'stop' | 'rotate-ccw' | 'back'

interface AdapterDebugInfo {
  id: string
  displayName: string
  capabilities: Record<string, boolean>
}

interface AdapterDebugState {
  success: boolean
  tabUrl?: string
  matchedAdapterId?: string | null
  selectedAdapterId?: string | null
  selectedMatched?: boolean
  runAdapterId?: string | null
  adapters?: AdapterDebugInfo[]
  error?: string
}

// ─── 自动阅卷状态机 ────────────────────────────────────────────────────────

type AutomationState =
  | 'idle' | 'starting' | 'capturing' | 'grading' | 'awaiting_confirmation'
  | 'submitting' | 'waiting_next_page' | 'paused' | 'stopped' | 'done' | 'error'

const STATE_LABELS: Record<AutomationState, string> = {
  idle: '空闲', starting: '启动中', capturing: '截图中', grading: '打分中',
  awaiting_confirmation: '等待确认', submitting: '提交中', waiting_next_page: '翻页中',
  paused: '已暂停', stopped: '已停止', done: '已完成', error: '出错',
}

const SPINNING_STATES = new Set<AutomationState>([
  'starting', 'capturing', 'grading', 'submitting', 'waiting_next_page',
])

const API_BASE = 'http://127.0.0.1:8000'
const PUBLIC_SITE_BASE_URL = 'https://suhuangscroll.com'
const DOCS_URL = `${PUBLIC_SITE_BASE_URL}/docs/`

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app root')

// ─── SVG 图标 ──────────────────────────────────────────────────────────────

function icon(name: IconName): string {
  const path: Record<IconName, string> = {
    book: '<path d="M4 5.5c2-1 4-1 6 .2v13c-2-1.2-4-1.2-6-.2z"/><path d="M10 5.7c2-1.2 4-1.2 6-.2v13c-2-1-4-1-6 .2z"/>',
    camera: '<path d="M4 7h3l1.5-2h3L13 7h3v10H4z"/><circle cx="10" cy="12" r="3"/>',
    edit: '<path d="M5 15.5V19h3.5L18 9.5 14.5 6z"/><path d="M13.5 7 17 10.5"/>',
    grid: '<path d="M5 5h5v5H5z"/><path d="M14 5h5v5h-5z"/><path d="M5 14h5v5H5z"/><path d="M14 14h5v5h-5z"/>',
    'grid-check': '<path d="M5 5h5v5H5z"/><path d="M14 5h5v5h-5z"/><path d="M5 14h5v5H5z"/><path d="m14 16 2 2 4-5"/>',
    'grid-send': '<path d="M5 5h5v5H5z"/><path d="M14 5h5v5h-5z"/><path d="M5 14h5v5H5z"/><path d="m14 18 6-4-6-4v3l3 1-3 1z"/>',
    layers: '<path d="m10 4 8 4-8 4-8-4z"/><path d="m4 12 6 3 6-3"/><path d="m4 16 6 3 6-3"/>',
    panel: '<path d="M4 5h16v14H4z"/><path d="M9 5v14"/>',
    pen: '<path d="M5 17l1-4 8.5-8.5 3 3L9 16z"/><path d="M13.5 5.5l3 3"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    scan: '<path d="M5 7V5h2"/><path d="M17 5h2v2"/><path d="M19 17v2h-2"/><path d="M7 19H5v-2"/><path d="M7 12h10"/>',
    send: '<path d="M3 11 20 4l-7 17-3-7z"/><path d="m10 14 4-4"/>',
    spark: '<path d="M10 3l1.6 5.4L17 10l-5.4 1.6L10 17l-1.6-5.4L3 10l5.4-1.6z"/>',
    'spark-send': '<path d="M8 3l1.2 4L13 8l-3.8 1.2L8 13 6.8 9.2 3 8l3.8-1z"/><path d="M11 14l8-4-4 8-1.2-3z"/>',
    terminal: '<path d="m5 7 4 4-4 4"/><path d="M11 17h7"/>',
    trash: '<path d="M5 7h14"/><path d="M8 7V5h8v2"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v4"/><path d="M14 11v4"/>',
    play: '<polygon points="5 3 19 12 5 21 5 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
    stop: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
  }
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${path[name]}</svg>`
}

function iconButton(id: string, label: string, iconName: IconName, variant = 'ghost'): string {
  return `<button id="${id}" type="button" class="icon-button ${variant}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(iconName)}<span class="sr-only">${escapeHtml(label)}</span></button>`
}

function actionButton(label: string, iconName: IconName, action: AgentAction, variant = '', extraAttrs = ''): string {
  return `<button type="button" class="icon-button ${variant} action-button" data-action="${action}" ${extraAttrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(iconName)}<span class="action-label">${escapeHtml(label)}</span></button>`
}

// ─── HTML 骨架 ─────────────────────────────────────────────────────────────

const SINGLE_QUESTION_CONFIG = `{
  "id": "single-essay-1",
  "subject": "语文",
  "content": "简答题：结合材料概括作者的观点。",
  "answer": "观点完整、逻辑清楚、表达准确。",
  "maxScore": 12,
  "type": "single",
  "criteria": [
    { "step": "观点提取", "score": 4, "desc": "核心观点齐全且准确" },
    { "step": "分析展开", "score": 4, "desc": "论述有依据，逻辑完整" },
    { "step": "语言表达", "score": 4, "desc": "表达清晰，术语使用恰当" }
  ],
  "ignore_rules": [
    "只根据学生作答内容评分，不因字迹轻微潦草直接扣分",
    "若答案含义等价，可视为正确表达"
  ]
}`

const FILL_BLANK_QUESTION_CONFIG = `{
  "id": "fill-12-14",
  "subject": "数学",
  "content": "填空题 12-14",
  "answer": "\\\\sqrt{5} + 2, 200, 2\\\\sqrt{3}",
  "maxScore": 15,
  "type": "fill_blank",
  "criteria": [
    { "step": "第12空", "score": 5, "desc": "答案完全正确得5分，错误得0分" },
    { "step": "第13空", "score": 5, "desc": "答案完全正确得5分，错误得0分" },
    { "step": "第14空", "score": 5, "desc": "答案完全正确得5分，错误得0分" }
  ],
  "blanks": [
    { "id": "12", "maxScore": 5, "description": "第12题" },
    { "id": "13", "maxScore": 5, "description": "第13题" },
    { "id": "14", "maxScore": 5, "description": "第14题" }
  ],
  "ignore_rules": [
    "只判学生填写内容，不看题号和下划线",
    "每个空独立判分，答错该空记0分"
  ]
}`

document.head.appendChild(createStyle(styles))

app.innerHTML = `
  <main class="panel">
    <!-- 顶部品牌 -->
    <div class="topbar">
      <p class="brand-name">苏黄共阅</p>
    </div>

    <!-- ── 自动阅卷主视图 ──────────────────────────────────────────── -->
    <div class="grading-view">

      <!-- 后端连接状态 -->
      <div>
        <span class="status-chip">
          <span id="statusDot" class="status-dot" role="status" aria-label="检测中"></span>
          <span id="statusText">检测中</span>
        </span>
      </div>

      <section id="dataNotice" class="privacy-notice" hidden>
        <p class="privacy-notice-title">阅卷数据说明</p>
        <p class="privacy-notice-copy">开始阅卷后，扩展会读取当前支持网站的页面内容和答案图片；本地 Runtime 会按你的配置发送给视觉模型。扩展不会把 Cookie、密码或登录凭据发送给 Suhuang Scroll。</p>
        <label class="privacy-consent-label" for="dataConsent">
          <input id="dataConsent" type="checkbox" />
          <span>我已阅读并同意按上述方式处理当前阅卷数据。</span>
        </label>
        <a id="privacyPolicyLink" class="privacy-link" href="${PUBLIC_SITE_BASE_URL}/privacy/">查看隐私政策</a>
      </section>

      <!-- 评分规范 + 适配器 -->
      <div class="field-group">
        <div class="field">
          <label class="label" for="specSelectMain">评分规范</label>
          <select id="specSelectMain"><option value="">加载中…</option></select>
        </div>
        <div class="field">
          <label class="label" for="adapterSelectMain">适配器</label>
          <select id="adapterSelectMain"><option value="">加载中…</option></select>
        </div>
      </div>

      <!-- 运行状态 + 控制按钮 -->
      <div class="run-state-row">
        <svg id="stateIcon" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"/>
        </svg>
        <span id="runStateLabel" class="run-state-label">空闲</span>
        <span id="rateLabel" style="margin-left:auto;font-size:11px;color:var(--muted);"></span>
      </div>

      <div id="controlRow" class="control-row">
        <!-- 按钮由 JS 渲染 -->
      </div>

      <!-- 进度区(运行中才显示) -->
      <div id="progressSection" hidden>
        <div class="progress-track" style="margin-bottom:10px;">
          <div id="progressFill" class="progress-fill" style="width:0%"></div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div id="statCompleted" class="stat-value good">0</div><div class="stat-label">已阅</div></div>
          <div class="stat-card"><div id="statPending" class="stat-value">—</div><div class="stat-label">待阅</div></div>
          <div class="stat-card"><div id="statFlagged" class="stat-value">0</div><div class="stat-label">待复核</div></div>
          <div class="stat-card"><div id="statElapsed" class="stat-value">—</div><div class="stat-label">耗时</div></div>
        </div>
      </div>

    </div><!-- /grading-view -->

    <!-- ── 底部工具栏 ───────────────────────────────────────────────── -->
    <div class="bottom-bar">
      <button id="openDocs" type="button" class="text-btn">查看文档</button>
      <button id="dataPolicy" type="button" class="text-btn">数据说明</button>
      <button id="developerModeToggle" type="button" class="text-btn" aria-expanded="false" title="开发模式" aria-label="开发模式">
        ${icon('terminal')}&nbsp;开发
      </button>
    </div>

    <!-- ── 开发页(整页覆盖) ────────────────────────────────────────────── -->
    <section id="developerPanel" class="dev-page" aria-hidden="true">
      <div class="dev-page-header">
        <button id="devBackButton" type="button" class="back-btn" title="返回" aria-label="返回">${icon('back')}</button>
        <h1 class="dev-page-title">开发者模式</h1>
      </div>

      <div class="surface">
        <div class="section-heading">
          <div><h2>当前页面与适配器</h2></div>
          ${iconButton('refreshAdapterState', '重读适配器状态', 'refresh', 'secondary')}
        </div>
        <p class="muted">仅用于开发和验证站点适配器，不会自动提交。</p>
      </div>

      <div class="surface">
        <label class="label">题型预设</label>
        <div class="mode-switcher">
          <button type="button" class="ghost active icon-button mode-btn" data-mode-switch="single" title="主观题" aria-label="主观题">${icon('pen')}<span class="sr-only">主观题</span></button>
          <button type="button" class="ghost icon-button mode-btn" data-mode-switch="fill_blank" title="填空题" aria-label="填空题">${icon('grid')}<span class="sr-only">填空题</span></button>
        </div>
      </div>

      <div class="section">
        <label class="label" for="adapterSelect">调试适配器</label>
        <div class="adapter-grid">
          <select id="adapterSelect"></select>
          <div id="adapterStatus" class="adapter-status">正在读取适配器。</div>
        </div>
      </div>

      <div class="surface">
        <div class="section-heading"><div><h2>测试输入</h2></div></div>

        <div class="section">
          <label class="label" for="paperIndex">paperIndex</label>
          <input id="paperIndex" type="number" value="0" min="0" />
        </div>
        <div class="section">
          <label class="label" for="score">score</label>
          <input id="score" type="number" value="8" min="0" step="0.5" />
        </div>
        <div class="section">
          <label class="label" for="batchScores">批量分数 (idx:score)</label>
          <textarea id="batchScores" spellcheck="false">0:3, 1:5, 2:4</textarea>
        </div>
        <div class="section">
          <label class="label" for="examId">examId</label>
          <input id="examId" type="text" value="synthetic-exam-001" />
        </div>
        <div class="section">
          <label class="label" for="studentId">studentId</label>
          <input id="studentId" type="text" value="synthetic-student-001" />
        </div>
        <div class="section">
          <label class="label" for="questionConfig">questionConfig (JSON)</label>
          <textarea id="questionConfig" spellcheck="false">${SINGLE_QUESTION_CONFIG}</textarea>
        </div>
      </div>

      <div class="surface">
        <div class="section-heading"><div><h2>调试动作</h2></div></div>

        <div class="action-group">
          <p class="action-title">读取与检查</p>
          <div class="actions">
            ${actionButton('页面上下文', 'scan', 'get_page_context')}
            ${actionButton('截取答案', 'camera', 'capture_current_answer')}
            ${actionButton('健康检查', 'pulse', 'healthcheck', 'secondary')}
            ${actionButton('试运行写分', 'edit', 'write_score', 'secondary', 'data-dry-run="true"')}
            ${actionButton('试运行提交', 'send', 'submit_score', 'secondary', 'data-dry-run="true"')}
            ${actionButton('试运行批量', 'layers', 'submit_batch_scores', 'secondary', 'data-dry-run="true"')}
          </div>
        </div>
        <div class="action-group">
          <p class="action-title">真实写入</p>
          <div class="actions">
            ${actionButton('写入分数', 'edit', 'write_score', 'danger')}
            ${actionButton('提交分数', 'send', 'submit_score', 'danger')}
            ${actionButton('批量提交', 'layers', 'submit_batch_scores', 'danger')}
          </div>
        </div>
        <div class="action-group">
          <p class="action-title">主观题调试</p>
          <div class="actions">
            ${actionButton('主观题评分', 'spark', 'grade_current_answer', 'secondary', 'data-question-mode="single" data-submit-policy="manual_confirm"')}
            ${actionButton('主观题评分并提交', 'spark-send', 'grade_current_answer', 'danger', 'data-question-mode="single" data-submit-policy="auto_submit"')}
          </div>
        </div>
        <div class="action-group">
          <p class="action-title">填空题调试</p>
          <div class="actions">
            ${actionButton('填空题评分', 'grid-check', 'grade_current_answer', 'secondary', 'data-question-mode="fill_blank" data-submit-policy="manual_confirm"')}
            ${actionButton('填空题评分并提交', 'grid-send', 'grade_current_answer', 'danger', 'data-question-mode="fill_blank" data-submit-policy="auto_submit"')}
          </div>
        </div>
      </div>

      <div class="surface">
        <div class="section-heading">
          <p class="output-label">输出</p>
          ${iconButton('clearOutput', '清空输出', 'trash', 'secondary')}
        </div>
        <pre id="output">就绪。</pre>
      </div>
    </section>

  </main>
`

// ─── DOM refs ──────────────────────────────────────────────────────────────

const statusDot = document.querySelector<HTMLSpanElement>('#statusDot')
const statusText = document.querySelector<HTMLSpanElement>('#statusText')
const specSelectMain = document.querySelector<HTMLSelectElement>('#specSelectMain')
const adapterSelectMain = document.querySelector<HTMLSelectElement>('#adapterSelectMain')
const stateIcon = document.querySelector<SVGSVGElement>('#stateIcon')
const runStateLabel = document.querySelector<HTMLSpanElement>('#runStateLabel')
const rateLabel = document.querySelector<HTMLSpanElement>('#rateLabel')
const controlRow = document.querySelector<HTMLDivElement>('#controlRow')
const progressSection = document.querySelector<HTMLDivElement>('#progressSection')
const progressFill = document.querySelector<HTMLDivElement>('#progressFill')
const statCompleted = document.querySelector<HTMLDivElement>('#statCompleted')
const statPending = document.querySelector<HTMLDivElement>('#statPending')
const statFlagged = document.querySelector<HTMLDivElement>('#statFlagged')
const statElapsed = document.querySelector<HTMLDivElement>('#statElapsed')
const dataNotice = document.querySelector<HTMLElement>('#dataNotice')
const dataConsentInput = document.querySelector<HTMLInputElement>('#dataConsent')
const privacyPolicyLink = document.querySelector<HTMLAnchorElement>('#privacyPolicyLink')
const openDocsButton = document.querySelector<HTMLButtonElement>('#openDocs')
const dataPolicyButton = document.querySelector<HTMLButtonElement>('#dataPolicy')
const developerModeToggle = document.querySelector<HTMLButtonElement>('#developerModeToggle')
const developerPanel = document.querySelector<HTMLElement>('#developerPanel')
const devBackButton = document.querySelector<HTMLButtonElement>('#devBackButton')

// 开发面板 DOM refs
const output = document.querySelector<HTMLPreElement>('#output')
const refreshAdapterStateButton = document.querySelector<HTMLButtonElement>('#refreshAdapterState')
const clearOutputButton = document.querySelector<HTMLButtonElement>('#clearOutput')
const paperIndexInput = document.querySelector<HTMLInputElement>('#paperIndex')
const scoreInput = document.querySelector<HTMLInputElement>('#score')
const batchScoresInput = document.querySelector<HTMLTextAreaElement>('#batchScores')
const examIdInput = document.querySelector<HTMLInputElement>('#examId')
const studentIdInput = document.querySelector<HTMLInputElement>('#studentId')
const questionConfigInput = document.querySelector<HTMLTextAreaElement>('#questionConfig')
const modeSwitchButtons = document.querySelectorAll<HTMLButtonElement>('button[data-mode-switch]')
const adapterSelect = document.querySelector<HTMLSelectElement>('#adapterSelect')
const adapterStatus = document.querySelector<HTMLDivElement>('#adapterStatus')

// ─── 自动阅卷状态 ──────────────────────────────────────────────────────────

let currentRunState: AutomationState = 'idle'
let pollTimer: ReturnType<typeof setInterval> | null = null
let dataConsentGranted = false
let dataNoticeVisible = false

function renderDataNotice(): void {
  if (!dataNotice || !dataConsentInput) return
  dataConsentInput.checked = dataConsentGranted
  dataNotice.hidden = dataConsentGranted && !dataNoticeVisible
}

async function ensureDataConsent(): Promise<boolean> {
  if (dataConsentGranted) return true
  dataNoticeVisible = true
  renderDataNotice()
  dataConsentInput?.focus()
  setOutput({ success: false, error: '请先阅读“阅卷数据说明”并勾选同意，然后再次执行该操作。' })
  return false
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function loadSpecsAndAdapters(): Promise<void> {
  try {
    const [specsData, resourcesData] = await Promise.all([
      apiFetch<SpecsResponse>('/api/specs'),
      apiFetch<ResourcesResponse>('/api/resources'),
    ])

    if (specSelectMain) {
      const specs = specsData.specs ?? []
      specSelectMain.innerHTML = specs.length
        ? specs.map(s => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`).join('')
        : '<option value="">暂无规范文件</option>'
    }

    if (adapterSelectMain) {
      const adapters = resourcesData.adapters ?? []
      adapterSelectMain.innerHTML = adapters.length
        ? adapters.map(a => `<option value="${escapeHtml(a.value)}">${escapeHtml(a.label)}</option>`).join('')
        : '<option value="zhixue">zhixue</option>'
    }
  } catch {
    if (specSelectMain) specSelectMain.innerHTML = '<option value="">—</option>'
    if (adapterSelectMain) adapterSelectMain.innerHTML = '<option value="zhixue">zhixue</option>'
  }
}

async function pollRunStatus(): Promise<void> {
  try {
    const resp = await apiFetch<AutomationStatusResponse>('/api/automation/status')

    const run = resp?.run
    const state: AutomationState = (run?.state as AutomationState) ?? 'idle'
    currentRunState = state
    renderRunState(state, run ?? undefined)
    setBackendOnline(true)
  } catch {
    setBackendOnline(false)
    currentRunState = 'idle'
    renderRunState('idle', undefined)
  }
}

function setBackendOnline(online: boolean): void {
  if (statusDot) {
    statusDot.classList.toggle('connected', online)
    statusDot.setAttribute('aria-label', online ? '已连接' : '未连接')
  }
  if (statusText) statusText.textContent = online ? '已连接' : '未连接'
}

function renderRunState(
  state: AutomationState,
  run?: { completed_count?: number; elapsed_seconds?: number; active_seconds?: number; warning_count?: number }
): void {
  const isRunning = ['starting', 'capturing', 'grading', 'submitting', 'waiting_next_page'].includes(state)
  const spinning = SPINNING_STATES.has(state)
  const completed = run?.completed_count ?? 0
  const elapsed = run?.elapsed_seconds ?? 0
  const flagged = run?.warning_count ?? 0

  // 状态标签
  if (runStateLabel) runStateLabel.textContent = STATE_LABELS[state]
  if (stateIcon) {
    stateIcon.classList.toggle('spin', spinning)
    stateIcon.innerHTML = spinning
      ? '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>'
      : state === 'done'
        ? '<polyline points="20 6 9 17 4 12"/>'
        : '<circle cx="12" cy="12" r="5"/>'
  }

  // 速率
  if (rateLabel) {
    const rate = completed > 0 && elapsed > 0 ? (elapsed / completed).toFixed(1) : null
    rateLabel.textContent = rate ? `~${rate}s/份` : ''
  }

  // 控制按钮
  if (controlRow) {
    if (state === 'idle' || state === 'stopped' || state === 'done') {
      controlRow.innerHTML = `
        <button id="startBtn" type="button">${icon('play')}&nbsp;${state === 'done' ? '重新开始' : '开始阅卷'}</button>
        <button id="resetBtn" type="button" class="ghost icon-only" title="重置" aria-label="重置" ${state === 'idle' ? 'disabled' : ''}>${icon('rotate-ccw')}</button>
      `
      document.getElementById('startBtn')?.addEventListener('click', handleStart)
      document.getElementById('resetBtn')?.addEventListener('click', () => void controlRun('stop'))
    } else if (state === 'paused') {
      controlRow.innerHTML = `
        <button id="resumeBtn" type="button">${icon('play')}&nbsp;继续</button>
        <button id="stopBtn" type="button" class="ghost icon-only" title="停止" aria-label="停止">${icon('stop')}</button>
      `
      document.getElementById('resumeBtn')?.addEventListener('click', () => void controlRun('resume'))
      document.getElementById('stopBtn')?.addEventListener('click', () => void controlRun('stop'))
    } else if (state === 'awaiting_confirmation') {
      controlRow.innerHTML = `<button type="button" disabled>${icon('pause')}&nbsp;等待人工确认…</button>`
    } else if (isRunning) {
      controlRow.innerHTML = `
        <button id="pauseBtn" type="button" class="secondary">${icon('pause')}&nbsp;暂停</button>
        <button id="stopBtn" type="button" class="ghost icon-only" title="停止" aria-label="停止">${icon('stop')}</button>
      `
      document.getElementById('pauseBtn')?.addEventListener('click', () => void controlRun('pause'))
      document.getElementById('stopBtn')?.addEventListener('click', () => void controlRun('stop'))
    } else {
      // error
      controlRow.innerHTML = `<button id="startBtn" type="button">${icon('rotate-ccw')}&nbsp;重新开始</button>`
      document.getElementById('startBtn')?.addEventListener('click', handleStart)
    }
  }

  // 进度区
  const showProgress = state !== 'idle' && state !== 'stopped'
  if (progressSection) progressSection.hidden = !showProgress
  if (showProgress) {
    if (progressFill) progressFill.style.width = '100%' // 后端不预知总数,用活动进度
    if (statCompleted) statCompleted.textContent = String(completed)
    if (statPending) statPending.textContent = '—'
    if (statFlagged) {
      statFlagged.textContent = String(flagged)
      statFlagged.className = `stat-value${flagged > 0 ? ' warn' : ''}`
    }
    if (statElapsed) statElapsed.textContent = elapsed ? `${elapsed}s` : '—'
  }
}

async function controlRun(action: 'start' | 'pause' | 'resume' | 'stop', extra?: Record<string, unknown>): Promise<void> {
  try {
    if (action === 'start') {
      await apiFetch('/api/automation/start', {
        method: 'POST',
        body: JSON.stringify({
          spec_path: specSelectMain?.value ?? '',
          adapter: adapterSelectMain?.value ?? 'zhixue',
          ...extra,
        }),
      })
    } else {
      await apiFetch(`/api/automation/${action}`, { method: 'POST' })
    }
  } catch { /* 后端不可达时静默 */ }
  void pollRunStatus()
}

async function handleStart(): Promise<void> {
  if (!(await ensureDataConsent())) return
  void controlRun('start')
}

// 轮询:运行中 2s,空闲 5s
function schedulePoll(): void {
  const interval = ['starting', 'capturing', 'grading', 'submitting', 'waiting_next_page', 'awaiting_confirmation'].includes(currentRunState) ? 2000 : 5000
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => void pollRunStatus().then(schedulePoll), interval)
}

// ─── 开发者模式 ────────────────────────────────────────────────────────────

let activeMode: QuestionMode = 'single'
let selectedAdapterId = ''
let developerModeEnabled = false

function renderDeveloperMode(): void {
  // 整页切换:开发页是 fixed 覆盖层,通过 .open 滑入;返回由页内返回按钮触发。
  if (developerPanel) {
    developerPanel.classList.toggle('open', developerModeEnabled)
    developerPanel.setAttribute('aria-hidden', String(!developerModeEnabled))
  }
  if (developerModeToggle) {
    developerModeToggle.title = '开发者模式'
    developerModeToggle.setAttribute('aria-label', '开发者模式')
    developerModeToggle.setAttribute('aria-expanded', String(developerModeEnabled))
  }
}

// ─── 后端连接检查 ──────────────────────────────────────────────────────────

async function refreshBridgeStatus(): Promise<void> {
  const core = await chrome.runtime.sendMessage({ type: 'CHECK_BACKEND' })
  setBackendOnline(!!core?.ok)
}

// ─── 适配器状态(开发面板) ──────────────────────────────────────────────────

async function refreshAdapterState(): Promise<void> {
  try {
    const tab = await getActiveTab()
    if (!tab?.id) { renderAdapterState({ success: false, error: 'No active tab found' }); return }
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ADAPTER_DEBUG_STATE', tabId: tab.id,
      adapterId: selectedAdapterId || undefined,
    }) as AdapterDebugState
    if (!selectedAdapterId) {
      selectedAdapterId = response.selectedAdapterId || response.matchedAdapterId || response.adapters?.[0]?.id || ''
    }
    renderAdapterOptions(response.adapters || [])
    renderAdapterState(response)
  } catch (error) {
    renderAdapterState({ success: false, error: String(error) })
  }
}

function renderAdapterOptions(adapters: AdapterDebugInfo[]): void {
  if (!adapterSelect) return
  const prev = selectedAdapterId || adapterSelect.value
  adapterSelect.innerHTML = adapters
    .map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.displayName)} (${escapeHtml(a.id)})</option>`)
    .join('')
  if (prev && adapters.some(a => a.id === prev)) { adapterSelect.value = prev }
  else if (adapters[0]) { adapterSelect.value = adapters[0].id; selectedAdapterId = adapters[0].id }
}

function renderAdapterState(state: AdapterDebugState): void {
  if (!adapterStatus) return
  if (!state.success) { adapterStatus.textContent = state.error || 'Adapter state unavailable.'; return }
  const selected = (state.adapters || []).find(a => a.id === selectedAdapterId)
  const caps = selected ? Object.entries(selected.capabilities).map(([k, v]) => `${k}:${v ? 'yes' : 'no'}`).join('  ') : '-'
  const warning = state.runAdapterId && selectedAdapterId && state.runAdapterId !== selectedAdapterId
    ? `调试覆盖 ${selectedAdapterId} 与运行适配器 ${state.runAdapterId} 不一致。` : ''
  adapterStatus.innerHTML = `
    <div class="adapter-summary">
      ${row('已选适配器', selectedAdapterId || '-')}
      ${row('显示名称', selected?.displayName || '-')}
      ${row('页面匹配', `${state.selectedMatched ? '是' : '否'} / ${state.matchedAdapterId || '-'}`)}
      ${row('运行适配器', state.runAdapterId || '-')}
      ${row('能力', caps)}
    </div>
    ${warning ? `<div class="warning">${escapeHtml(warning)}</div>` : ''}
  `
}

function row(label: string, value: string): string {
  return `<div class="adapter-summary-row"><span class="adapter-summary-label">${escapeHtml(label)}</span><span class="adapter-summary-value">${escapeHtml(value)}</span></div>`
}

// ─── 开发面板:动作按钮 ─────────────────────────────────────────────────────

function buildMessage(
  action: AgentAction, tabId: number,
  submitPolicy?: 'manual_confirm' | 'auto_submit',
  questionMode?: QuestionMode, dryRun = false
) {
  if (action === 'grade_current_answer') {
    return {
      type: 'AGENT_BROWSER_ACTION', action, tabId, adapterId: selectedAdapterId || undefined,
      input: {
        examId: examIdInput?.value || 'synthetic-exam-001',
        studentId: studentIdInput?.value || 'synthetic-student-001',
        questionConfig: resolveQuestionConfig(questionConfigInput?.value || '{}', questionMode),
        execution: { grading_mode: 'vision_grade_direct', submit_policy: submitPolicy || 'manual_confirm' },
      },
    }
  }
  if (action === 'submit_batch_scores') {
    return {
      type: 'AGENT_BROWSER_ACTION', action, tabId, adapterId: selectedAdapterId || undefined,
      input: {
        paperIndex: Number(paperIndexInput?.value || '0'),
        batchScores: parseBatchScores(batchScoresInput?.value || ''),
        dryRun, reason: 'batch submit from sidepanel',
      },
    }
  }
  if (action === 'write_score') {
    return {
      type: 'AGENT_BROWSER_ACTION', action, tabId, adapterId: selectedAdapterId || undefined,
      input: { paperIndex: Number(paperIndexInput?.value || '0'), score: Number(scoreInput?.value || '0'), dryRun },
    }
  }
  if (action === 'submit_score') {
    return {
      type: 'AGENT_BROWSER_ACTION', action, tabId, adapterId: selectedAdapterId || undefined,
      input: {
        paperIndex: Number(paperIndexInput?.value || '0'),
        score: Number(scoreInput?.value || '0'), dryRun, reason: 'single submit from sidepanel',
      },
    }
  }
  return { type: 'AGENT_BROWSER_ACTION', action, tabId, adapterId: selectedAdapterId || undefined }
}

function parseQuestionConfig(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) }
  catch (e) { throw new Error(`Invalid questionConfig JSON: ${String(e)}`) }
}

function resolveQuestionConfig(raw: string, questionMode?: QuestionMode): Record<string, unknown> {
  if (!questionMode) return parseQuestionConfig(raw)
  try {
    const parsed = parseQuestionConfig(raw) as { type?: string }
    if (parsed.type === questionMode) { activeMode = questionMode; syncModeSwitchState(); return parsed }
  } catch { /* fall through */ }
  applyQuestionPreset(questionMode)
  return parseQuestionConfig(questionConfigInput?.value || '{}')
}

function applyQuestionPreset(mode: QuestionMode): void {
  activeMode = mode
  if (questionConfigInput) {
    questionConfigInput.value = mode === 'single' ? SINGLE_QUESTION_CONFIG : FILL_BLANK_QUESTION_CONFIG
  }
  syncModeSwitchState()
}

function syncModeSwitchState(): void {
  for (const btn of modeSwitchButtons) {
    btn.classList.toggle('active', btn.dataset.modeSwitch === activeMode)
  }
}

function parseBatchScores(raw: string): Record<number, number> {
  const result: Record<number, number> = {}
  for (const part of raw.split(/[\n,]+/).map(p => p.trim()).filter(Boolean)) {
    const [i, s] = part.split(':').map(v => v.trim())
    const idx = Number(i); const score = Number(s)
    if (Number.isNaN(idx) || Number.isNaN(score)) throw new Error(`Invalid batch score entry: ${part}`)
    result[idx] = score
  }
  if (Object.keys(result).length === 0) throw new Error('batchScores is empty')
  return result
}

function setOutput(payload: unknown): void {
  if (!output) return
  output.textContent = JSON.stringify(payload, null, 2)
  output.classList.remove('updated')
  void output.offsetWidth
  output.classList.add('updated')
  window.setTimeout(() => output.classList.remove('updated'), 220)
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

function createStyle(cssText: string): HTMLStyleElement {
  const s = document.createElement('style')
  s.textContent = cssText
  return s
}

// ─── 事件绑定 ──────────────────────────────────────────────────────────────

openDocsButton?.addEventListener('click', () => void chrome.tabs.create({ url: DOCS_URL }))

dataPolicyButton?.addEventListener('click', () => {
  dataNoticeVisible = true
  renderDataNotice()
  dataConsentInput?.focus()
})

dataConsentInput?.addEventListener('change', async () => {
  dataConsentGranted = dataConsentInput.checked
  await chrome.storage.local.set({ [DATA_CONSENT_STORAGE_KEY]: dataConsentGranted })
  dataNoticeVisible = !dataConsentGranted
  renderDataNotice()
})

privacyPolicyLink?.addEventListener('click', (event) => {
  event.preventDefault()
  void chrome.tabs.create({ url: privacyPolicyLink.href })
})

developerModeToggle?.addEventListener('click', async () => {
  developerModeEnabled = !developerModeEnabled
  await chrome.storage.local.set({ developerModeEnabled })
  renderDeveloperMode()
})

// 开发页内的返回按钮:回到阅卷首页。
devBackButton?.addEventListener('click', async () => {
  developerModeEnabled = false
  await chrome.storage.local.set({ developerModeEnabled })
  renderDeveloperMode()
})

refreshAdapterStateButton?.addEventListener('click', async () => {
  if (!(await ensureDataConsent())) return
  await refreshAdapterState()
})
clearOutputButton?.addEventListener('click', () => setOutput({ ready: true }))
adapterSelect?.addEventListener('change', async () => {
  selectedAdapterId = adapterSelect.value
  await refreshAdapterState()
})

for (const btn of modeSwitchButtons) {
  btn.addEventListener('click', () => applyQuestionPreset(btn.dataset.modeSwitch as QuestionMode))
}

for (const btn of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
  btn.addEventListener('click', async () => {
    if (!(await ensureDataConsent())) return
    const action = btn.dataset.action as AgentAction
    const submitPolicy = btn.dataset.submitPolicy as 'manual_confirm' | 'auto_submit' | undefined
    const questionMode = btn.dataset.questionMode as QuestionMode | undefined
    const dryRun = btn.dataset.dryRun === 'true'
    setOutput({ pending: true, action, submitPolicy, questionMode, dryRun })
    try {
      const tab = await getActiveTab()
      if (!tab?.id) throw new Error('No active tab found')
      const response = await chrome.runtime.sendMessage(buildMessage(action, tab.id, submitPolicy, questionMode, dryRun))
      setOutput(response)
      await refreshAdapterState()
    } catch (error) {
      setOutput({ success: false, error: String(error) })
    }
  })
}

// ─── 启动 ──────────────────────────────────────────────────────────────────

void (async () => {
  // 恢复开发者模式状态
  const stored = await chrome.storage.local.get('developerModeEnabled')
  developerModeEnabled = stored.developerModeEnabled === true
  renderDeveloperMode()

  dataConsentGranted = await readDataConsent()
  renderDataNotice()

  // 初始状态渲染
  renderRunState('idle', undefined)

  // 并行拉取:后端状态 + spec/adapter 列表 + 开发面板适配器
  void refreshBridgeStatus()
  void loadSpecsAndAdapters()
  if (dataConsentGranted) void refreshAdapterState()
  void pollRunStatus()

  // 启动轮询
  schedulePoll()
})()
