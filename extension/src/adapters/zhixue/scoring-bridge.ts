/**
 * 智学网评分桥接模块
 * 负责将分数写入智学网并触发提交
 */

import { resolveDescriptor } from '../core/descriptor'
import {
  ZHIXUE_SCORE_INPUT_DESCRIPTOR,
  ZHIXUE_SCORE_INPUT_SELECTORS,
  ZHIXUE_SUBMIT_BUTTON_DESCRIPTOR,
  ZHIXUE_SUBMIT_BUTTON_SELECTORS,
} from './descriptors'

// ============ 类型定义 ============

/**
 * 评分桥接模块状态
 */
export type BridgeState = 'idle' | 'writing' | 'submitting' | 'success' | 'error'

export interface BridgeConfig {
  // 选择器配置
  scoreInputSelector?: string
  submitButtonSelector?: string

  // 回调配置
  onStateChange?: (state: BridgeState, message?: string) => void
  onError?: (error: string) => void
  onSuccess?: (result: SubmitResult) => void

  // 安全配置
  preventAutoSwitch?: boolean
  requireConfirmation?: boolean
  maxRetryCount?: number
}

export interface SubmitResult {
  paperIndex: number
  score: number
  timestamp: number
  submitMethod: string
  message: string
}

export interface WriteResult {
  paperIndex: number
  score: number
  timestamp: number
  method: string
  message: string
}

// ============ 核心类 ============

/**
 * 智学网评分桥接核心类
 * 负责将分数写入智学网并触发提交
 */
export class ZhixueScoringBridge {
  private state: BridgeState = 'idle'
  private config: BridgeConfig
  private observer: MutationObserver | null = null
  private submitHandler: ((e: Event) => void) | null = null
  private isReviewMode = false

  constructor(config: BridgeConfig = {}) {
    this.config = {
      preventAutoSwitch: true,
      requireConfirmation: false,
      maxRetryCount: 3,
      ...config
    }
  }

  // ===== 1. 稳定 Selector 定位机制 =====

  /**
   * 智学网常用选择器库（按优先级排序）
   * 基于实际 DOM 结构优化
   */
  private readonly ZHIXUE_SELECTORS = {
    // 分数输入框 - 基于实际发现的结构
    scoreInputs: ZHIXUE_SCORE_INPUT_SELECTORS,

    // 提交按钮 - 基于实际发现的结构
    submitButtons: [
      // 实际发现：button "提交分数" > StaticText "提交分数" > InlineTextBox "提交分数"
      'button:contains("提交分数")',  // 提交分数（最高优先级）
      'button:contains("提交")',      // 包含提交文本
      'button:contains("确认")',      // 包含确认文本
      'button:contains("保存")',      // 包含保存文本
      ...ZHIXUE_SUBMIT_BUTTON_SELECTORS,
    ],

    // 防误触元素（需要阻止的自动跳转）
    autoSwitchElements: [
      '.next-paper',                   // 下一份试卷按钮
      'a[href*="next"]',               // 下一份链接
      '.auto-next',                    // 自动下一份
      'button:contains("下一份")',     // 下一份按钮
      'button:contains("继续批改")',   // 继续批改
    ]
  }

