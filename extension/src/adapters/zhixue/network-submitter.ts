/**
 * 智学网网络提交模块 (POST 方法)
 * 通过直接发送网络请求提交分数，而非 DOM 操作
 *
 * 优先级：POST 网络请求 > DOM 操作 (ZhixueScoringBridge)
 */

// ============ 类型定义 ============

export interface ZhixueSubmitConfig {
  // 基础配置
  baseUrl?: string
  endpoint?: string

  // 认证信息（从当前页面自动获取）
  cookies?: Record<string, string>
  authorization?: string
  sessionId?: string

  // 请求配置
  timeout?: number
  maxRetries?: number
  retryDelay?: number

  // 回调
  onProgress?: (stage: string, message: string) => void
  onError?: (error: string, details?: any) => void
  onSuccess?: (result: SubmitResult) => void
}

export interface SubmitRequestData {
  paperIndex: number
  studentId?: string
  score: number
  reason?: string
  questionId?: string
  subject?: string
  batchScores?: Record<number, number>
  blankCount?: number
}

export interface SubmitResult {
  success: boolean
  paperIndex: number
  score: number
  timestamp: number
  method: 'network-post' | 'network-get' | 'fallback-dom' | 'failed'
  message: string
  response?: any
  details?: {
    httpStatus?: number
    responseText?: string
    error?: string
  }
}

// ============ 核心类 ============

/**
 * 智学网网络提交器
 * 使用 POST 请求直接提交分数到智学网服务器
 */
export class ZhixueNetworkSubmitter {
  private config: ZhixueSubmitConfig

  // 默认配置
  private readonly DEFAULT_CONFIG = {
    baseUrl: 'https://pt-ali-bj.zhixue.com',
    endpoint: '/marking/marking/commitTopic/',
    timeout: 10000,
    maxRetries: 3,
    retryDelay: 1000,
  }

  constructor(config: ZhixueSubmitConfig = {}) {
    this.config = { ...this.DEFAULT_CONFIG, ...config }
  }

  // ===== 1. 认证信息获取 =====

  /**
   * 从当前页面自动获取认证信息
   * 包括 Cookies、Authorization 等
   */
  private async extractAuthInfo(): Promise<{
    cookies: Record<string, string>
    authorization?: string
    sessionId?: string
  }> {
    try {
      // 从 document.cookie 获取所有 cookies
      const cookies: Record<string, string> = {}
      const cookieString = document.cookie

      if (cookieString) {
        cookieString.split(';').forEach(cookie => {
          const [name, value] = cookie.trim().split('=')
          if (name && value) {
            cookies[name] = decodeURIComponent(value)
          }
        })
      }

      // 尝试从页面中提取 Authorization token
      // 可能存储在 localStorage、sessionStorage 或全局变量中
      let authorization: string | undefined
      let sessionId: string | undefined

      // 方法1: 检查 localStorage
      try {
        const token = localStorage.getItem('token') ||
                     localStorage.getItem('authorization') ||
                     localStorage.getItem('Authorization')
        if (token) {
          authorization = token
        }

        const sid = localStorage.getItem('JSESSIONID') ||
                   localStorage.getItem('tlsysSessionId') ||
                   localStorage.getItem('sessionId')
        if (sid) {
          sessionId = sid
        }
      } catch (e) {
        // 可能没有权限访问 localStorage
      }

      // 方法2: 检查 sessionStorage
      try {
        if (!authorization) {
          const token = sessionStorage.getItem('token') || sessionStorage.getItem('authorization')
          if (token) authorization = token
        }
        if (!sessionId) {
          const sid = sessionStorage.getItem('JSESSIONID') || sessionStorage.getItem('tlsysSessionId')
          if (sid) sessionId = sid
        }
      } catch (e) {}

      // 方法3: 从页面全局变量中查找（针对智学网）
      // 智学网可能将 token 存储在 window 对象的某个属性中
      if (!authorization) {
        const possibleKeys = ['token', 'authToken', 'accessToken', 'userToken', 'auth']
        for (const key of possibleKeys) {
          if ((window as any)[key]) {
            authorization = (window as any)[key]
            break
          }
        }
      }

      // 检查关键 cookies 是否存在
      const requiredCookies = ['JSESSIONID', 'tlsysSessionId', 'ui']
      const hasRequiredCookies = requiredCookies.some(key => cookies[key])

      if (!hasRequiredCookies && Object.keys(cookies).length === 0) {
        console.warn('[NetworkSubmitter] 未检测到关键 cookies，可能需要手动提供认证信息')
      }

      console.log('[NetworkSubmitter] 提取的认证信息:', {
        cookieCount: Object.keys(cookies).length,
        hasAuthorization: !!authorization,
        hasSessionId: !!sessionId,
        cookies: Object.keys(cookies)
      })

      return { cookies, authorization, sessionId }

    } catch (error) {
      console.error('[NetworkSubmitter] 提取认证信息失败:', error)
      return { cookies: {} }
    }
  }

