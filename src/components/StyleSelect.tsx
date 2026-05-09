import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { PHOTO_STYLES } from '../data/styles'

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

const STYLE_GRADIENTS: Record<string, string> = {
  scholar: 'linear-gradient(135deg, #667eea, #764ba2)',
  cyber: 'linear-gradient(135deg, #0f0c29, #302b63)',
  guochao: 'linear-gradient(135deg, #c94b4b, #4b134f)',
  astronaut: 'linear-gradient(135deg, #4facfe, #00f2fe)',
  geek: 'linear-gradient(135deg, #43e97b, #38f9d7)',
  graduate: 'linear-gradient(135deg, #fa709a, #fee140)',
}

interface Props {
  onSelect: (styleId: string) => void
  onBack: () => void
}

export default function StyleSelect({ onSelect, onBack }: Props) {
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
      transition={{ duration: 0.4 }}
      className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 pt-20 pb-10"
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

      {/* 标题 - 与初始页相同的动画效果 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-center mb-10"
      >
        <div className="relative mb-4">
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
              className="inline-block text-5xl md:text-6xl lg:text-7xl leading-[1.05] text-ink"
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
              className="inline-block text-5xl md:text-6xl lg:text-7xl leading-[1.05] text-ink"
            >
              校园写真
            </motion.span>
          </div>
        </div>
        <p className="text-lg text-muted">
          选择你喜欢的写真风格
        </p>
      </motion.div>

      {/* 风格卡片网格 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-5 max-w-4xl w-full">
        {PHOTO_STYLES.map((style, i) => (
          <motion.button
            key={style.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(style.id)}
            className="rounded-2xl text-center group hover:shadow-xl transition-all p-6 min-h-[160px] flex flex-col items-center justify-center relative overflow-hidden"
            style={{
              background: STYLE_GRADIENTS[style.id] || 'linear-gradient(135deg, #333, #555)',
            }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent)',
                transform: 'translate(30%, -30%)',
              }}
            />
            <div className="relative z-10">
              <div className="text-5xl mb-3 drop-shadow-lg">
                {style.emoji}
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-white mb-1 drop-shadow-md">
                {style.name}
              </h3>
              <p className="text-base text-white/80 drop-shadow-sm">
                {style.description}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