  /**
   * 智能查找元素，支持多种策略
   */
  private findElement(
    selectors: string[],
    context: Document | Element = document
  ): HTMLElement | null {
    // 策略1: 精确选择器匹配（处理 :contains 选择器）
    for (const selector of selectors) {
      try {
        // 检查是否包含 :contains 伪类
        if (selector.includes(':contains(')) {
          const element = this.findByTextContent(selector, context)
          if (element) {
            return element
          }
        } else {
          const element = context.querySelector(selector) as HTMLElement
          if (element && this.isElementVisible(element)) {
            console.log(`[Bridge] 找到元素: ${selector}`)
            return element
          }
        }
      } catch (e) {
        // 选择器语法错误，跳过
      }
    }

    // 策略2: 模糊文本匹配（针对按钮）
    const allButtons = Array.from(context.querySelectorAll('button, input[type="button"], a.button'))
    for (const btn of allButtons) {
      const text = (btn as HTMLElement).innerText || (btn as HTMLInputElement).value
      if (text && /提交|确认|保存|submit/i.test(text)) {
        console.log(`[Bridge] 通过文本匹配找到按钮: ${text}`)
        return btn as HTMLElement
      }
    }

    // 策略3: 通过父容器查找
    const containers = [
      '.marking-panel',      // 阅卷面板
      '.score-panel',        // 分数面板
      '.grading-area',       // 批改区域
      '.operation-area',     // 操作区域
    ]

    for (const container of containers) {
      const containerEl = context.querySelector(container)
      if (containerEl) {
        // 在容器内查找
        for (const selector of selectors) {
          try {
            if (selector.includes(':contains(')) {
              const element = this.findByTextContent(selector, containerEl)
              if (element) {
                console.log(`[Bridge] 在容器 ${container} 内通过文本找到`)
                return element
              }
            } else {
              const element = containerEl.querySelector(selector) as HTMLElement
              if (element && this.isElementVisible(element)) {
                console.log(`[Bridge] 在容器 ${container} 内找到: ${selector}`)
                return element
              }
            }
          } catch (e) {
            // 跳过无效选择器
          }
        }
      }
    }

    console.warn(`[Bridge] 未找到匹配元素，尝试选择器: ${selectors.join(', ')}`)
    return null
  }

  /**
   * 通过文本内容查找元素（支持 :contains 选择器）
   * 例如: button:contains("提交分数")
   */
  private findByTextContent(
    selector: string,
    context: Document | Element
  ): HTMLElement | null {
    // 解析 :contains("text") 中的文本
    const match = selector.match(/:contains\(["']([^"']+)["']\)/)
    if (!match || !match[1]) return null

    const searchText: string = match[1]
    const baseSelector = selector.replace(/:contains\(["'][^"']+["']\)/, '')

    // 查找所有可能的元素
    let elements: Element[]
    if (baseSelector && baseSelector !== '*') {
      elements = Array.from(context.querySelectorAll(baseSelector))
    } else {
      // 如果没有基础选择器，搜索所有元素
      elements = Array.from(context.querySelectorAll('button, a, span, div, input[type="button"]'))
    }

    // 查找包含指定文本的元素
    for (const el of elements) {
      const textContent = el.textContent
      const innerText = (el as HTMLElement).innerText
      const text = textContent || innerText
      const isVisible = this.isElementVisible(el as HTMLElement)
      if (text && isVisible) {
        // 使用 String() 确保是字符串类型，避免 TypeScript 报错
        const textValue = String(textContent || innerText || '')
        if (textValue.indexOf(searchText) >= 0) {
          console.log(`[Bridge] 通过文本 "${searchText}" 找到元素`)
          return el as HTMLElement
        }
      }
    }

    return null
  }

  /**
   * 检查元素是否可见
   */
  private isElementVisible(element: HTMLElement): boolean {
    if (!element || !(element instanceof HTMLElement)) return false
    const style = window.getComputedStyle(element)
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && element.offsetParent !== null
  }

