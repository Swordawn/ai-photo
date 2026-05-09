import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const titleTransition = {
  duration: 2.5,
  ease: [0.25, 0.1, 0.25, 1.0] as [number, number, number, number],
}

const CYCLE_FONTS = [
  '"Noto Serif SC", serif',
  '"ZCOOL XiaoWei", serif',
  '"Ma Shan Zheng", cursive',
  '"ZCOOL QingKe HuangYou", cursive',
  '"Noto Sans SC", sans-serif',
]

interface Props {
  onStart: () => void
}

export default function AttractScreen({ onStart }: Props) {
  const [fontIndex, setFontIndex] = useState(0)
  const [fontOpacity, setFontOpacity] = useState(1)
  const [cycling, setCycling] = useState(false)

  // 入场动画完成后（2.8s）启动字体循环
  useEffect(() => {
    const startTimer = setTimeout(() => setCycling(true), 2800)
    return () => clearTimeout(startTimer)
  }, [])

  // 字体循环：每2秒切换，淡出0.3s → 换字体 → 淡入0.3s
  useEffect(() => {
    if (!cycling) return
    const interval = setInterval(() => {
      setFontOpacity(0)
      setTimeout(() => {
        setFontIndex(prev => (prev + 1) % CYCLE_FONTS.length)
        setFontOpacity(1)
      }, 300)
    }, 2000)
    return () => clearInterval(interval)
  }, [cycling])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 flex flex-col items-center justify-between min-h-screen px-8 pt-12 pb-12"
      style={{
        background: 'linear-gradient(135deg, #fef9f0 0%, #fde8d8 50%, #fdf0e8 100%)',
      }}
    >
      {/* 右下角光晕装饰 */}
      <div
        className="fixed z-0 pointer-events-none"
        style={{
          width: 500,
          height: 500,
          bottom: -100,
          right: -100,
          background: 'radial-gradient(circle, rgba(210,120,80,0.15), transparent)',
          filter: 'blur(60px)',
        }}
      />

      {/* 副标题 - 顶部居中 */}
      <motion.p
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.8, duration: 0.8, ease: 'easeOut' }}
        className="text-base md:text-lg text-body text-center tracking-wide"
      >
        人工智能与信息技术学院 · 职教周技能展演 2026
      </motion.p>

      {/* 标题 - 居中偏上 */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ transform: 'translateY(-8%)' }}
      >
        {/* 光晕背景 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 -inset-x-20 -inset-y-10"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(204,120,92,0.08), transparent 70%)',
          }}
        />

        {/* 标题文字 - 拆分动画 + 字体切换 */}
        <div
          className="text-center"
          style={{
            fontFamily: CYCLE_FONTS[fontIndex],
            opacity: fontOpacity,
            transition: 'opacity 0.3s ease, font-family 0.01s',
          }}
        >
          <motion.span
            initial={{
              opacity: 0,
              filter: 'blur(8px)',
              fontWeight: 100,
              letterSpacing: '0.3em',
              y: 20,
            }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              fontWeight: 700,
              letterSpacing: '0.02em',
              y: 0,
            }}
            transition={titleTransition}
            className="inline-block text-7xl md:text-8xl lg:text-9xl leading-[1.05] text-ink"
          >
            AI&nbsp;
          </motion.span>
          <motion.span
            initial={{
              opacity: 0,
              filter: 'blur(8px)',
              fontWeight: 100,
              letterSpacing: '0.3em',
              y: 20,
            }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              fontWeight: 700,
              letterSpacing: '0.02em',
              y: 0,
            }}
            transition={{ ...titleTransition, delay: 0.3 }}
            className="inline-block text-7xl md:text-8xl lg:text-9xl leading-[1.05] text-ink"
          >
            校园写真
          </motion.span>
        </div>
      </div>

      {/* 主按钮 - 标题和 Slogan 的绝对中间 */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: '62%' }}
      >
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 3.5, duration: 0.6, type: 'spring', stiffness: 200, damping: 20 }}
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          className="relative group"
        >
          <div className="absolute inset-0 bg-primary rounded-full blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative bg-primary hover:bg-primary-active text-on-primary text-xl md:text-2xl font-medium px-12 py-5 md:px-16 md:py-6 rounded-full shadow-lg transition-all min-h-[70px] min-w-[220px] flex items-center justify-center">
            触摸开始
          </div>
        </motion.button>
      </div>

      {/* Slogan - 底部 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4.0, duration: 0.6 }}
        className="flex items-center gap-3 text-muted"
      >
        <div className="flex -space-x-2">
          <div className="w-7 h-7 rounded-full bg-primary/60 border-2 border-white" />
          <div className="w-7 h-7 rounded-full bg-accent-teal/60 border-2 border-white" />
          <div className="w-7 h-7 rounded-full bg-accent-amber/60 border-2 border-white" />
        </div>
        <span className="text-base text-muted-soft tracking-wide">
          AI 定义你的校园形象
        </span>
      </motion.div>
    </motion.div>
  )
}
