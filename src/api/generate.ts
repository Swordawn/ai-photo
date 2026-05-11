import { apiFetch } from '../apiBase'

const API_KEY = import.meta.env.VITE_DASHSCOPE_KEY as string
const SUBMIT_URL = '/dashscope/api/v1/services/aigc/image-generation/generation'
const TASK_URL = '/dashscope/api/v1/tasks'
// 指数退避轮询：500ms → 1s → 2s → 3s（快任务秒出，慢任务不频繁请求）
const POLL_INTERVALS = [500, 1000, 2000, 3000]
const MAX_WAIT = 90000

// 风格提示词映射
const stylePrompts: Record<string, string> = {
  'guofeng': '转换为古风中国画风格，水墨质感，古典优雅，保持人物面部清晰',
  'guochao': '转换为国潮艺术风格，鲜艳色彩，现代中国风，潮流插画感',
  'jiaopian': '转换为复古胶片摄影风格，暖色调，颗粒质感，怀旧氛围',
  'qingxin': '转换为小清新风格，明亮柔和色调，自然光线，清新淡雅',
  'youhua': '转换为油画风格，厚重笔触质感，丰富色彩层次，艺术感强',
  'sumiao': '转换为铅笔素描风格，黑白线条，细腻明暗关系，写实素描',
}

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

  const prompt = stylePrompts[styleId] || stylePrompts['guofeng']
  console.log('[generate] 风格:', styleId, '→ prompt:', prompt.slice(0, 30) + '...')

  // Step 1: 提交生成任务
  const requestBody = {
    model: 'wan2.7-image',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image: photoBase64 },
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      size: '1024*1024',
      n: 1,
    },
  }
  console.log('[generate] 提交任务到:', SUBMIT_URL)

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // 30秒超时
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000)
  const onExternalAbort = () => timeoutController.abort()
  signal?.addEventListener('abort', onExternalAbort)

  let submitRes: Response
  try {
    submitRes = await apiFetch(SUBMIT_URL, {
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

  // Step 2: 轮询任务状态（指数退避：500ms → 1s → 2s → 3s）
  const startTime = Date.now()
  let consecutiveErrors = 0
  let pollIndex = 0

  while (Date.now() - startTime < MAX_WAIT) {
    const delay = POLL_INTERVALS[Math.min(pollIndex, POLL_INTERVALS.length - 1)]
    pollIndex++
    await new Promise(r => setTimeout(r, delay))

    console.log('[generate] 轮询中...')

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const pollRes = await apiFetch(`${TASK_URL}/${taskId}`, {
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
      // 新版 API 格式：output.choices[0].message.content[0].image
      const content = pollData.output?.choices?.[0]?.message?.content
      const resultUrl = content?.[0]?.image
      console.log('[generate] 生成完成! url:', resultUrl?.slice(0, 80))
      if (resultUrl) return resultUrl
      throw new Error('任务成功但未返回结果URL')
    }

    if (status === 'FAILED') {
      const msg = pollData.output?.message || pollData.output?.code || '未知错误'
      console.error('[generate] 任务失败:', msg)
      throw new Error(`AI生成失败: ${msg}`)
    }
  }

  throw new Error('AI生成超时（90秒），请重试')
}
