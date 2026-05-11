import { Component, useCallback, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppState } from './state/useAppState'
import { generateAIImage } from './api/generate'
import { apiFetch } from './apiBase'

import FloatingCatkins from './components/FloatingCatkins'
import HomePage from './components/HomePage'
import CameraPage from './components/CameraPage'
import ComposePage from './components/ComposePage'
import PrintPage from './components/PrintPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111827', color: 'white', padding: 40 }}>
          <p style={{ fontSize: 36, marginBottom: 16 }}>⚠️</p>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>页面出现错误</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} style={{ background: '#1565C0', color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const STYLE_NAMES: Record<string, string> = {
  guofeng: '古风', guochao: '国潮', jiaopian: '胶片风',
  qingxin: '小清新', youhua: '油画', sumiao: '素描',
}

// 获取或生成设备ID
function getDeviceId() {
  let id = localStorage.getItem('deviceId')
  if (!id) {
    id = 'kiosk-' + Math.random().toString(36).substr(2, 8)
    localStorage.setItem('deviceId', id)
  }
  return id
}

// 上报当前页面到后端
function reportPage(page: string) {
  apiFetch('/api/report-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page }),
  }).catch(() => {})
}

export default function App() {
  const {
    state,
    goTo,
    setCapturedPhoto,
    setSelectedStyle,
    setSelectedFrame,
    setResultImage,
    reset,
  } = useAppState()

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [apiLocked, setApiLocked] = useState(false)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [registration, setRegistration] = useState<{ id: number; name: string; class_name: string } | null>(null)
  const prevPageRef = useRef(state.page)

  // 页面变化时上报
  useEffect(() => {
    if (state.page !== prevPageRef.current) {
      reportPage(state.page)
      prevPageRef.current = state.page
    }
  }, [state.page])

  // Debug: ?debug=compose 直接跳转合成页（用相框1作为测试图）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === 'compose' && state.page === 'home') {
      const canvas = document.createElement('canvas')
      canvas.width = 600; canvas.height = 900
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#e8d5b7'
      ctx.fillRect(0, 0, 600, 900)
      ctx.fillStyle = '#8B7355'
      ctx.font = 'bold 48px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('DEBUG 测试照片', 300, 450)
      setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.9))
      goTo('compose')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 启动时检查机器状态 + 定期刷新
  useEffect(() => {
    const checkStatus = () => {
      apiFetch('/api/machine-status')
        .then(r => r.json())
        .then(data => {
          setApiLocked(data.apiLocked || false)
          if (data.mockMode !== undefined) {
            // 同步服务端 mockMode 到本地（如果需要）
          }
        })
        .catch(() => {})
    }
    checkStatus()
    const timer = setInterval(checkStatus, 15000)
    return () => clearInterval(timer)
  }, [])

  // 清除登记（标记为已使用，防止轮询再次拉出）
  const clearRegistration = useCallback(() => {
    setRegistration(null)
  }, [])

  // 扫码登记轮询（首页时每5秒检查新登记）
  useEffect(() => {
    if (state.page !== 'home') return
    const poll = () => {
      apiFetch('/api/registration/latest')
        .then(r => r.json())
        .then(data => {
          if (data.registration) {
            // 只在 id 变化时更新，避免重复触发倒计时重置
            setRegistration(prev => {
              if (prev && prev.id === data.registration.id) return prev
              return data.registration
            })
          } else {
            // 数据库无未使用登记，清除本地状态
            setRegistration(null)
          }
        })
        .catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [state.page])

  // 登记超时：90秒无操作自动清除（同时标记数据库已使用）
  useEffect(() => {
    if (!registration) return
    const timeout = setTimeout(() => {
      apiFetch(`/api/registration/${registration.id}/use`, { method: 'POST' }).catch(() => {})
      setRegistration(null)
    }, 90000)
    return () => {
      clearTimeout(timeout)
      // cleanup时也标记已使用（导航离开、新登记替换等场景）
      apiFetch(`/api/registration/${registration.id}/use`, { method: 'POST' }).catch(() => {})
    }
  }, [registration])

  // 设备心跳（每30秒上报）
  useEffect(() => {
    const sendHeartbeat = () => {
      apiFetch('/api/device/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), page: state.page, version: '1.0.3' }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.commands && data.commands.length > 0) {
            for (const cmd of data.commands) {
              if (cmd.type === 'shutdown') {
                apiFetch('/api/device/ack-shutdown', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deviceId: getDeviceId() }),
                }).catch(() => {})
                apiFetch('/api/device/local-shutdown', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                }).catch(() => {})
                return
              }
            }
          }
        })
        .catch(() => {})
    }
    sendHeartbeat()
    const timer = setInterval(sendHeartbeat, 30000)
    return () => clearInterval(timer)
  }, [state.page])

  const handleGenerate = useCallback(async (styleId: string, signal?: AbortSignal) => {
    if (!state.capturedPhoto) return

    setErrorMsg(null)
    setSelectedStyle(styleId)
    console.log('[handleGenerate] 开始生成, styleId:', styleId)

    try {
      let finalImage: string
      let imageUrlForQr: string

      if (styleId === 'original') {
        // 原版：直接用拍摄的照片，不经过AI处理
        console.log('[handleGenerate] 原版模式，跳过AI处理')
        finalImage = state.capturedPhoto
        // 上传到服务器获取URL（用于二维码）
        const uploadRes = await apiFetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: state.capturedPhoto, filename: `original_${Date.now()}.jpg` }),
          signal
        })
        const uploadData = await uploadRes.json()
        imageUrlForQr = uploadData.url || finalImage
        console.log('[handleGenerate] 原版上传完成:', imageUrlForQr?.slice(0, 80))
        // 原版也要保存到已完成照片目录+数据库
        apiFetch('/api/save-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalUrl: state.capturedPhoto,
            aiUrl: state.capturedPhoto,  // 原版模式AI也是原图
            regId: registration?.id || null,
            style: 'original'
          })
        }).then(r => r.json()).then(r => {
          console.log('[handleGenerate] 原版保存结果:', r)
        }).catch(err => {
          console.error('[handleGenerate] 原版保存失败:', err)
        })
      } else {
        // AI生成图片（返回远程URL）
        finalImage = await generateAIImage(
          state.capturedPhoto,
          styleId,
          state.mockMode,
          signal
        )
        console.log('[handleGenerate] AI生成完成, url:', finalImage?.slice(0, 80))

        // 异步保存照片到服务器（不阻塞显示）
        console.log('[handleGenerate] 后台保存照片...')
        apiFetch('/api/save-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalUrl: state.capturedPhoto,  // 原版照片（base64）
            aiUrl: finalImage,                  // AI照片（远程URL）
            regId: registration?.id || null,
            style: styleId
          })
        }).then(r => r.json()).then(r => {
          console.log('[handleGenerate] 照片保存结果:', r)
        }).catch(err => {
          console.error('[handleGenerate] 照片保存失败:', err)
        })

        imageUrlForQr = finalImage
      }

      // 生成下载页面URL（微信扫码可直接下载）
      // 对于AI图片，使用代理URL避免QR码过长
      let qrUrl = imageUrlForQr
      if (styleId !== 'original' && imageUrlForQr.startsWith('http')) {
        // AI图片使用服务器代理URL
        qrUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrlForQr)}`
      }
      const downloadUrl = `/download?url=${encodeURIComponent(qrUrl)}&frame=${state.selectedFrame || 'frame1'}`
      console.log('[handleGenerate] 跳转到结果页')
      setResultImage(finalImage)
      setServerUrl(downloadUrl)
      setErrorMsg(null)

      // 标记登记已使用
      if (registration) {
        apiFetch(`/api/registration/${registration.id}/use`, { method: 'POST' }).catch(() => {})
      }
    } catch (err) {
      console.error('[handleGenerate] 错误:', err)
      const message = err instanceof Error ? err.message : '生成失败'
      setErrorMsg(message)
    }
  }, [state.capturedPhoto, state.mockMode, state.selectedFrame, setSelectedStyle, setResultImage, registration])

  return (
    <ErrorBoundary>
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', backgroundColor: '#F7FAFC' }}>
      {/* API 锁定覆盖层 */}
      {apiLocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
          backgroundColor: 'rgba(0,0,0,0.85)',
        }}>
          <div style={{ fontSize: 48 }}>🔒</div>
          <p style={{ color: 'white', fontSize: 20, fontWeight: 600 }}>服务暂时关闭</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>请联系管理员解锁</p>
        </div>
      )}

      {/* 柳絮飘落背景 */}
      <FloatingCatkins />

      <AnimatePresence mode="wait">
        {state.page === 'home' && (
          <HomePage
            key="home"
            onStart={() => goTo('camera')}
            onCamera={() => goTo('camera')}
            registration={registration}
            onClearRegistration={clearRegistration}
          />
        )}

        {state.page === 'camera' && (
          <CameraPage
            key="camera"
            selectedFrame={state.selectedFrame}
            onSelectFrame={setSelectedFrame}
            onCapture={(photo) => {
              setCapturedPhoto(photo)
              goTo('compose')
            }}
            onBack={() => goTo('home')}
          />
        )}

        {state.page === 'compose' && state.capturedPhoto && (
          <ComposePage
            key="compose"
            capturedPhoto={state.capturedPhoto}
            selectedStyle={state.selectedStyle}
            selectedFrame={state.selectedFrame}
            onSelectStyle={setSelectedStyle}
            onSelectFrame={setSelectedFrame}
            onGenerate={handleGenerate}
            onRetake={() => goTo('camera')}
            onBack={() => goTo('home')}
            errorMsg={errorMsg}
          />
        )}

        {state.page === 'compose' && !state.capturedPhoto && (
          <HomePage key="home-fallback" onStart={() => goTo('camera')} onCamera={() => goTo('camera')} registration={null} onClearRegistration={() => {}} />
        )}

        {state.page === 'print' && state.resultImage && (
          <PrintPage
            key="print"
            resultImage={state.resultImage}
            originalPhoto={state.capturedPhoto}
            selectedFrame={state.selectedFrame}
            qrUrl={serverUrl}
            styleName={state.selectedStyle ? (STYLE_NAMES[state.selectedStyle] || 'AI艺术风格') : 'AI艺术风格'}
            onRestart={reset}
            onBack={() => goTo('home')}
          />
        )}

        {state.page === 'print' && !state.resultImage && (
          <HomePage key="home-fallback2" onStart={() => goTo('camera')} onCamera={() => goTo('camera')} registration={null} onClearRegistration={() => {}} />
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  )
}
