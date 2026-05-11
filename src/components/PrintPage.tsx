import { useState, useCallback, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getFrameSrc, FRAMES } from '../data/frames'
import { apiFetch } from '../apiBase'

interface Props {
  resultImage: string
  originalPhoto: string | null
  selectedFrame: string | null
  qrUrl: string | null
  styleName: string
  onRestart: () => void
  onBack: () => void
}

export default function PrintPage({
  resultImage, originalPhoto, selectedFrame, qrUrl, styleName, onRestart, onBack,
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [countdown, setCountdown] = useState(90)
  const onBackRef = useRef(onBack)
  useEffect(() => { onBackRef.current = onBack }, [onBack])

  // 预加载远程图片为本地blob URL（加速下载和打印）
  const [cachedImage, setCachedImage] = useState<string>(resultImage)
  useEffect(() => {
    if (!resultImage || resultImage.startsWith('data:') || resultImage.startsWith('blob:') || resultImage.startsWith('/')) {
      setCachedImage(resultImage)
      return
    }
    // COS URL 直接加载，不走代理
    if (resultImage.includes('cos.ap-nanjing.myqcloud.com')) {
      setCachedImage(resultImage)
      return
    }
    let revoked = false
    let blobUrl: string
    const preload = async () => {
      try {
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(resultImage)}`
        const resp = await apiFetch(proxyUrl)
        if (!resp.ok) throw new Error(`代理返回 ${resp.status}`)
        const blob = await resp.blob()
        if (revoked) return
        blobUrl = URL.createObjectURL(blob)
        setCachedImage(blobUrl)
        console.log('[PrintPage] 预加载完成, blob大小:', blob.size)
      } catch (err) {
        console.warn('[PrintPage] 预加载失败，使用原始URL:', err)
        setCachedImage(resultImage)
      }
    }
    preload()
    return () => { revoked = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [resultImage])

  // 确保始终有边框：使用 selectedFrame 或默认第一个边框
  const effectiveFrame = selectedFrame || FRAMES[0]?.id || null
  const frameSrc = effectiveFrame ? getFrameSrc(effectiveFrame) : null
  console.log('[PrintPage] selectedFrame:', selectedFrame, 'effectiveFrame:', effectiveFrame, 'frameSrc:', frameSrc)

  useEffect(() => {
    if (countdown <= 0) { onBackRef.current(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // 打印6寸照片 - 用Canvas合成照片+相框后打印
  const handlePrint = useCallback(async () => {
    console.log('[Print] 开始合成打印图片')

    const directLoad = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('加载失败'))
        img.src = src
      })
    }

    const loadImage = async (src: string): Promise<HTMLImageElement> => {
      if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/')) {
        return directLoad(src)
      }
      try {
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
        const resp = await apiFetch(proxyUrl)
        if (!resp.ok) throw new Error(`代理返回 ${resp.status}`)
        const blob = await resp.blob()
        const blobUrl = URL.createObjectURL(blob)
        try {
          return await directLoad(blobUrl)
        } finally {
          URL.revokeObjectURL(blobUrl)
        }
      } catch {
        return directLoad(src)
      }
    }

    try {
      const photo = await loadImage(cachedImage)
      let printDataUrl: string

      if (frameSrc) {
        const frame = await loadImage(frameSrc)
        const canvas = document.createElement('canvas')
        canvas.width = frame.naturalWidth || frame.width
        canvas.height = frame.naturalHeight || frame.height
        const ctx = canvas.getContext('2d')!

        const frameAspect = canvas.width / canvas.height
        const photoAspect = (photo.naturalWidth || photo.width) / (photo.naturalHeight || photo.height)
        let sx = 0, sy = 0, sw = photo.naturalWidth || photo.width, sh = photo.naturalHeight || photo.height
        if (photoAspect > frameAspect) { sw = sh * frameAspect; sx = ((photo.naturalWidth || photo.width) - sw) / 2 }
        else { sh = sw / frameAspect; sy = ((photo.naturalHeight || photo.height) - sh) / 2 }

        // 镜像照片（与页面显示 scaleX(-1) 一致）
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
        printDataUrl = canvas.toDataURL('image/jpeg', 0.95)
      } else {
        const canvas = document.createElement('canvas')
        canvas.width = photo.naturalWidth || photo.width
        canvas.height = photo.naturalHeight || photo.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(photo, 0, 0)
        printDataUrl = canvas.toDataURL('image/jpeg', 0.95)
      }

      const printWindow = window.open('', '_blank', 'width=800,height=700')
      if (!printWindow) { alert('请允许弹出窗口以打印照片'); return }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>打印6寸照片</title>
          <style>
            @page { size: 6in 4in landscape; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: sans-serif; background: #f0f0f0; padding: 20px; text-align: center; }
            .tip { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .tip p { color: #856404; font-size: 14px; }
            .photo { width: 6in; height: 4in; margin: 0 auto; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
            .photo img { width: 100%; height: 100%; object-fit: cover; }
            .btns { margin-top: 20px; }
            .btn { padding: 12px 30px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 0 10px; }
            .btn-print { background: #1565C0; color: white; }
            .btn-close { background: #eee; color: #666; }
            @media print {
              body { background: white; padding: 0; }
              .tip, .btns { display: none; }
              .photo { box-shadow: none; width: 100%; height: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="tip">
            <p>📋 打印设置：选择 <strong>4×6英寸</strong> 或 <strong>10×15cm</strong> 纸张，方向选<strong>横向</strong></p>
          </div>
          <div class="photo">
            <img src="${printDataUrl}" />
          </div>
          <div class="btns">
            <button class="btn btn-print" onclick="window.print()">🖨️ 打印照片</button>
            <button class="btn btn-close" onclick="window.close()">关闭窗口</button>
          </div>
        </body>
        </html>
      `)
      printWindow.document.close()
    } catch (err) {
      console.error('[Print] 合成失败:', err)
      alert('打印准备失败，请重试')
    }
  }, [cachedImage, frameSrc])

  const handleDownload = useCallback(async () => {
    console.log('[Download] ========== 开始下载流程 ==========')
    console.log('[Download] cachedImage:', cachedImage ? cachedImage.slice(0, 80) : 'NULL')
    console.log('[Download] frameSrc:', frameSrc)

    setIsDownloading(true)
    try {
      // 直接加载图片
      const directLoad = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('加载失败'))
          img.src = src
        })
      }

      // 加载图片：COS/本地直接加载，DashScope远程URL通过代理
      const loadImage = async (src: string, label: string): Promise<HTMLImageElement> => {
        console.log(`[Download][${label}] 加载:`, src.slice(0, 80))

        // base64/blob/本地路径/COS URL 直接加载
        if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/') || src.includes('cos.ap-nanjing.myqcloud.com')) {
          console.log(`[Download][${label}] 直接加载`)
          return directLoad(src)
        }

        // DashScope远程URL通过代理
        try {
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`
          const resp = await apiFetch(proxyUrl)
          if (!resp.ok) throw new Error(`代理返回 ${resp.status}`)
          const blob = await resp.blob()
          if (blob.size === 0) throw new Error('blob为空')
          console.log(`[Download][${label}] 代理成功, blob大小: ${blob.size}`)
          const blobUrl = URL.createObjectURL(blob)
          try {
            const img = await directLoad(blobUrl)
            return img
          } finally {
            URL.revokeObjectURL(blobUrl)
          }
        } catch (proxyErr) {
          console.warn(`[Download][${label}] 代理失败，尝试直接加载:`, proxyErr)
          return directLoad(src)
        }
      }

      // 加载照片
      console.log('[Download] 步骤1: 加载照片...')
      const photo = await loadImage(cachedImage, '照片')
      console.log('[Download] 照片加载完成, 尺寸:', photo.naturalWidth, 'x', photo.naturalHeight)

      // 如果有边框，合成边框后下载
      if (frameSrc) {
        console.log('[Download] 步骤2: 有边框, 加载边框图片...')
        const frame = await loadImage(frameSrc, '边框')
        console.log('[Download] 边框加载完成, 尺寸:', frame.naturalWidth, 'x', frame.naturalHeight)

        const canvas = document.createElement('canvas')
        canvas.width = frame.naturalWidth || frame.width
        canvas.height = frame.naturalHeight || frame.height
        const ctx = canvas.getContext('2d')
        console.log('[Download] 步骤3: Canvas创建, canvas尺寸:', canvas.width, 'x', canvas.height)

        if (!ctx) {
          throw new Error('无法创建Canvas 2D上下文')
        }

        // 绘制照片（cover模式）
        const frameAspect = canvas.width / canvas.height
        const photoAspect = (photo.naturalWidth || photo.width) / (photo.naturalHeight || photo.height)
        let sx = 0, sy = 0, sw = photo.naturalWidth || photo.width, sh = photo.naturalHeight || photo.height
        if (photoAspect > frameAspect) {
          sw = sh * frameAspect
          sx = ((photo.naturalWidth || photo.width) - sw) / 2
        } else {
          sh = sw / frameAspect
          sy = ((photo.naturalHeight || photo.height) - sh) / 2
        }
        console.log('[Download] 步骤4: 绘制照片, 裁剪参数:', { sx: Math.round(sx), sy: Math.round(sy), sw: Math.round(sw), sh: Math.round(sh) })

        // 镜像照片（与页面显示 scaleX(-1) 一致）
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        console.log('[Download] 照片绘制完成（已镜像）')

        // 叠加边框
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
        console.log('[Download] 边框叠加完成')

        // 导出下载 - 使用 toDataURL 替代 toBlob，更可靠
        console.log('[Download] 步骤5: 导出图片...')
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
          console.log('[Download] toDataURL 成功, dataUrl长度:', dataUrl.length, '前50字符:', dataUrl.slice(0, 50))

          const link = document.createElement('a')
          link.href = dataUrl
          link.download = `AI校园写真_${Date.now()}.jpg`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          console.log('[Download] ========== 下载触发成功（有边框）==========')
        } catch (canvasErr) {
          console.error('[Download] canvas.toDataURL 失败:', canvasErr)
          console.error('[Download] canvas tainted?', (() => { try { canvas.toDataURL(); return false } catch { return true } })())
          throw new Error(`Canvas导出失败: ${canvasErr instanceof Error ? canvasErr.message : String(canvasErr)}`)
        }
        setIsDownloading(false)
      } else {
        console.log('[Download] 步骤2: 无边框, 直接下载原图')
        const canvas = document.createElement('canvas')
        canvas.width = photo.naturalWidth || photo.width
        canvas.height = photo.naturalHeight || photo.height
        const ctx = canvas.getContext('2d')
        console.log('[Download] Canvas尺寸:', canvas.width, 'x', canvas.height)

        if (!ctx) {
          throw new Error('无法创建Canvas 2D上下文')
        }

        // 镜像照片（与页面显示 scaleX(-1) 一致）
        ctx.save()
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(photo, 0, 0)
        ctx.restore()
        console.log('[Download] 照片绘制完成（已镜像）')

        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
          console.log('[Download] toDataURL 成功, 长度:', dataUrl.length)

          const link = document.createElement('a')
          link.href = dataUrl
          link.download = `AI校园写真_${Date.now()}.jpg`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          console.log('[Download] ========== 下载触发成功（无边框）==========')
        } catch (canvasErr) {
          console.error('[Download] canvas.toDataURL 失败:', canvasErr)
          throw new Error(`Canvas导出失败: ${canvasErr instanceof Error ? canvasErr.message : String(canvasErr)}`)
        }
        setIsDownloading(false)
      }
    } catch (err) {
      console.error('[Download] ========== 下载流程异常 ==========')
      console.error('[Download] 错误类型:', err?.constructor?.name)
      console.error('[Download] 错误信息:', err instanceof Error ? err.message : String(err))
      console.error('[Download] 完整错误:', err)
      console.error('[Download] 当前状态 - selectedFrame:', selectedFrame, 'frameSrc:', frameSrc)
      alert('下载失败，请重试')
      setIsDownloading(false)
    }
  }, [cachedImage, frameSrc, selectedFrame])

  return (
    <div style={{ height: '100vh', display: 'flex', backgroundColor: '#fff' }}>
      {/* ===== 左侧：大图展示区 ===== */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#eef0f3', padding: '12px 20px',
      }}>
        {/* AI合成大图 */}
        <div style={{
          position: 'relative',
          height: 'calc(100vh - 100px)',
          aspectRatio: '2/3',
          overflow: 'hidden',
          borderRadius: 16,
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
        }}>
          <img
            src={cachedImage}
            alt="AI合成写真"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
              transform: 'scaleX(-1)',
            }}
          />
          {/* 相框叠加 */}
          {frameSrc && (
            <img src={frameSrc} alt="相框" style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'fill',
              pointerEvents: 'none',
            }} />
          )}
          {/* AI角标 */}
          <div style={{
            position: 'absolute', top: 12, right: 12,
            background: '#1565C0', color: 'white',
            fontSize: 11, padding: '3px 10px', borderRadius: 4, fontWeight: 600,
          }}>
            AI
          </div>
          {/* 原片缩略图 */}
          {originalPhoto && (
            <div style={{ position: 'absolute', bottom: 14, left: 14 }}>
              <img src={originalPhoto} alt="原片" style={{
                width: 60, height: 80, borderRadius: 6,
                border: '2px solid white',
                objectFit: 'cover',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                display: 'block',
                transform: 'scaleX(-1)',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* ===== 右侧：操作区 200px ===== */}
      <div style={{
        width: 220, display: 'flex', flexDirection: 'column',
        background: '#fff', borderLeft: '0.5px solid #e5e5e5',
        flexShrink: 0, justifyContent: 'space-between',
      }}>
        <div>
          {/* 顶部信息 */}
          <div style={{ padding: '14px 14px 10px' }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: '#1a1a1a' }}>
              {styleName || 'AI艺术风格'}
            </p>
            <p style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              合成完成
            </p>
          </div>

          {/* 分隔线 */}
          <div style={{ height: 0.5, background: '#e5e5e5', margin: '0 14px' }} />

          {/* 按钮组 */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              style={{
                width: '100%', height: 48,
                background: '#1565C0', color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                cursor: isDownloading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>↓</span>
              {isDownloading ? '下载中...' : '保存到本地'}
            </button>

            <button
              onClick={handlePrint}
              disabled={isDownloading}
              style={{
                width: '100%', height: 48,
                background: '#e8a000', color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                cursor: isDownloading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>🖨</span>
              {isDownloading ? '准备打印...' : '打印6寸照片'}
            </button>

            <button
              onClick={onRestart}
              style={{
                width: '100%', height: 40,
                background: '#f5f5f5', border: '0.5px solid #e5e5e5', borderRadius: 8,
                fontSize: 12, color: '#999', cursor: 'pointer',
              }}
            >
              重新制作
            </button>
          </div>
        </div>

        {/* 二维码卡片 */}
        <div style={{ padding: 12 }}>
          <div style={{
            background: '#f5f5f5', border: '0.5px solid #e5e5e5', borderRadius: 8,
            padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <QRCodeSVG
              value={qrUrl || window.location.href}
              size={80} level="M"
            />
            <p style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 6 }}>
              手机扫码保存
            </p>
          </div>
        </div>

        {/* 底部倒计时 */}
        <div style={{
          padding: 10, borderTop: '0.5px solid #e5e5e5',
          textAlign: 'center', fontSize: 11,
          color: countdown <= 3 ? '#d32f2f' : '#999',
        }}>
          {countdown}秒后自动返回首页
        </div>
      </div>

    </div>
  )
}
