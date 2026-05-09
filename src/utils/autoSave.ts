/**
 * 上传照片到服务器，返回可访问的 URL
 */
export async function autoSaveImage(base64Image: string): Promise<string | null> {
  try {
    const timestamp = Date.now()
    const filename = `已完成照片/photo_${timestamp}.jpg`

    const resp = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, filename }),
    })

    if (!resp.ok) {
      console.error('[autoSave] 服务器返回错误:', resp.status)
      return '__UPLOAD_FAILED__'
    }

    const data = await resp.json()
    return data.url || null
  } catch (err) {
    console.error('[autoSave] 保存失败:', err)
    return '__UPLOAD_FAILED__'
  }
}