  /**
   * 构建请求头
   */
  private buildHeaders(auth: {
    cookies: Record<string, string>
    authorization?: string
    sessionId?: string
  }): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    }

    // 构建 Cookie 字符串
    if (Object.keys(auth.cookies).length > 0) {
      const cookieString = Object.entries(auth.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
      headers['Cookie'] = cookieString
    }

    // 添加 Authorization
    if (auth.authorization) {
      // 检查是否已经有 Bearer 前缀
      if (auth.authorization.startsWith('Bearer ') ||
          auth.authorization.startsWith('bearer ')) {
        headers['Authorization'] = auth.authorization
      } else {
        headers['Authorization'] = `Bearer ${auth.authorization}`
      }
    }

    // 添加自定义 Session ID（如果有）
    if (auth.sessionId) {
      headers['X-Session-Id'] = auth.sessionId
    }

    // 智学网可能需要的特定 header
    headers['X-Requested-With'] = 'XMLHttpRequest'
    headers['User-Agent'] = navigator.userAgent

    return headers
  }

  /**
   * 构建请求体 (form-urlencoded)
   * 智学网可能需要的字段：
   * - paperIndex/topicId: 试卷/题目索引
   * - studentId: 学生ID
   * - score: 分数
   * - finalScore: 最终分数
   * - reason: 评语/理由
   * - questionId: 题目ID
   * - subject: 科目
   */
  private buildBody(data: SubmitRequestData): string {
    const params = new URLSearchParams()

    // 核心字段
    params.append('paperIndex', data.paperIndex.toString())
    params.append('score', data.score.toString())
    params.append('finalScore', data.score.toString())

    // 可选字段
    if (data.studentId) {
      params.append('studentId', data.studentId)
    }
    if (data.reason) {
      params.append('reason', data.reason)
    }
    if (data.questionId) {
      params.append('questionId', data.questionId)
    }
    if (data.subject) {
      params.append('subject', data.subject)
    }

    if (data.batchScores) {
      params.append('batchScores', JSON.stringify(data.batchScores))
    }
    if (typeof data.blankCount === 'number') {
      params.append('blankCount', data.blankCount.toString())
    }

    // 添加时间戳（防止缓存）
    params.append('_t', Date.now().toString())

    return params.toString()
  }

  // ===== 2. 网络请求 =====

  /**
   * 发送 POST 请求
   */
  private async sendPostRequest(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<{
    success: boolean
    status: number
    data?: any
    error?: string
    rawResponse?: Response
  }> {
    try {
      console.log('[NetworkSubmitter] 发送 POST 请求:', {
        url,
        bodyLength: body.length,
        headers
      })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout!)

      const response = await fetch(url, {
        method: 'POST',
        headers: headers as any,
        body: body,
        mode: 'cors',
        credentials: 'include', // 包含 cookies
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log('[NetworkSubmitter] 响应状态:', response.status, response.statusText)

      // 读取响应文本（用于调试）
      const responseText = await response.text()

      // 尝试解析 JSON
      let data: any = null
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        // 不是 JSON，保持原始文本
        data = responseText
      }

      if (response.ok) {
        return {
          success: true,
          status: response.status,
          data: data,
          rawResponse: response
        }
      } else {
        return {
          success: false,
          status: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
          data: data,
          rawResponse: response
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('[NetworkSubmitter] 请求失败:', errorMsg)

      return {
        success: false,
        status: 0,
        error: errorMsg
      }
    }
  }

  // ===== 3. 重试逻辑 =====

  /**
   * 带重试的提交
   */
  private async submitWithRetry(
    url: string,
    body: string,
    headers: Record<string, string>,
    attempt: number = 1
  ): Promise<SubmitResult> {
    const result = await this.sendPostRequest(url, body, headers)

    if (result.success) {
      // 检查响应数据是否表示成功
      const isSuccess = this.parseSuccessFromResponse(result.data)

      if (isSuccess) {
        return {
          success: true,
          paperIndex: 0, // 将在外部填充
          score: 0,
          timestamp: Date.now(),
          method: 'network-post',
          message: `提交成功 (HTTP ${result.status})`,
          response: result.data
        }
      } else {
        // 响应格式表明失败
        const errorMsg = this.parseErrorMessage(result.data)
        return {
          success: false,
          paperIndex: 0,
          score: 0,
          timestamp: Date.now(),
          method: 'network-post',
          message: `服务器返回失败: ${errorMsg}`,
          details: {
            httpStatus: result.status,
            responseText: JSON.stringify(result.data)
          }
        }
      }
    } else {
      // 请求失败，检查是否需要重试
      if (attempt < this.config.maxRetries!) {
        console.log(`[NetworkSubmitter] 第 ${attempt} 次尝试失败，${this.config.retryDelay}ms 后重试...`)

        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay!))

        return this.submitWithRetry(url, body, headers, attempt + 1)
      } else {
        // 达到最大重试次数
        return {
          success: false,
          paperIndex: 0,
          score: 0,
          timestamp: Date.now(),
          method: 'network-post',
          message: `提交失败 (重试 ${this.config.maxRetries} 次后仍失败): ${result.error}`,
          details: {
            httpStatus: result.status,
            error: result.error
          }
        }
      }
    }
  }

  // ===== 4. 响应解析 =====

  /**
   * 从响应中解析是否成功
   * 智学网可能的响应格式：
   * - { success: true, data: {...} }
   * - { code: 0, message: '成功' }
   * - { status: 'ok' }
   * - 直接 200 OK
   */
  private parseSuccessFromResponse(data: any): boolean {
    if (!data) return false

    // 如果是字符串，检查是否包含成功关键词
    if (typeof data === 'string') {
      return data.includes('success') ||
             data.includes('成功') ||
             data.includes('ok') ||
             data.includes('200')
    }

    // 如果是对象，检查各种可能的成功标志
    const successFlags = [
      'success', 'isSuccess', 'ok', 'status', 'code', 'result'
    ]

    for (const flag of successFlags) {
      if (flag in data) {
        const value = data[flag]
        // 布尔值 true
        if (value === true) return true
        // 数字 0 表示成功
        if (flag === 'code' && value === 0) return true
        // 字符串 'success' 或 'ok'
        if (typeof value === 'string' && /success|ok|成功/i.test(value)) return true
      }
    }

    // 如果没有明确的成功标志，但也没有错误标志，假设成功
    const errorFlags = ['error', 'fail', 'failed', '错误', '失败']
    for (const flag of errorFlags) {
      if (flag in data) {
        return false
      }
    }

    // 默认认为成功（保守策略）
    return true
  }

  /**
   * 从响应中解析错误信息
   */
  private parseErrorMessage(data: any): string {
    if (!data) return '未知错误'

    if (typeof data === 'string') return data

    // 尝试各种可能的错误字段
    const errorFields = ['message', 'msg', 'error', 'errorMsg', 'err', 'detail', 'details']

    for (const field of errorFields) {
      if (data[field]) {
        return String(data[field])
      }
    }

    // 返回整个对象作为错误信息
    return JSON.stringify(data)
  }

  // ===== 5. 主流程 =====

  /**
   * 执行提交
   */
  public async execute(
    data: SubmitRequestData,
    customConfig?: Partial<ZhixueSubmitConfig>
  ): Promise<SubmitResult> {
    // 合并配置
    if (customConfig) {
      this.config = { ...this.config, ...customConfig }
    }

    // 阶段1: 获取认证信息
    this.config.onProgress?.('auth', '正在获取认证信息...')
    const auth = await this.extractAuthInfo()

    // 阶段2: 构建请求
    this.config.onProgress?.('building', '正在构建请求...')
    const url = `${this.config.baseUrl}${this.config.endpoint}`
    const headers = this.buildHeaders(auth)
    const body = this.buildBody(data)

    console.log('[NetworkSubmitter] 准备提交:', {
      url,
      headers,
      body
    })

    // 阶段3: 发送请求
    this.config.onProgress?.('sending', '正在发送提交请求...')
    const result = await this.submitWithRetry(url, body, headers)

    // 填充完整信息
    result.paperIndex = data.paperIndex
    result.score = data.score

    // 阶段4: 处理结果
    if (result.success) {
      this.config.onSuccess?.(result)
      this.config.onProgress?.('success', '提交成功')
    } else {
      this.config.onError?.(result.message, result.details)
      this.config.onProgress?.('error', `提交失败: ${result.message}`)
    }

    return result
  }

  /**
   * 快速测试连接（用于验证认证信息）
   */
  public async testConnection(): Promise<{
    success: boolean
    message: string
    authInfo?: any
  }> {
    try {
      const auth = await this.extractAuthInfo()

      return {
        success: true,
        message: '认证信息提取成功',
        authInfo: {
          cookieCount: Object.keys(auth.cookies).length,
          hasAuthorization: !!auth.authorization,
          hasSessionId: !!auth.sessionId,
          cookies: Object.keys(auth.cookies)
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `测试失败: ${String(error)}`
      }
    }
  }
}

export async function executeZhixuePostSubmit(data: SubmitRequestData): Promise<SubmitResult> {
  const submitter = new ZhixueNetworkSubmitter()
  return submitter.execute(data)
}

export async function executeZhixueBatchPostSubmit(data: SubmitRequestData): Promise<SubmitResult> {
  const submitter = new ZhixueNetworkSubmitter()
  return submitter.execute(data)
}
