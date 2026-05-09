const API_KEY = import.meta.env.VITE_DASHSCOPE_KEY as string
// 通过 Vite 代理避免 CORS
const SUBMIT_URL = '/dashscope/api/v1/services/aigc/image-generation/generation'
const TASK_URL = '/dashscope/api/v1/tasks'
const POLL_INTERVAL = 3000
const MAX_WAIT = 60000

export async function generateAIImage(
  photoBase64: string,
  styleId: string,
  mock: boolean,
  signal?: AbortSignal
): Promise<string> {
  console.log('[generate] mock=', mock, 'API_KEY exists=', !!API_KEY)

  if (mock) {
    console.log('[generate] Mock模式，返回原图')
    await new Promise(r => setTimeout(r, 2000))
    return photoBase64
  }

  if (!API_KEY) {
    throw new Error('API Key 未配置，请在 .env 中设置 VITE_DASHSCOPE_KEY')
  }

  // 风格映射
  const styleMap: Record<string, number> = {
    'guofeng': 5,   // 古风
    'guochao': 5,   // 国潮
    'jiaopian': 0,  // 胶片风
    'qingxin': 1,   // 小清新
    'youhua': 3,    // 油画
    'sumiao': 6,    // 素描
  }

  const styleIndex = styleMap[styleId] ?? 0
  console.log('[generate] 风格:', styleId, '→ style_index:', styleIndex)

  // Step 1: 提交生成任务
  const requestBody = {
    model: 'wanx-style-repaint-v1',
    input: {
      image_url: photoBase64,
      style_index: styleIndex,
    },
  }
  console.log('[generate] 提交任务到:', SUBMIT_URL)

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // 30秒超时
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000)
  // 外部 abort 时同步取消超时 controller
  const onExternalAbort = () => timeoutController.abort()
  signal?.addEventListener('abort', onExternalAbort)

  let submitRes: Response
  try {
    submitRes = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
      signal: timeoutController.signal,
    })
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error('提交任务超时（30秒），请检查网络后重试')
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  console.log('[generate] 提交响应状态:', submitRes.status)

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    console.error('[generate] 提交失败:', errText)
    throw new Error(`提交任务失败: ${submitRes.status} - ${errText}`)
  }

  const submitData = await submitRes.json()
  console.log('[generate] 提交响应:', submitData)

  const taskId = submitData.output?.task_id
  if (!taskId) throw new Error('未获取到 task_id')
  console.log('[generate] 任务ID:', taskId)

  // Step 2: 轮询任务状态（每3秒，最多60秒）
  const startTime = Date.now()

  let consecutiveErrors = 0

  while (Date.now() - startTime < MAX_WAIT) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL))

    console.log('[generate] 轮询中...')

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const pollRes = await fetch(`${TASK_URL}/${taskId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      signal,
    })

    if (!pollRes.ok) {
      consecutiveErrors++
      console.warn('[generate] 轮询HTTP错误:', pollRes.status, `(连续第${consecutiveErrors}次)`)
      if (consecutiveErrors >= 3) {
        throw new Error(`轮询连续失败${consecutiveErrors}次 (HTTP ${pollRes.status})，请重试`)
      }
      continue
    }

    consecutiveErrors = 0

    const pollData = await pollRes.json()
    const status = pollData.output?.task_status
    console.log('[generate] 任务状态:', status)

    if (status === 'SUCCEEDED') {
      // 官方文档：结果在 output.results[0].url
      const resultUrl = pollData.output?.results?.[0]?.url
      console.log('[generate] 生成完成! url:', resultUrl?.slice(0, 80))
      if (resultUrl) return resultUrl
      throw new Error('任务成功但未返回结果URL')
    }

    if (status === 'FAILED') {
      const msg = pollData.output?.message || pollData.output?.code || '未知错误'
      console.error('[generate] 任务失败:', msg)
      throw new Error(`AI生成失败: ${msg}`)
    }

    // PENDING / RUNNING → 继续轮询
  }

  throw new Error('AI生成超时（60秒），请重试')
}
