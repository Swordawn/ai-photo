import { useState, useCallback, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { getFrameSrc } from '../data/frames'

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
  const [showPrintConfirm, setShowPrintConfirm] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [countdown, setCountdown] = useState(14)

  const frameSrc = selectedFrame ? getFrameSrc(selectedFrame) : null

  useEffect(() => {
    if (countdown <= 0) { onBack(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, onBack])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const resp = await fetch(resultImage)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `AI校园写真_${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      alert('下载失败，请重试')
    } finally {
      setIsDownloading(false)
    }
  }, [resultImage])

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
            src={resultImage}
            alt="AI合成写真"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
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
              onClick={() => setShowPrintConfirm(true)}
              style={{
                width: '100%', height: 48,
                background: '#e8a000', color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <span>🖨</span>
              提交现场打印
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

      {/* 打印确认弹窗 */}
      {showPrintConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }} onClick={() => setShowPrintConfirm(false)}>
          <div style={{
            background: 'white', borderRadius: 16, padding: 36,
            maxWidth: 320, width: '90%', textAlign: 'center',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖨️</div>
            <h2 style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 }}>
              已提交打印
            </h2>
            <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
              请到打印台取照片
            </p>
            <button onClick={() => setShowPrintConfirm(false)} style={{
              width: '100%', padding: 12,
              background: '#1565C0', border: 'none', borderRadius: 8,
              color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}>
              好的
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
