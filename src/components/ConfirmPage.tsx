import { motion } from 'framer-motion'
import { PHOTO_STYLES } from '../data/styles'

interface Props {
  photo: string
  selectedStyle: string | null
  onConfirm: () => void
  onRetake: () => void
  onChangeStyle: () => void
}

export default function ConfirmPage({ photo, selectedStyle, onConfirm, onRetake, onChangeStyle }: Props) {
  const style = PHOTO_STYLES.find(s => s.id === selectedStyle)

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
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-center mb-8"
      >
        <h2 className="font-['Cormorant_Garamond'] text-4xl md:text-5xl font-normal tracking-[-0.02em] text-ink mb-2">
          AI 校园写真
        </h2>
        <p className="text-lg text-muted">
          请检查照片是否满意，确认后将开始 AI 生成
        </p>
      </motion.div>

      {/* 主内容区 - 50/50 布局 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch"
      >
        {/* 左侧 - 照片预览 */}
        <div className="flex flex-col">
          <div className="card-dark p-3 rounded-2xl flex-1">
            <div className="relative rounded-xl overflow-hidden h-full">
              <img
                src={photo}
                alt="拍摄照片"
                className="w-full h-full object-cover block"
                style={{ minHeight: '350px', maxHeight: '55vh' }}
              />
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-surface-dark/80 text-on-dark text-xs font-medium">
                你的照片
              </div>
            </div>
          </div>
        </div>

        {/* 右侧 - 风格信息和操作 */}
        <div className="flex flex-col gap-4">
          {/* 风格卡片 */}
          {style && (
            <div className="card p-5 rounded-2xl text-center">
              <div className="text-4xl mb-2">{style.emoji}</div>
              <h3 className="text-xl font-semibold text-ink mb-1">
                {style.name}
              </h3>
              <p className="text-base text-muted">
                {style.description}
              </p>
            </div>
          )}

          {/* 操作提示 */}
          <div className="card p-4 rounded-2xl">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-xl mt-0.5">info</span>
              <div>
                <p className="text-base text-ink font-medium mb-1">
                  AI 将基于此照片生成写真
                </p>
                <p className="text-sm text-muted">
                  生成过程约需 15-30 秒，请耐心等待
                </p>
              </div>
            </div>
          </div>

          {/* 操作按钮 - 等宽 */}
          <div className="flex flex-col gap-3 mt-auto">
            <button onClick={onConfirm} className="btn-primary w-full">
              确认并开始生成
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={onRetake} className="btn-secondary w-full">
                重新拍照
              </button>
              <button onClick={onChangeStyle} className="btn-secondary w-full">
                更换风格
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
