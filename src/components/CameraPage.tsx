import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import { FRAMES, getFrameSrc } from '../data/frames'

const ghostBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 20, padding: '6px 16px',
  color: 'white', fontSize: 13, cursor: 'pointer',
}

interface Props {
  onCapture: (photo: string) => void
  onBack: () => void
  selectedFrame: string | null
  onSelectFrame: (frameId: string) => void
}

export default function CameraPage({ onCapture, onBack: _, selectedFrame, onSelectFrame }: Props) {
  const webcamRef = useRef<Webcam>(null)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [flash, setFlash] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setCountdown(null)
  }, [])

  const startCountdown = useCallback(() => {
    if (!isCameraReady || captured || countdown !== null) return
    setCountdown(3)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null) return null
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          countdownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [isCameraReady, captured, countdown])

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const currentFrameSrc = selectedFrame ? getFrameSrc(selectedFrame) : null

  const handleCapture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (imageSrc) {
      setFlash(true)
      setCaptured(imageSrc)
      setTimeout(() => setFlash(false), 600)
    }
  }, [])

  useEffect(() => {
    if (countdown === 0) {
      handleCapture()
      setCountdown(null)
    }
  }, [countdown, handleCapture])

  const handleRetake = useCallback(() => {
    setCaptured(null)
  }, [])

  const handleNext = useCallback(() => {
    if (captured) onCapture(captured)
  }, [captured, onCapture])

  return (
    <div style={{ height: '100vh', display: 'flex', backgroundColor: '#111827' }}>
      <style>{`
        @keyframes countPulse {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      {/* ===== 左侧：摄像头区 ===== */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#111827', padding: '12px 20px',
      }}>
        {/* 照片容器 */}
        <div style={{
          position: 'relative',
          height: 'calc(100vh - 100px)',
          aspectRatio: '2/3',
          overflow: 'hidden',
          borderRadius: 16,
        }}>
          {/* 底层：摄像头或照片 */}
          {captured ? (
            <img src={captured} alt="拍摄照片" style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%', objectFit: 'cover',
              transform: 'scaleX(-1)',
            }} />
          ) : (
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.9}
              videoConstraints={{ width: 720, height: 1080, facingMode }}
              onUserMedia={() => setIsCameraReady(true)}
              mirrored={false}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', transform: 'scaleX(-1)',
              }}
            />
          )}

          {/* 相框叠加 */}
          {currentFrameSrc && (
            <img src={currentFrameSrc} alt="相框" style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'fill', pointerEvents: 'none', zIndex: 10,
            }} />
          )}

          {/* 人脸引导椭圆 */}
          {!captured && isCameraReady && (
            <div style={{
              position: 'absolute',
              top: '20%', left: '50%',
              transform: 'translateX(-50%)',
              width: '45%', height: '35%',
              border: '2px dashed rgba(255,255,255,0.4)',
              borderRadius: '50%', zIndex: 11,
              pointerEvents: 'none',
            }} />
          )}

          {/* 倒计时覆盖层 */}
          {countdown !== null && countdown > 0 && (
            <div
              onClick={cancelCountdown}
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.35)',
                zIndex: 25, cursor: 'pointer',
              }}
            >
              {/* 圆形进度环 */}
              <svg
                width="180" height="180"
                style={{ position: 'absolute', transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx="90" cy="90" r="82"
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="4"
                />
                <circle
                  cx="90" cy="90" r="82"
                  fill="none"
                  stroke="white"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 82}
                  strokeDashoffset={2 * Math.PI * 82 * (countdown / 3)}
                  style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                />
              </svg>
              {/* 数字 */}
              <span
                key={countdown}
                style={{
                  color: 'white',
                  fontSize: 80,
                  fontWeight: 700,
                  textShadow: '0 0 30px rgba(255,255,255,0.5), 0 0 60px rgba(255,255,255,0.2)',
                  animation: 'countPulse 1s ease-out',
                  zIndex: 1,
                }}
              >
                {countdown}
              </span>
              {/* 取消提示 */}
              <p style={{
                position: 'absolute', bottom: 80,
                color: 'rgba(255,255,255,0.6)', fontSize: 13,
                pointerEvents: 'none',
              }}>
                点击任意位置取消
              </p>
            </div>
          )}

          {/* 闪光 */}
          {flash && (
            <div style={{
              position: 'absolute', inset: 0, backgroundColor: 'white', zIndex: 30,
              animation: 'flash 0.6s ease-out forwards',
            }} />
          )}

          {/* 未就绪 */}
          {!isCameraReady && !captured && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 20,
            }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>正在启动摄像头...</p>
            </div>
          )}

          {/* 底部操作条 */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 64, zIndex: 12,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
          }}>
            <button onClick={handleRetake} style={ghostBtn}>重拍</button>
            <div
              onClick={captured ? undefined : (countdown !== null ? cancelCountdown : startCountdown)}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: (isCameraReady || captured) ? 'white' : '#555',
                border: countdown !== null ? '3px solid rgba(255,100,100,0.6)' : '3px solid rgba(255,255,255,0.4)',
                cursor: (isCameraReady || captured) ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              {countdown !== null && (
                <span style={{ fontSize: 11, color: '#333', fontWeight: 600 }}>取消</span>
              )}
            </div>
            <button onClick={() => setFacingMode(p => p === 'user' ? 'environment' : 'user')} style={ghostBtn}>
              切换
            </button>
          </div>

          {/* 提示文字 */}
          {!captured && isCameraReady && countdown === null && (
            <p style={{
              position: 'absolute', bottom: 72, left: 0, right: 0,
              textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)',
              zIndex: 15, pointerEvents: 'none',
            }}>
              请正对镜头，保持面部清晰
            </p>
          )}
        </div>
      </div>

      {/* ===== 右侧：选项面板 ===== */}
      <div style={{
        width: 220, background: '#1f2937',
        borderLeft: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* 相框选择 */}
        <div style={{ padding: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
            选择相框
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {FRAMES.map((frame) => (
              <button
                key={frame.id}
                onClick={() => onSelectFrame(frame.id)}
                style={{
                  aspectRatio: '2/3',
                  border: selectedFrame === frame.id ? '2px solid #1565C0' : '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, overflow: 'hidden', cursor: 'pointer', padding: 0,
                  background: 'rgba(255,255,255,0.05)', position: 'relative',
                  boxShadow: selectedFrame === frame.id ? '0 0 0 2px rgba(21,101,192,0.15)' : 'none',
                }}
              >
                <img src={frame.src} alt={frame.name} style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                }} />
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  fontSize: 9, color: 'white',
                  background: 'rgba(0,0,0,0.45)', textAlign: 'center', padding: '2px 0',
                }}>
                  {frame.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div style={{ padding: 12, marginTop: 'auto' }}>
          <button
            onClick={handleNext}
            disabled={!captured}
            style={{
              width: '100%',
              background: captured ? '#1565C0' : '#90caf9',
              color: 'white', border: 'none', borderRadius: 8,
              padding: 12, fontSize: 13, fontWeight: 500,
              cursor: captured ? 'pointer' : 'not-allowed',
            }}
          >
            拍照完成 下一步 →
          </button>
        </div>
      </div>
    </div>
  )
}
