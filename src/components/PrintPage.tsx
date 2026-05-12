import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
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
  resultImage, originalPhoto, selectedFrame, qrUrl, styleName, onRestart, onBack: _onBack,
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [countdown, setCountdown] = useState(90)
  const onRestartRef = useRef(onRestart)
  useEffect(() => { onRestartRef.current = onRestart }, [onRestart])

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
  const effectiveFrame = useMemo(() => selectedFrame || FRAMES[0]?.id || null, [selectedFrame])
  const frameSrc = useMemo(() => effectiveFrame ? getFrameSrc(effectiveFrame) : null, [effectiveFrame])

  useEffect(() => {
    console.log('[PrintPage] selectedFrame:', selectedFrame, 'effectiveFrame:', effectiveFrame, 'frameSrc:', frameSrc)
  }, [selectedFrame, effectiveFrame, frameSrc])

  useEffect(() => {
    if (countdown <= 0) { onRestartRef.current(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // 页面加载时通过代理预加载COS相框（blob URL，Canvas可用，不走服务器带宽）
  const preloadedFrameRef = useRef<HTMLImageElement | null>(null)
  const frameBlobUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (!frameSrc) { preloadedFrameRef.current = null; return }
    let cancelled = false
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(frameSrc)}`
    apiFetch(proxyUrl)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return
        const blobUrl = URL.createObjectURL(blob)
        frameBlobUrlRef.current = blobUrl
        const img = new Image()
        img.onload = () => { if (!cancelled) preloadedFrameRef.current = img }
        img.src = blobUrl
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (frameBlobUrlRef.current) { URL.revokeObjectURL(frameBlobUrlRef.current); frameBlobUrlRef.current = null }
    }
  }, [frameSrc])

  // 通用：加载照片Image对象
  const loadPhotoImage = useCallback(async (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('照片加载失败'))
      img.src = src
    })
  }, [])

  // 通用：Canvas合成 → Blob（异步，不阻塞主线程）
  const compositeToBlob = useCallback(async (photo: HTMLImageElement, frame: HTMLImageElement | null): Promise<Blob> => {
    const MAX_SIZE = 1200
    let canvasW: number, canvasH: number

    if (frame) {
      const fw = frame.naturalWidth || frame.width
      const fh = frame.naturalHeight || frame.height
      const scale = Math.min(1, MAX_SIZE / Math.max(fw, fh))
      canvasW = Math.round(fw * scale)
      canvasH = Math.round(fh * scale)
    } else {
      const pw = photo.naturalWidth || photo.width
      const ph = photo.naturalHeight || photo.height
      const scale = Math.min(1, MAX_SIZE / Math.max(pw, ph))
      canvasW = Math.round(pw * scale)
      canvasH = Math.round(ph * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!

    // 绘制照片（cover裁剪，不镜像）
    const frameAspect = canvasW / canvasH
    const photoAspect = (photo.naturalWidth || photo.width) / (photo.naturalHeight || photo.height)
    let sx = 0, sy = 0, sw = photo.naturalWidth || photo.width, sh = photo.naturalHeight || photo.height
    if (photoAspect > frameAspect) { sw = sh * frameAspect; sx = ((photo.naturalWidth || photo.width) - sw) / 2 }
    else { sh = sw / frameAspect; sy = ((photo.naturalHeight || photo.height) - sh) / 2 }
    ctx.drawImage(photo, sx, sy, sw, sh, 0, 0, canvasW, canvasH)

    if (frame) ctx.drawImage(frame, 0, 0, canvasW, canvasH)

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas编码失败')), 'image/jpeg', 0.9)
    })
  }, [])

  // Blob → 下载
  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // 打印6寸照片 - 预加载相框+toBlob异步编码
  const handlePrint = useCallback(async () => {
    try {
      const photo = await loadPhotoImage(cachedImage)
      const frame = preloadedFrameRef.current
      const blob = await compositeToBlob(photo, frame)
      const dataUrl = URL.createObjectURL(blob)

      const printWindow = window.open('', '_blank', 'width=800,height=700')
      if (!printWindow) { alert('请允许弹出窗口以打印照片'); URL.revokeObjectURL(dataUrl); return }

      printWindow.document.write(`<!DOCTYPE html><html><head><title>打印6寸照片</title><style>
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
        @media print { body { background: white; padding: 0; } .tip, .btns { display: none; } .photo { box-shadow: none; width: 100%; height: 100%; } }
      </style></head><body>
        <div class="tip"><p>📋 打印设置：选择 <strong>4×6英寸</strong> 或 <strong>10×15cm</strong> 纸张，方向选<strong>横向</strong></p></div>
        <div class="photo"><img src="${dataUrl}" /></div>
        <div class="btns">
          <button class="btn btn-print" onclick="window.print()">🖨️ 打印照片</button>
          <button class="btn btn-close" onclick="window.close()">关闭窗口</button>
        </div>
      </body></html>`)
      printWindow.document.close()
    } catch (err) {
      console.error('[Print] 合成失败:', err)
      alert('打印准备失败，请重试')
    }
  }, [cachedImage, loadPhotoImage, compositeToBlob])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const photo = await loadPhotoImage(cachedImage)
      const frame = preloadedFrameRef.current
      const blob = await compositeToBlob(photo, frame)
      downloadBlob(blob, `AI校园写真_${Date.now()}.jpg`)
    } catch (err) {
      console.error('[Download] 失败:', err)
      alert('下载失败，请重试')
    } finally {
      setIsDownloading(false)
    }
  }, [cachedImage, loadPhotoImage, compositeToBlob, downloadBlob])

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
              size={140} level="L"
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
