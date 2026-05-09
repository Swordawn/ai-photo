import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCamera } from '../hooks/useCamera'
import { PHOTO_STYLES } from '../data/styles'

interface Props {
  selectedStyle: string | null
  onCapture: (photo: string) => void
  onBack: () => void
}

export default function CameraCapture({ selectedStyle, onCapture, onBack }: Props) {
  const { videoRef, canvasRef, startCamera, stopCamera, capturePhoto } = useCamera()
  const [countdown, setCountdown] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const styleName = PHOTO_STYLES.find(s => s.id === selectedStyle)?.name || ''

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const handleShutter = useCallback(() => {
    if (countdown !== null) return
    setCountdown(3)

    const tick = (n: number) => {
      if (n === 0) {
        setCountdown(null)
        setFlash(true)
        setTimeout(() => setFlash(false), 600)
        const photo = capturePhoto()
        if (photo) onCapture(photo)
        return
      }
      setCountdown(n)
      setTimeout(() => tick(n - 1), 1000)
    }
    tick(3)
  }, [countdown, capturePhoto, onCapture])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex flex-col items-center justify-center min-h-screen px-8 pt-20 pb-12"
      style={{
        background: 'linear-gradient(135deg, #fef9f0 0%, #fde8d8 50%, #fdf0e8 100%)',
      }}
    >
      {/* 返回按钮 */}
      <div className="fixed top-16 left-6 z-50">
        <button onClick={onBack} className="btn-back">
          ← 返回
        </button>
      </div>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-center mb-6"
      >
        <h2 className="font-['Cormorant_Garamond'] text-4xl md:text-5xl font-normal tracking-[-0.02em] text-ink mb-2">
          请站在摄像头前
        </h2>
        <p className="text-lg text-muted">
          {styleName && `当前风格：${styleName}`}
        </p>
      </motion.div>

      {/* 摄像头预览框 - 大尺寸 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="relative w-full max-w-2xl aspect-[4/5] mb-8"
      >
        {/* 四角L型边框 */}
        {[
          { top: -4, left: -4, borderDir: 'top-left' },
          { top: -4, right: -4, borderDir: 'top-right' },
          { bottom: -4, left: -4, borderDir: 'bottom-left' },
          { bottom: -4, right: -4, borderDir: 'bottom-right' },
        ].map((pos, i) => (
          <div
            key={i}
            className="absolute z-20 pointer-events-none"
            style={{
              top: pos.top, bottom: (pos as any).bottom,
              left: pos.left, right: pos.right,
              width: 60, height: 60,
              borderTop: (i < 2) ? '4px solid #cc785c' : 'none',
              borderBottom: (i >= 2) ? '4px solid #cc785c' : 'none',
              borderLeft: (i % 2 === 0) ? '4px solid #cc785c' : 'none',
              borderRight: (i % 2 === 1) ? '4px solid #cc785c' : 'none',
              borderRadius: 12,
            }}
          />
        ))}

        {/* 视频区域 */}
        <div className="w-full h-full rounded-2xl overflow-hidden bg-surface-dark">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            autoPlay
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* 人脸轮廓引导线 */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            viewBox="0 0 500 600"
          >
            <ellipse
              cx="250" cy="240"
              rx="110" ry="145"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="3"
              strokeDasharray="12 8"
            />
            {/* 肩部引导 */}
            <path
              d="M140 420 Q250 360 360 420"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              strokeDasharray="10 8"
            />
          </svg>
        </div>

        {/* 风格标签 */}
        {styleName && (
          <div className="absolute top-6 left-6 z-20 px-6 py-3 rounded-xl bg-surface-dark/80 text-on-dark text-lg font-medium">
            {styleName}
          </div>
        )}

        {/* 倒计时覆盖层 */}
        <AnimatePresence>
          {countdown !== null && countdown > 0 && (
            <motion.div
              key={countdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center z-30 bg-ink/30"
            >
              <span className="font-['Cormorant_Garamond'] text-[200px] font-bold text-on-primary drop-shadow-2xl">
                {countdown}
              </span>
            </motion.div>
          )}
          {countdown === 0 && (
            <motion.div
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center z-30 bg-ink/30"
            >
              <span className="font-['Cormorant_Garamond'] text-[160px] font-bold text-primary drop-shadow-2xl">
                拍！
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 闪光 */}
        {flash && (
          <div className="absolute inset-0 bg-white animate-flash pointer-events-none z-40 rounded-2xl" />
        )}
      </motion.div>

      {/* 快门按钮 - 超大触控区 */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleShutter}
        disabled={countdown !== null}
        className="btn-primary min-w-[200px] disabled:opacity-50"
      >
        {countdown !== null ? '拍摄中...' : '拍照'}
      </motion.button>
    </motion.div>
  )
}
