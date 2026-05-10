import { useState, useEffect } from 'react'

const collegeLogo = new URL('../assets/college-logo.png', import.meta.url).href
const registerQR = new URL('../assets/register-qr .png', import.meta.url).href

const BG_IMAGES = [
  new URL('../assets/backgrounds/bg (1).jpg', import.meta.url).href,
  new URL('../assets/backgrounds/bg (2).jpg', import.meta.url).href,
  new URL('../assets/backgrounds/bg (3).jpg', import.meta.url).href,
  new URL('../assets/backgrounds/bg (4).jpg', import.meta.url).href,
  new URL('../assets/backgrounds/bg (5).jpg', import.meta.url).href,
  new URL('../assets/backgrounds/bg (6).jpg', import.meta.url).href,
]

interface Props {
  onStart: () => void
  onCamera: () => void
}

export default function HomePage({ onStart, onCamera }: Props) {
  const [currentBg, setCurrentBg] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBg(prev => (prev + 1) % BG_IMAGES.length)
    }, 3000)
    return () => clearInterval(timer)
  }, [])

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
        {/* 左：学校Logo */}
        <img
          src={collegeLogo}
          alt="学院Logo"
          style={{
            width: 80, height: 80, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
          }}
        />

        {/* 右：标题文字 */}
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
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
        }}>
          {/* 二维码白色卡片 */}
          <div style={{
            width: 160, height: 160,
            background: 'white', borderRadius: 16,
            padding: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            margin: '0 auto 20px',
          }}>
            <img
              src={registerQR}
              alt="登记二维码"
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          {/* 扫码文字 */}
          <p style={{
            fontSize: 24,
            color: 'white',
            fontWeight: 500,
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            textAlign: 'center',
            margin: '0 0 24px',
            fontFamily: '"SimHei", "黑体", sans-serif',
          }}>
            手机扫码 · 免费制作校园AI纪念照
          </p>

          {/* 三个横排按钮 */}
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            {/* 信息登记 */}
            <button
              onClick={onStart}
              style={{
                borderRadius: 30,
                padding: '16px 32px',
                fontSize: 18, fontWeight: 500,
                border: '1.5px solid rgba(255,255,255,0.5)',
                background: 'rgba(10,40,110,0.6)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: '"SimHei", "黑体", sans-serif',
              }}
            >
              📋 信息登记
            </button>

            {/* 立即拍摄 - 金色主按钮 */}
            <button
              onClick={onCamera}
              style={{
                borderRadius: 30,
                padding: '16px 32px',
                fontSize: 18, fontWeight: 700,
                border: 'none',
                background: 'linear-gradient(135deg, #C9A84C, #FFE566)',
                color: '#0d2a6e',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(201,168,76,0.5)',
                transition: 'all 0.2s',
                fontFamily: '"SimHei", "黑体", sans-serif',
              }}
            >
              📷 立即拍摄
            </button>

            {/* 作品展示 */}
            <button
              onClick={onStart}
              style={{
                borderRadius: 30,
                padding: '16px 32px',
                fontSize: 18, fontWeight: 500,
                border: '1.5px solid rgba(255,255,255,0.5)',
                background: 'rgba(10,40,110,0.6)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: '"SimHei", "黑体", sans-serif',
              }}
            >
              🖼 作品展示
            </button>
          </div>
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
