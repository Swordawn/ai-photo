import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onStartGeneration: (signal: AbortSignal) => Promise<string>
  onResult: (generatedPhoto: string) => void
  onError: (originalPhoto: string, message: string) => void
  originalPhoto: string
}

const MESSAGES = [
  '正在分析面部特征...',
  'AI 风格融合中...',
  '生成专属形象...',
  '风格渲染中...',
  '即将完成...',
]

export default function ProcessingPage({ onStartGeneration, onResult, onError, originalPhoto }: Props) {
  const [msgIndex, setMsgIndex] = useState(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    const controller = new AbortController()

    const msgTimer = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % MESSAGES.length)
    }, 2500)

    onStartGeneration(controller.signal)
      .then(resultUrl => {
        if (!cancelledRef.current) onResult(resultUrl)
      })
      .catch(err => {
        if (!cancelledRef.current && err.name !== 'AbortError') {
          console.error('Generation failed:', err)
          onError(originalPhoto, err.message || 'AI服务暂时不可用')
        }
      })

    return () => {
      cancelledRef.current = true
      controller.abort()
      clearInterval(msgTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex flex-col items-center justify-center min-h-screen px-8 pt-20"
      style={{
        background: 'linear-gradient(135deg, #fef9f0 0%, #fde8d8 50%, #fdf0e8 100%)',
      }}
    >
      {/* 背景光晕 */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(204,120,92,0.12), transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* 加载动画 - 150px */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-10 relative z-10"
      >
        <div className="relative" style={{ width: 150, height: 150 }}>
          <div className="absolute inset-0 rounded-full border-4 border-hairline" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
            style={{ animationDuration: '2s' }}
          />
          <div className="absolute inset-5 rounded-full border-2 border-hairline-soft" />
          <div
            className="absolute rounded-full border-2 border-transparent border-b-accent-teal animate-spin"
            style={{
              inset: 20,
              animationDuration: '3s',
              animationDirection: 'reverse',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-6xl text-primary animate-pulse">
              auto_awesome
            </span>
          </div>
        </div>
      </motion.div>

      {/* 状态消息 */}
      <div className="h-16 mb-6 relative z-10">
        <AnimatePresence mode="wait">
          <motion.p
            key={msgIndex}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="text-2xl md:text-3xl font-semibold text-ink text-center"
          >
            {MESSAGES[msgIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* 提示文字 */}
      <p className="text-lg text-muted text-center relative z-10">
        AI 技术正在为您生成专属写真，请稍候...
      </p>
    </motion.div>
  )
}