  /**
   * 定位真正的题目分数输入框，避免误选到“自定义分值”等辅助输入
   */
  private findScoreInput(context: Document | Element = document): HTMLInputElement | null {
    const descriptorResult = resolveDescriptor(ZHIXUE_SCORE_INPUT_DESCRIPTOR, context)
    if (
      descriptorResult.success &&
      descriptorResult.element instanceof HTMLInputElement &&
      !this.isLikelyCustomScoreInput(descriptorResult.element)
    ) {
      console.log(
        `[Bridge] 通过 descriptor 选择分数输入框: ` +
        `${descriptorResult.metadata.locator?.type || 'unknown'}, candidates=${descriptorResult.metadata.candidateCount}`
      )
      return descriptorResult.element
    }

    const candidates: Array<{ element: HTMLInputElement; selector: string; score: number }> = []

    for (const selector of this.ZHIXUE_SELECTORS.scoreInputs) {
      try {
        const elements = Array.from(context.querySelectorAll(selector))
        for (const element of elements) {
          if (!(element instanceof HTMLInputElement)) continue
          if (!this.isElementVisible(element)) continue

          const score = this.scoreScoreInputCandidate(element)
          if (score <= 0) continue

          candidates.push({ element, selector, score })
        }
      } catch {
        // 跳过无效选择器
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (!best) {
      console.warn('[Bridge] 未找到可信的分数输入框候选')
      return null
    }

    console.log(
      `[Bridge] 选择分数输入框: ${best.selector}, score=${best.score}, ` +
      `name=${best.element.name || '(empty)'}, placeholder=${best.element.placeholder || '(empty)'}`
    )
    return best.element
  }

  private findSubmitButton(context: Document | Element = document): HTMLElement | null {
    const descriptorResult = resolveDescriptor(ZHIXUE_SUBMIT_BUTTON_DESCRIPTOR, context)
    if (descriptorResult.success) {
      console.log(
        `[Bridge] 通过 descriptor 选择提交按钮: ` +
        `${descriptorResult.metadata.locator?.type || 'unknown'}, candidates=${descriptorResult.metadata.candidateCount}`
      )
      return descriptorResult.element
    }

    return this.findElement(
      this.config.submitButtonSelector
        ? [this.config.submitButtonSelector]
        : this.ZHIXUE_SELECTORS.submitButtons,
      context
    )
  }

  private scoreScoreInputCandidate(input: HTMLInputElement): number {
    const placeholder = input.placeholder || ''
    const name = input.name || ''
    const className = input.className || ''
    const type = input.type || 'text'

    let score = 0

    if (name === 'topicTxt') score += 80
    if (className.includes('topictxt_input')) score += 60
    if (className.includes('scores')) score += 35
    if (placeholder.includes('满分')) score += 30
    if (placeholder === '分数') score += 20
    if (type === 'number') score += 10
    if (this.isLikelyCustomScoreInput(input)) score -= 120

    return score
  }

  private isLikelyCustomScoreInput(input: HTMLInputElement): boolean {
    const text = [input.placeholder, input.name, input.className, input.value]
      .filter(Boolean)
      .join(' ')
    return /自定义|custom/i.test(text)
  }

  // ===== 2. 分数写入与事件触发 =====

  /**
   * 写入分数到输入框
   */
  private async writeScore(
    score: number,
    inputElement: HTMLInputElement
  ): Promise<{ success: boolean; message: string }> {
    try {
      this.updateState('writing', `正在写入分数: ${score}`)

      // 1. 聚焦输入框
      inputElement.focus()
      inputElement.select()

      // 2. 清空现有值
      inputElement.value = ''

      // 3. 模拟用户输入（触发所有必要事件）
      const scoreStr = score.toString()

      // 方法1: 逐字符输入（最真实）
      for (let i = 0; i < scoreStr.length; i++) {
        inputElement.value += scoreStr[i]

        // 触发键盘事件
        inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: scoreStr[i], bubbles: true }))
        inputElement.dispatchEvent(new KeyboardEvent('keypress', { key: scoreStr[i], bubbles: true }))
        inputElement.dispatchEvent(new KeyboardEvent('keyup', { key: scoreStr[i], bubbles: true }))

        // 触发输入事件
        inputElement.dispatchEvent(new Event('input', { bubbles: true }))

        // 短暂延迟，模拟真实输入
        await this.sleep(20)
      }

      // 4. 最终设置值（确保值正确）
      inputElement.value = scoreStr

      // 5. 触发所有相关事件
      inputElement.dispatchEvent(new Event('input', { bubbles: true }))
      inputElement.dispatchEvent(new Event('change', { bubbles: true }))
      inputElement.dispatchEvent(new Event('blur', { bubbles: true }))

      // 6. 如果是React/Vue等框架，可能需要触发特定事件
      const reactEvent = new Event('change', { bubbles: true })
      Object.defineProperty(reactEvent, 'target', { value: inputElement, writable: false })
      inputElement.dispatchEvent(reactEvent)

      // 7. 检查值是否写入成功
      if (inputElement.value === scoreStr || inputElement.value === score.toString()) {
        console.log(`[Bridge] 分数写入成功: ${score}`)
        return { success: true, message: `分数 ${score} 已写入` }
      } else {
        console.warn(`[Bridge] 分数写入后值不匹配，期望: ${scoreStr}, 实际: ${inputElement.value}`)
        // 强制设置
        inputElement.value = scoreStr
        inputElement.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true, message: `分数 ${score} 已强制写入` }
      }

    } catch (error) {
      console.error('[Bridge] 写入分数失败:', error)
      return { success: false, message: `写入失败: ${String(error)}` }
    }
  }

  // ===== 3. 提交按钮定位与点击 =====

  /**
   * 触发提交按钮
   */
  private async triggerSubmit(
    submitButton: HTMLElement,
    paperIndex: number
  ): Promise<{ success: boolean; message: string; method: string }> {
    try {
      this.updateState('submitting', `正在提交试卷 #${paperIndex}`)

      // 方法1: 标准点击（最常用）
      console.log('[Bridge] 方法1: 标准点击')
      submitButton.click()

      // 等待一小段时间，观察是否有反应
      const clicked = await this.waitForSubmitReaction(submitButton, 1000)
      if (clicked) {
        return { success: true, message: '提交成功', method: 'click' }
      }

      // 方法2: 模拟鼠标事件
      console.log('[Bridge] 方法2: 模拟鼠标事件')
      submitButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      submitButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      const clicked2 = await this.waitForSubmitReaction(submitButton, 1000)
      if (clicked2) {
        return { success: true, message: '提交成功', method: 'mouse-events' }
      }

      // 方法3: 如果是表单，尝试提交表单
      const form = submitButton.closest('form')
      if (form) {
        console.log('[Bridge] 方法3: 提交表单')
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

        const clicked3 = await this.waitForSubmitReaction(submitButton, 1500)
        if (clicked3) {
          return { success: true, message: '提交成功', method: 'form-submit' }
        }
      }

      // 方法4: 直接调用onclick（如果有）
      if (submitButton instanceof HTMLElement && submitButton.onclick) {
        console.log('[Bridge] 方法4: 调用onclick')
        // 创建兼容的点击事件
        const clickEvent = document.createEvent('MouseEvents')
        clickEvent.initEvent('click', true, true)
        submitButton.onclick(clickEvent as any)

        const clicked4 = await this.waitForSubmitReaction(submitButton, 1000)
        if (clicked4) {
          return { success: true, message: '提交成功', method: 'onclick' }
        }
      }

      return { success: false, message: '所有提交方法均未生效', method: 'all-failed' }

    } catch (error) {
      console.error('[Bridge] 提交失败:', error)
      return { success: false, message: `提交异常: ${String(error)}`, method: 'error' }
    }
  }

  /**
   * 等待提交反应
   */
  private async waitForSubmitReaction(
    button: HTMLElement,
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false

      // 观察按钮状态变化
      const observer = new MutationObserver(() => {
        // 按钮被禁用、文本改变、或消失
        const isDisabled = button.hasAttribute('disabled')
        const isLoading = button.innerText.includes('中') || button.classList.contains('loading')
        const isHidden = !this.isElementVisible(button)

        if (isDisabled || isLoading || isHidden) {
          if (!resolved) {
            resolved = true
            observer.disconnect()
            console.log('[Bridge] 检测到按钮状态变化，提交成功')
            resolve(true)
          }
        }
      })

      observer.observe(button, {
        attributes: true,
        attributeFilter: ['disabled', 'class', 'style'],
        childList: true,
        subtree: false
      })

      // 观察页面变化（可能跳转或弹窗）
      const pageObserver = new MutationObserver(() => {
        // 检查是否有弹窗出现
        const modals = document.querySelectorAll('.modal, .dialog, .popup, .ant-modal')
        if (modals.length > 0) {
          if (!resolved) {
            resolved = true
            observer.disconnect()
            pageObserver.disconnect()
            console.log('[Bridge] 检测到弹窗出现')
            resolve(true)
          }
        }
      })

      pageObserver.observe(document.body, {
        childList: true,
        subtree: true
      })

      // 超时处理
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          observer.disconnect()
          pageObserver.disconnect()
          console.log('[Bridge] 等待提交反应超时')
          resolve(false)
        }
      }, timeout)
    })
  }

  // ===== 4. 提交状态回调与观测 =====

  /**
   * 开始观测提交状态
   */
  private startObservation(): void {
    // 观察DOM变化
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 检查是否有成功提示
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              const text = node.innerText || node.textContent || ''
              if (text.includes('成功') || text.includes('success') || text.includes('已提交')) {
                this.handleSuccess(`检测到成功提示: ${text}`)
              } else if (text.includes('失败') || text.includes('error') || text.includes('错误')) {
                this.handleError(`检测到错误提示: ${text}`)
              }
            }
          })
        }

        // 检查是否有禁用状态（提交中）
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          const target = mutation.target as HTMLElement
          if (target.hasAttribute('disabled')) {
            this.updateState('submitting', '提交中...')
          }
        }
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled']
    })

    // 监听网络请求（可选，用于更精确的状态追踪）
    this.hookNetworkRequests()
  }

  /**
   * 停止观测
   */
  private stopObservation(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }

    // 移除事件监听器
    if (this.submitHandler && this.config.preventAutoSwitch) {
      document.removeEventListener('click', this.submitHandler, true)
    }
  }

  /**
   * 钩子网络请求（用于追踪提交结果）
   */
  private hookNetworkRequests(): void {
    // 保存原始fetch
    const originalFetch = window.fetch

    // 重写fetch以拦截提交请求
    window.fetch = async function(...args) {
      const request = args[0]
      let url = ''

      if (typeof request === 'string') {
        url = request
      } else if (request instanceof Request) {
        url = request.url
      } else if (request instanceof URL) {
        url = request.href
      }

      // 检查是否是提交相关的请求
      if (url && (url.includes('submit') || url.includes('grade') || url.includes('score'))) {
        console.log('[Bridge] 检测到提交请求:', url)

        try {
          const response = await originalFetch.apply(this, args)

          // 如果请求成功，尝试解析响应
          if (response.ok) {
            const clone = response.clone()
            clone.json().then(data => {
              console.log('[Bridge] 提交响应数据:', data)
              // 这里可以解析具体的响应格式
            }).catch(() => {})
          }

          return response
        } catch (error) {
          console.error('[Bridge] 提交请求失败:', error)
          throw error
        }
      }

      return originalFetch.apply(this, args)
    }
  }

  // ===== 5. 防误提交保险丝机制 =====

  /**
   * 启用防误触保护
   */
  private enableAntiMistakeProtection(): void {
    if (!this.config.preventAutoSwitch) return

    console.log('[Bridge] 启用防误提交保险丝')

    // 阻止所有可能导致页面跳转的点击事件
    this.submitHandler = (e: Event) => {
      const target = e.target as HTMLElement

      // 检查是否是危险元素
      const dangerousSelectors = [
        'a[href*="next"]',
        'a[href*="submit"]',
        '.next-paper',
        '.auto-next',
        'button.danger',
      ]

      for (const selector of dangerousSelectors) {
        if (target.closest(selector)) {
          // 检查是否在保护期内
          if (this.state === 'submitting' || this.state === 'writing') {
            e.stopPropagation()
            e.preventDefault()
            console.log('[Bridge] 阻止危险点击:', selector)
            this.updateState('error', '提交中，已阻止自动跳转')
          }
        }
      }
    }

    // 使用捕获阶段，确保最先执行
    document.addEventListener('click', this.submitHandler, true)

    // 阻止页面卸载
    window.addEventListener('beforeunload', (e) => {
      if (this.state === 'submitting' || this.state === 'writing') {
        e.preventDefault()
        // returnValue 已弃用但仍需要设置以兼容旧浏览器
        ;(e as any).returnValue = ''
        return ''
      }
    })
  }

  /**
   * 检查保险丝状态
   */
  private checkFuse(): boolean {
    if (this.state === 'submitting' || this.state === 'writing') {
      console.warn('[Bridge] 保险丝熔断：当前正在提交中，拒绝新操作')
      return false
    }
    return true
  }

  // ===== 6. 撤销提交/复审模式接口 =====

  /**
   * 进入复审模式（只读，允许重新提交）
   */
  public enterReviewMode(): void {
    this.isReviewMode = true
    this.updateState('idle', '进入复审模式')
    console.log('[Bridge] 已进入复审模式，允许重新提交')
  }

  /**
   * 撤销提交（如果系统支持）
   */
  public async undoSubmit(): Promise<{ success: boolean; message: string }> {
    if (!this.isReviewMode) {
      return { success: false, message: '仅在复审模式下支持撤销' }
    }

    // 尝试查找撤销按钮
    const undoSelectors = [
      'button:contains("撤销")',
      'button:contains("撤回")',
      'button.undo',
      '.undo-btn',
      'button:contains("取消")',
    ]

    const undoBtn = this.findElement(undoSelectors)
    if (undoBtn) {
      undoBtn.click()
      this.updateState('idle', '已撤销提交')
      return { success: true, message: '提交已撤销' }
    }

    // 如果没有撤销按钮，尝试刷新页面重新进入
    return { success: false, message: '未找到撤销按钮，请手动刷新页面' }
  }

  /**
   * 重置桥接状态
   */
  public reset(): void {
    this.stopObservation()
    this.state = 'idle'
    this.isReviewMode = false
    this.updateState('idle', '已重置')
  }

  // ===== 7. 主流程接口 =====

  /**
   * 执行评分提交流程
   */
  public async execute(
    score: number,
    paperIndex: number,
    customConfig?: Partial<BridgeConfig>
  ): Promise<SubmitResult> {
    // 合并配置
    if (customConfig) {
      this.config = { ...this.config, ...customConfig }
    }

    // 保险丝检查
    if (!this.checkFuse()) {
      return {
        paperIndex,
        score,
        timestamp: Date.now(),
        submitMethod: 'rejected',
        message: '操作被保险丝阻止'
      }
    }

    // 启动观测
    this.startObservation()
    this.enableAntiMistakeProtection()

    try {
      // Step 1: 查找分数输入框
      this.updateState('idle', '正在查找分数输入框')
      const scoreInput = (
        this.config.scoreInputSelector
          ? this.findElement([this.config.scoreInputSelector])
          : this.findScoreInput()
      ) as HTMLInputElement | null

      if (!scoreInput) {
        throw new Error('未找到分数输入框，请确保在智学网阅卷页面')
      }

      // Step 2: 写入分数
      const writeResult = await this.writeScore(score, scoreInput)
      if (!writeResult.success) {
        throw new Error(writeResult.message)
      }

      // Step 3: 查找提交按钮
      this.updateState('idle', '正在查找提交按钮')
      const submitButton = this.config.submitButtonSelector
        ? this.findElement([this.config.submitButtonSelector])
        : this.findSubmitButton()

      if (!submitButton) {
        throw new Error('未找到提交按钮')
      }

      // Step 4: 触发提交
      const submitResult = await this.triggerSubmit(submitButton, paperIndex)

      if (submitResult.success) {
        // Step 5: briefly yield; the automation loop owns next-page detection.
        await this.sleep(250)

        const result: SubmitResult = {
          paperIndex,
          score,
          timestamp: Date.now(),
          submitMethod: submitResult.method,
          message: `试卷 #${paperIndex} 分数 ${score} 提交成功 (${submitResult.method})`
        }

        this.handleSuccess(result.message)
        return result
      } else {
        throw new Error(submitResult.message)
      }

    } catch (error) {
      const errorMsg = String(error)
      this.handleError(errorMsg)
      return {
        paperIndex,
        score,
        timestamp: Date.now(),
        submitMethod: 'failed',
        message: errorMsg
      }
    } finally {
      // 清理观测器（保留以便后续查看状态）
      // this.stopObservation()
    }
  }

  public async writeOnly(
    score: number,
    paperIndex: number,
    customConfig?: Partial<BridgeConfig>
  ): Promise<WriteResult> {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig }
    }

    if (!this.checkFuse()) {
      return {
        paperIndex,
        score,
        timestamp: Date.now(),
        method: 'rejected',
        message: '操作被保险丝阻止',
      }
    }

    try {
      this.updateState('idle', '正在查找分数输入框')
      const scoreInput = (
        this.config.scoreInputSelector
          ? this.findElement([this.config.scoreInputSelector])
          : this.findScoreInput()
      ) as HTMLInputElement | null

      if (!scoreInput) {
        throw new Error('未找到分数输入框，请确保在支持的阅卷页面')
      }

      const writeResult = await this.writeScore(score, scoreInput)
      if (!writeResult.success) {
        throw new Error(writeResult.message)
      }

      this.updateState('success', writeResult.message)

      return {
        paperIndex,
        score,
        timestamp: Date.now(),
        method: 'dom-write',
        message: writeResult.message,
      }
    } catch (error) {
      const errorMsg = String(error)
      this.handleError(errorMsg)
      return {
        paperIndex,
        score,
        timestamp: Date.now(),
        method: 'failed',
        message: errorMsg,
      }
    }
  }

  /**
   * 执行填空题批量评分流程
   * 支持一次性写入多个分数到对应的输入框
   */
  public async executeBatchFillBlank(
    data: {
      paperIndex: number
      batchScores: Record<number, number>
      reason: string
    }
  ): Promise<SubmitResult> {
    const { paperIndex, batchScores, reason } = data

    console.log('[Bridge] ===== 批量填空题评分流程开始 =====')
    console.log('[Bridge] 批量分数:', batchScores)
    console.log('[Bridge] 理由:', reason)

    // 保险丝检查
    if (!this.checkFuse()) {
      return {
        paperIndex,
        score: 0,
        timestamp: Date.now(),
        submitMethod: 'rejected',
        message: '操作被阻止'
      }
    }

    this.startObservation()
    this.enableAntiMistakeProtection()

    try {
      // Step 1: 查找所有分数输入框
      this.updateState('idle', '正在查找分数输入框')
      const blankCount = Object.keys(batchScores).length
      const inputs = this.findAllScoreInputs(blankCount)

      if (inputs.length === 0) {
        throw new Error('未找到分数输入框')
      }

      if (inputs.length < blankCount) {
        console.warn(`[Bridge] 找到 ${inputs.length} 个输入框，但需要 ${blankCount} 个`)
      }

      // Step 2: 批量写入分数
      this.updateState('writing', `正在批量写入 ${blankCount} 个分数`)

      const inputArray = Array.from(inputs) as HTMLInputElement[]
      const scoreEntries = Object.entries(batchScores)

      for (const [idx, score] of scoreEntries) {
        const inputIndex = parseInt(idx)
        const input = inputArray[inputIndex]

        if (input) {
          console.log(`[Bridge] 写入第 ${inputIndex} 个输入框: ${score}分`)
          const writeResult = await this.writeScore(score, input)

          if (!writeResult.success) {
            console.warn(`[Bridge] 第 ${inputIndex} 个输入框写入失败: ${writeResult.message}`)
          }

          await this.sleep(100) // 小延迟避免过快
        } else {
          console.warn(`[Bridge] 未找到第 ${inputIndex} 个输入框`)
        }
      }

      // Step 3: 查找并点击提交按钮
      this.updateState('idle', '正在查找提交按钮')
      const submitButton = this.config.submitButtonSelector
        ? this.findElement([this.config.submitButtonSelector])
        : this.findSubmitButton()

      if (!submitButton) {
        throw new Error('未找到提交按钮')
      }

      // Step 4: 触发提交
      const submitResult = await this.triggerSubmit(submitButton, paperIndex)

      if (submitResult.success) {
        // Step 5: briefly yield; the automation loop owns next-page detection.
        await this.sleep(250)

        const totalScore = Object.values(batchScores).reduce((a, b) => a + b, 0)
        const result: SubmitResult = {
          paperIndex,
          score: totalScore,
          timestamp: Date.now(),
          submitMethod: `batch_${submitResult.method}`,
          message: `试卷 #${paperIndex} 批量提交成功 (${submitResult.method})`
        }

        this.handleSuccess(result.message)
        return result
      } else {
        throw new Error(submitResult.message)
      }

    } catch (error) {
      const errorMsg = String(error)
      this.handleError(errorMsg)
      return {
        paperIndex,
        score: 0,
        timestamp: Date.now(),
        submitMethod: 'batch_failed',
        message: errorMsg
      }
    }
  }

  /**
   * 查找多个分数输入框（批量模式）
   * @param count 需要的输入框数量
   * @returns 输入框数组
   */
  private findAllScoreInputs(count: number): HTMLElement[] {
    const seen = new Set<HTMLInputElement>()
    const candidates: Array<{ element: HTMLInputElement; score: number }> = []

    for (const selector of this.ZHIXUE_SELECTORS.scoreInputs) {
      if (selector.includes(':contains(')) continue

      try {
        const elements = Array.from(document.querySelectorAll(selector))
        for (const element of elements) {
          if (!(element instanceof HTMLInputElement)) continue
          if (!this.isElementVisible(element)) continue
          if (seen.has(element)) continue

          const score = this.scoreScoreInputCandidate(element)
          if (score <= 0) continue

          seen.add(element)
          candidates.push({ element, score })
        }
      } catch {
        // 跳过无效选择器
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const position = a.element.compareDocumentPosition(b.element)
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      })
      console.log(`[Bridge] 找到 ${candidates.length} 个可信分数输入框`)
      return candidates.slice(0, count).map(candidate => candidate.element)
    }

    console.log('[Bridge] 未找到可信分数输入框，回退到通用输入框搜索')
    const fallback = Array.from(document.querySelectorAll('input')).filter(el => {
      if (!(el instanceof HTMLInputElement)) return false
      if (!this.isElementVisible(el)) return false
      const placeholder = el.placeholder || ''
      return placeholder.includes('分') || placeholder.includes('满分')
    })
    return fallback.slice(0, count) as HTMLElement[]
  }

  // ===== 辅助方法 =====

  private updateState(state: BridgeState, message?: string): void {
    this.state = state
    console.log(`[Bridge] 状态变更: ${state}`, message || '')

    if (this.config.onStateChange) {
      this.config.onStateChange(state, message)
    }
  }

  private handleSuccess(message: string): void {
    this.updateState('success', message)
    if (this.config.onSuccess) {
      this.config.onSuccess({
        paperIndex: 0,
        score: 0,
        timestamp: Date.now(),
        submitMethod: 'unknown',
        message
      } as any)
    }
  }

  private handleError(message: string): void {
    this.updateState('error', message)
    if (this.config.onError) {
      this.config.onError(message)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取当前状态
   */
  public getState(): BridgeState {
    return this.state
  }

  /**
   * 获取配置
   */
  public getConfig(): BridgeConfig {
    return this.config
  }
}
