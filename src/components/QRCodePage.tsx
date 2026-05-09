import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  photoUrl: string
  onTimeout: () => void
  onBack: () => void
}

const TOTAL_SECONDS = 15
const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const DEMO_QR_URL = 'https://ai-photo.example.com/demo'

export default function QRCodePage({ photoUrl, onTimeout, onBack }: Props) {
  const [countdown, setCountdown] = useState(TOTAL_SECONDS)

  // base64 太长无法编码为QR码，改用演示URL
  const isBase64 = photoUrl.startsWith('data:')
  const qrValue = isBase64 ? DEMO_QR_URL : photoUrl

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          onTimeout()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [onTimeout])

  const progress = ((TOTAL_SECONDS - countdown) / TOTAL_SECONDS) * CIRCUMFERENCE

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex flex-col items-center justify-center h-full"
    >
      {/* 聚光灯光晕 */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 400, height: 400,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -60%)',
          background: 'radial-gradient(circle, rgba(255,255,255,0.08), transparent)',
          filter: 'blur(60px)',
        }}
      />

      <h2 className="text-gradient text-3xl font-black mb-1 tracking-[0.05em]">
        扫码保存到手机
      </h2>
      <p className="text-white/30 text-sm tracking-[0.2em] font-light mb-8">
        {isBase64 ? '演示模式 · 真实API接入后可用' : 'Scan to Save Your Photo'}
      </p>

      {/* 二维码卡片 */}
      <div className="relative mb-8">
        <div
          className="absolute -inset-3 rounded-3xl pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,165,0,0.1), rgba(255,215,0,0.3))',
            filter: 'blur(1px)',
          }}
        />
        <div
          className="relative p-6 rounded-3xl"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
          }}
        >
          <QRCodeSVG value={qrValue} size={240} level="M" bgColor="transparent" fgColor="#1a1a2e" />
        </div>
      </div>

      {/* 圆形倒计时 */}
      <div className="relative w-24 h-24 mb-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle
            cx="50" cy="50" r={RADIUS}
            fill="none"
            stroke="url(#countdownGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={progress}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
          <defs>
            <linearGradient id="countdownGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="100%" stopColor="#e0c3fc" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white/70">{countdown}</span>
        </div>
      </div>

      <p className="text-xs text-white/25 font-light tracking-wider mb-8">
        {countdown}秒后自动返回
      </p>

      <motion.button
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.03 }}
        onClick={onBack}
        className="btn-ghost text-sm"
      >
        返回首页
      </motion.button>
    </motion.div>
  )
}
