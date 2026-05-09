function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`))
    img.src = src
  })
}

// DashScope URL 需要通过本地代理获取以避免 CORS 污染 canvas
async function loadRemoteImage(url: string): Promise<HTMLImageElement> {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return loadImage(url)
  }
  // 通过本地服务器代理获取远程图片（走 Vite proxy 或直接请求 Express）
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`
  const resp = await fetch(proxyUrl)
  if (!resp.ok) throw new Error(`代理图片失败 HTTP ${resp.status}`)
  const blob = await resp.blob()
  const blobUrl = URL.createObjectURL(blob)
  const img = await loadImage(blobUrl)
  URL.revokeObjectURL(blobUrl)
  return img
}

/**
 * 合成：以相框为画布尺寸，照片填充在相框内
 * photoSrc: 照片 base64 或远程 URL
 * frameSrc: 相框 PNG 路径
 * 返回合成后的 base64 data URL
 */
export async function compositeFrame(
  photoSrc: string,
  frameSrc: string,
): Promise<string> {
  const [photo, frame] = await Promise.all([
    loadRemoteImage(photoSrc),
    loadImage(frameSrc),
  ])

  // 以相框的原始尺寸为画布尺寸
  const canvas = document.createElement('canvas')
  canvas.width = frame.naturalWidth || frame.width
  canvas.height = frame.naturalHeight || frame.height
  const ctx = canvas.getContext('2d')!

  // 照片填充整个画布（cover模式，确保不留白边）
  const frameAspect = canvas.width / canvas.height
  const photoAspect = (photo.naturalWidth || photo.width) / (photo.naturalHeight || photo.height)

  let sx = 0, sy = 0, sw = photo.naturalWidth || photo.width, sh = photo.naturalHeight || photo.height
  if (photoAspect > frameAspect) {
    // 照片更宽，裁剪左右
    sw = sh * frameAspect
    sx = ((photo.naturalWidth || photo.width) - sw) / 2
  } else {
    // 照片更高，裁剪上下
    sh = sw / frameAspect
    sy = ((photo.naturalHeight || photo.height) - sh) / 2
  }

  // 水平翻转（镜像），与摄像头预览一致
  ctx.save()
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  ctx.restore()

  // 叠加相框（相框透明区域透出照片）
  ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/jpeg', 0.95)
}
