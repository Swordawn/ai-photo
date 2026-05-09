import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { PHOTO_STYLES } from '../data/styles'
import { uploadImage } from '../utils/imageUpload'

const TIMEOUT_SECONDS = 60

interface Props {
  originalPhoto: string
  generatedPhoto: string
  selectedStyle: string | null
  errorMsg: string | null
  onRetry: () => void
  onTimeout: () => void
}

export default function ResultPage({ originalPhoto, generatedPhoto, selectedStyle, errorMsg, onRetry, onTimeout }: Props) {
  const style = PHOTO_STYLES.find(s => s.id === selectedStyle)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [isUploading, setIsUploading] = useState(true)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS)

  useEffect(() => {
    const doUpload = async () => {
      setIsUploading(true)
      setUploadError(null)
      try {
        const result = await uploadImage(generatedPhoto)
        if (result.success && result.url) {
          setDownloadUrl(result.url)
        } else {
          throw new Error(result.error || '上传失败')
        }
      } catch {
        setUploadError('上传失败，请使用直接下载')
        setDownloadUrl('')
      } finally {
        setIsUploading(false)
      }
    }
    doUpload()
  }, [generatedPhoto])

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

  const resetCountdown = useCallback(() => {
    setCountdown(TIMEOUT_SECONDS)
  }, [])

  const handleDirectDownload = useCallback(() => {
    resetCountdown()
    const link = document.createElement('a')
    link.href = generatedPhoto
    link.download = `ai-photo-${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [generatedPhoto, resetCountdown])

  const handleRetry = useCallback(() => {
    resetCountdown()
    onRetry()
  }, [onRetry, resetCountdown])

  const isLastThree = countdown <= 3

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex flex-col h-screen"
      style={{
        background: 'linear-gradient(135deg, #fef9f0 0%, #fde8d8 50%, #fdf0e8 100%)',
      }}
    >
      {/* ====== 主内容区 - 左右结构 ====== */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-5 px-6 pt-14 pb-4 min-h-0">

        {/* 左侧 - 作品大图 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex items-center justify-center min-h-0 max-w-[65%]"
        >
          <div
            className="relative rounded-3xl overflow-hidden max-w-full max-h-full"
            style={{
              boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
            }}
          >
            <img
              src={generatedPhoto}
              alt="AI生成"
              className="block max-w-full max-h-[70vh] object-contain"
            />

            {/* ✨ 标记 */}
            <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center">
              <span className="text-xs">✨</span>
            </div>

            {/* 原片缩略图 */}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/80 shadow-md">
                <img src={originalPhoto} alt="原片" className="w-full h-full object-cover" />
              </div>
              <span className="text-white/90 text-[10px] font-medium bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm">
                原片
              </span>
            </div>
          </div>
        </motion.div>

        {/* 右侧 - 信息栏 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-full md:w-[280px] flex flex-col items-center justify-center gap-5 flex-shrink-0"
        >
          {/* 风格标签 */}
          {style && (
            <div className="text-center">
              <p className="font-['Cormorant_Garamond'] text-2xl text-ink tracking-wide">
                {style.emoji} {style.name}
              </p>
              <p className="text-sm text-muted-soft mt-1">
                {style.description}
              </p>
            </div>
          )}

          {/* 二维码卡片 - 统一宽度 */}
          <div className="card p-4 rounded-2xl text-center w-full">
            <p className="text-sm font-medium text-ink mb-3">扫码保存到手机</p>
            {isUploading ? (
              <div className="w-[180px] h-[180px] rounded-lg bg-gray-100 animate-pulse flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-2xl text-muted animate-spin">sync</span>
              </div>
            ) : downloadUrl ? (
              <div className="bg-white p-2.5 rounded-xl shadow-sm inline-block">
                <QRCodeSVG value={downloadUrl} size={180} level="L" includeMargin={false} fgColor="#141413" bgColor="#ffffff" />
              </div>
            ) : (
              <div className="w-[180px] h-[180px] rounded-lg bg-gray-50 flex items-center justify-center mx-auto">
                <span className="text-muted text-sm">{uploadError || '暂无链接'}</span>
              </div>
            )}
            {downloadUrl && <p className="text-[11px] text-muted-soft mt-2">手机扫码保存高清图</p>}
            {uploadError && <p className="text-[11px] text-error mt-2">{uploadError}</p>}
          </div>

          {/* 按钮 - 胶囊式，与二维码同宽 */}
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={handleDirectDownload}
              className="flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary text-sm font-semibold shadow-md hover:bg-primary-active transition-colors"
              style={{ width: 280, height: 40 }}
            >
              ⬇️ 直接下载
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center justify-center gap-2 rounded-full bg-white/80 border border-hairline text-ink text-sm font-medium hover:bg-white transition-colors shadow-sm"
              style={{ width: 280, height: 40 }}
            >
              再来一次
            </button>
          </div>

          {/* 错误提示 */}
          {errorMsg && (
            <div className="px-4 py-2 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm text-center">
              {errorMsg}（显示原图）
            </div>
          )}
        </motion.div>
      </div>

      {/* ====== 倒计时 - 低调角落 ====== */}
      <div
        className="fixed bottom-3 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: isLastThree ? 'rgba(198,69,69,0.08)' : 'rgba(0,0,0,0.04)',
        }}
      >
        <span
          className="text-[11px] tabular-nums"
          style={{
            color: isLastThree ? '#c64545' : '#b0ada6',
            animation: isLastThree ? 'shake 0.5s ease-in-out infinite' : 'none',
          }}
        >
          {countdown}s
        </span>
        <span className="text-[11px]" style={{ color: '#c8c5be' }}>
          后返回
        </span>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-1px); }
          75% { transform: translateX(1px); }
        }
      `}</style>
    </motion.div>
  )
}
