// 上传结果接口
interface UploadResult {
  success: boolean
  url: string
  error?: string
}

// 判断是否为 URL
function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://')
}

// 判断是否为 base64 data URL
function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:image/')
}

// 将 base64 转换为 Blob
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bstr = atob(parts[1])
  const n = bstr.length
  const u8arr = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i)
  }
  return new Blob([u8arr], { type: mime })
}

// 上传到 0x0.st (免费，无需注册)
async function uploadTo0x0(blob: Blob): Promise<UploadResult> {
  try {
    const formData = new FormData()
    formData.append('file', blob, 'photo.jpg')

    const response = await fetch('https://0x0.st', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    const url = (await response.text()).trim()
    return { success: true, url }
  } catch (error) {
    return { success: false, url: '', error: String(error) }
  }
}

// 上传到 tmpfiles.org (免费，无需注册)
async function uploadToTmpFiles(blob: Blob): Promise<UploadResult> {
  try {
    const formData = new FormData()
    formData.append('file', blob, 'photo.jpg')

    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    const data = await response.json()
    if (data.data && data.data.url) {
      const directUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
      return { success: true, url: directUrl }
    }
    throw new Error('Invalid response')
  } catch (error) {
    return { success: false, url: '', error: String(error) }
  }
}

// 主上传函数 - 尝试多个服务
export async function uploadImage(imageData: string): Promise<UploadResult> {
  // 如果已经是 URL，直接返回
  if (isUrl(imageData)) {
    console.log('图片已是 URL，无需上传:', imageData)
    return { success: true, url: imageData }
  }

  // 如果是 base64 数据，上传到第三方服务
  if (isBase64DataUrl(imageData)) {
    const blob = base64ToBlob(imageData)

    // 尝试 0x0.st
    console.log('尝试上传到 0x0.st...')
    const result0x0 = await uploadTo0x0(blob)
    if (result0x0.success) {
      console.log('上传成功:', result0x0.url)
      return result0x0
    }

    // 尝试 tmpfiles.org
    console.log('尝试上传到 tmpfiles.org...')
    const resultTmp = await uploadToTmpFiles(blob)
    if (resultTmp.success) {
      console.log('上传成功:', resultTmp.url)
      return resultTmp
    }

    return { success: false, url: '', error: '所有上传服务都失败，请使用直接下载' }
  }

  // 既不是 URL 也不是 base64
  return { success: false, url: '', error: '不支持的图片格式' }
}
