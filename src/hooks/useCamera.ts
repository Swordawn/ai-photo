import { useRef, useCallback, useState, useEffect } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {
          // play() 被中断（组件卸载/重挂载）静默忽略
        }
      }
      setIsActive(true)
    } catch (err) {
      console.error('Camera access denied:', err)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsActive(false)
  }, [])

  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null

    // 限制最大尺寸，减小文件体积
    const maxW = 1280
    const w = Math.min(video.videoWidth, maxW)
    const h = Math.round(w * video.videoHeight / video.videoWidth)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  return { videoRef, canvasRef, startCamera, stopCamera, capturePhoto, isActive }
}
