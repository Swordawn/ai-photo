import { apiFetch } from '../apiBase'

const API_KEY = import.meta.env.VITE_DASHSCOPE_KEY as string
// wan2.7-image 使用 OpenAI 兼容的 chat completions 格式
const CHAT_URL = '/dashscope/compatible-mode/v1/chat/completions'

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

  // wan2.7-image 使用 OpenAI 兼容格式
  const requestBody = {
    model: 'wan2.7-image',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: photoBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  }
  console.log('[generate] 提交任务到:', CHAT_URL)

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  // 30秒超时
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), 30000)
  const onExternalAbort = () => timeoutController.abort()
  signal?.addEventListener('abort', onExternalAbort)

  let chatRes: Response
  try {
    chatRes = await apiFetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: timeoutController.signal,
    })
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    throw new Error('请求超时（30秒），请检查网络后重试')
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  }

  console.log('[generate] 响应状态:', chatRes.status)

  if (!chatRes.ok) {
    const errText = await chatRes.text()
    console.error('[generate] 请求失败:', errText)
    throw new Error(`AI生成失败: ${chatRes.status} - ${errText}`)
  }

  const chatData = await chatRes.json()
  console.log('[generate] 响应:', chatData)

  // 从响应中提取图片URL
  const content = chatData.choices?.[0]?.message?.content
  if (!content) throw new Error('AI未返回结果')

  // content 可能是字符串（包含URL）或数组
  if (typeof content === 'string') {
    // 尝试从文本中提取URL
    const urlMatch = content.match(/https?:\/\/[^\s\]]+/)
    if (urlMatch) return urlMatch[0]
    throw new Error('AI返回格式异常')
  }

  // 如果是数组格式
  if (Array.isArray(content)) {
    const imgPart = content.find((p: any) => p.type === 'image_url')
    if (imgPart?.image_url?.url) return imgPart.image_url.url
  }

  throw new Error('AI未返回图片')
}
