import { motion } from 'framer-motion'

interface Step {
  id: string
  label: string
}

const STEPS: Step[] = [
  { id: 'styleSelect', label: '选风格' },
  { id: 'camera', label: '拍照' },
  { id: 'confirm', label: '确认' },
  { id: 'processing', label: '生成中' },
  { id: 'result', label: '完成' },
]

interface Props {
  currentStep: string
}

export default function StepIndicator({ currentStep }: Props) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep)
  const progress = ((currentIndex + 1) / STEPS.length) * 100

  return (
    <div className="fixed top-0 left-0 right-0 z-40">
      <div className="h-[3px] bg-hairline/40 w-full">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-r-full"
          style={{
            background: 'linear-gradient(90deg, #cc785c, #e8a55a)',
          }}
        />
      </div>
      {currentIndex >= 0 && (
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center pt-2 pb-1"
        >
          <span className="font-['Cormorant_Garamond'] text-base text-muted tracking-wide">
            {currentIndex + 1} / {STEPS.length} — {STEPS[currentIndex].label}
          </span>
        </motion.div>
      )}
    </div>
  )
}
