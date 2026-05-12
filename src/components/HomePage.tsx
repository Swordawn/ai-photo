import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const collegeLogo = 'https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com/assets/college-logo.png'

const COS_BASE = 'https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com'

const BG_IMAGES = [
  `${COS_BASE}/backgrounds/bg%20(1).jpg`,
  `${COS_BASE}/backgrounds/bg%20(2).jpg`,
  `${COS_BASE}/backgrounds/bg%20(3).jpg`,
  `${COS_BASE}/backgrounds/bg%20(4).jpg`,
  `${COS_BASE}/backgrounds/bg%20(5).jpg`,
  `${COS_BASE}/backgrounds/bg%20(6).jpg`,
]

interface Registration {
  id: number
  name: string
  class_name: string
}

interface Props {
  onStart: () => void
  onCamera: () => void
  registration: Registration | null
  onClearRegistration: () => void
}

export default function HomePage({ onStart: _, onCamera, registration, onClearRegistration }: Props) {
  const [currentBg, setCurrentBg] = useState(0)
  const [countdown, setCountdown] = useState(90)

  // 背景轮播
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBg(prev => (prev + 1) % BG_IMAGES.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

  // 登记倒计时（纯展示，超时由 App.tsx 统一处理）
  useEffect(() => {
    if (!registration) { setCountdown(90); return }
    setCountdown(90)
    const timer = setInterval(() => {
      setCountdown(prev => prev <= 1 ? 0 : prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [registration])

  // 动态 QR 码 URL（优先使用公网域名）
  const PUBLIC_HOST = import.meta.env.VITE_PUBLIC_HOST
  const qrUrl = PUBLIC_HOST
    ? `https://${PUBLIC_HOST}/register`
    : `${window.location.protocol}//${window.location.host}/register`

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#0d2a6e',
    }}>
      {/* ========== 顶部 Header ========== */}
      <header style={{
        backgroundColor: '#0d2a6e',
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexShrink: 0,
      }}>
        <img
          src={collegeLogo}
          alt="学院Logo"
          style={{
            width: 80, height: 80, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
          }}
        />
        <div>
          <h1 style={{
            fontSize: 52,
            fontWeight: 900,
            fontFamily: '"Noto Serif SC", serif',
            background: 'linear-gradient(180deg, #FFE566, #C9A84C)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            lineHeight: 1.2,
          }}>
            七十载匠心砺技展风采
          </h1>
          <p style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.1em',
            marginTop: 8,
            fontFamily: '"SimHei", "黑体", sans-serif',
          }}>
            —— 河南应用技术职业学院 · 人工智能与信息技术学院 ——
          </p>
        </div>
      </header>

      {/* ========== 中间主体区 ========== */}
      <div style={{
        position: 'relative',
        height: '70vh',
        overflow: 'hidden',
      }}>
        {/* 背景轮播 */}
        {BG_IMAGES.map((img, index) => (
          <img
            key={index}
            src={img}
            alt=""
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'low'}
            decoding="async"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              opacity: index === currentBg ? 1 : 0,
              transition: 'opacity 1s ease-in-out',
              pointerEvents: 'none',
              backgroundColor: '#0d2a6e',
            }}
          />
        ))}

        {/* 顶部渐变蒙层 */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(180deg, #0d2a6e 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 2,
        }} />

        {/* 底部渐变蒙层 */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(0deg, #0d2a6e 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 2,
        }} />

        {/* 中央内容 */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 40,
          width: '100%',
          justifyContent: 'center',
          padding: '0 40px',
        }}>
          {/* QR 码（始终显示） */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <div style={{
              width: 180, height: 180,
              background: 'white', borderRadius: 16,
              padding: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <QRCodeSVG
                value={qrUrl}
                size={156}
                level="M"
                bgColor="#ffffff"
                fgColor="#0d2a6e"
              />
            </div>
            <p style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 16,
              textAlign: 'center',
              fontFamily: '"SimHei", "黑体", sans-serif',
            }}>
              手机扫码登记
            </p>
          </div>

          {/* 登记信息区（有人登记时显示） */}
          {registration && (
            <div style={{
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 20,
              padding: '32px 40px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
              textAlign: 'center',
              minWidth: 260,
            }}>
              <p style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>
                欢迎使用 AI 校园写真
              </p>
              <h2 style={{
                fontSize: 24, fontWeight: 700, color: '#0d2a6e',
                margin: '0 0 4px',
              }}>
                {registration.name}
              </h2>
              <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
                {registration.class_name}
              </p>
              <button
                onClick={onCamera}
                style={{
                  borderRadius: 30,
                  padding: '16px 40px',
                  fontSize: 18, fontWeight: 700,
                  border: 'none',
                  background: 'linear-gradient(135deg, #C9A84C, #FFE566)',
                  color: '#0d2a6e',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(201,168,76,0.5)',
                  fontFamily: '"SimHei", "黑体", sans-serif',
                  display: 'block',
                  margin: '0 auto 12px',
                }}
              >
                📷 开始拍照
              </button>

              {/* 跳过按钮 + 倒计时 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <button
                  onClick={onClearRegistration}
                  style={{
                    background: 'none', border: 'none',
                    color: '#999', fontSize: 12, cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  跳过
                </button>
                <span style={{ fontSize: 11, color: '#bbb' }}>
                  {countdown}秒后自动清除
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========== 底部信息区 ========== */}
      <footer style={{
        backgroundColor: '#0d2a6e',
        padding: '16px 40px',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <h2 style={{
          fontSize: 22,
          fontWeight: 600,
          color: 'white',
          margin: '0 0 6px',
          fontFamily: '"SimHei", "黑体", sans-serif',
        }}>
          React + Vite + AI | 智能写真系统
        </h2>
        <p style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: 1,
          fontFamily: '"SimHei", "黑体", sans-serif',
        }}>
          匠心砺技展风采 | 河南应用技术职业学院 · 人工智能与信息技术学院 2026年职业教育宣传周实训成果展示
        </p>
      </footer>
    </div>
  )
}
