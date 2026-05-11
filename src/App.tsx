import { Component, useCallback, useState, useEffect, useRef } from 'react'

// ===== 照片持久化保存队列（localStorage，刷新不丢） =====
const SAVE_QUEUE_KEY = 'photoBooth_saveQueue'

function getSaveQueue(): Record<string, unknown>[] {
  try { return JSON.parse(localStorage.getItem(SAVE_QUEUE_KEY) || '[]') } catch { return [] }
}
function setSaveQueue(queue: Record<string, unknown>[]) {
  localStorage.setItem(SAVE_QUEUE_KEY, JSON.stringify(queue))
}

// 静默保存照片到服务器（带重试，最多3次，失败存入localStorage下次重试）
async function savePhotosWithRetry(payload: Record<string, unknown>, retries = 3) {
  // 先加入持久化队列
  const queue = getSaveQueue()
  const queueId = Date.now().toString(36)
  payload._queueId = queueId
  queue.push(payload)
  setSaveQueue(queue)

  for (let i = 0; i < retries; i++) {
    try {
      const res = await apiFetch('/api/save-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        // 成功，从队列移除
        const q = getSaveQueue().filter((item: Record<string, unknown>) => item._queueId !== queueId)
        setSaveQueue(q)
        console.log('[save] 保存成功')
        return true
      }
      throw new Error(data.error || '保存失败')
    } catch (err) {
      console.warn(`[save] 第${i + 1}次保存失败:`, err)
      if (i < retries - 1) await new Promise(r => setTimeout(r, (i + 1) * 2000))
    }
  }
  // 失败，保留在localStorage，下次页面加载时重试
  console.error('[save] 本次保存失败，已加入持久化队列等待重试')
  return false
}

// 页面加载时处理localStorage中的待保存任务
async function flushSaveQueue() {
  const queue = getSaveQueue()
  if (queue.length === 0) return
  console.log(`[save] 发现${queue.length}个待保存任务，开始重试...`)
  const remaining: Record<string, unknown>[] = []
  for (const payload of queue) {
    try {
      const res = await apiFetch('/api/save-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        console.log('[save] 队列任务恢复成功')
      } else {
        remaining.push(payload)
      }
    } catch {
      remaining.push(payload)
    }
  }
  setSaveQueue(remaining)
  if (remaining.length > 0) console.warn(`[save] ${remaining.length}个任务仍未完成，下次继续`)
}

import type { ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppState } from './state/useAppState'
import { generateAIImage } from './api/generate'
import { apiFetch } from './apiBase'

// 页面加载时立即处理待保存队列
flushSaveQueue()

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

      // 直传COS：base64转Blob，用预签名URL上传
      const uploadToCosDirect = async (base64: string): Promise<string | null> => {
        try {
          // 获取预签名URL
          const signRes = await apiFetch('/api/cos-sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'photo.jpg' }),
          })
          const { url, key } = await signRes.json()
          // base64转Blob
          const byteChars = atob(base64.split(',')[1] || base64)
          const byteArray = new Uint8Array(byteChars.length)
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i)
          const blob = new Blob([byteArray], { type: 'image/jpeg' })
          // 直传COS
          const putRes = await fetch(url, { method: 'PUT', body: blob, signal })
          if (!putRes.ok) throw new Error(`COS上传失败: ${putRes.status}`)
          const cosUrl = `https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com/${key}`
          console.log('[COS] 直传成功:', cosUrl)
          return cosUrl
        } catch (err) {
          console.warn('[COS] 直传失败，回退到服务端保存:', err)
          return null
        }
      }

      let photoId: number | null = null

      if (styleId === 'original') {
        console.log('[handleGenerate] 原版模式，跳过AI处理')
        finalImage = state.capturedPhoto
        // 原版照片直传COS
        const cosUrl = await uploadToCosDirect(state.capturedPhoto)
        imageUrlForQr = cosUrl || finalImage
        // 记录到数据库，获取照片ID
        if (cosUrl) {
          try {
            const recordRes = await apiFetch('/api/save-photo-record', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cosUrl, style: 'original', regId: registration?.id || null, type: 'original' }),
            })
            const recordData = await recordRes.json()
            photoId = recordData.id
          } catch (err) {
            console.error('[save-record] 失败:', err)
          }
        } else {
          // COS直传失败，回退到服务端保存
          savePhotosWithRetry({
            originalUrl: state.capturedPhoto,
            aiUrl: state.capturedPhoto,
            regId: registration?.id || null,
            style: 'original'
          })
        }
      } else {
        // AI生成图片（返回远程URL）
        finalImage = await generateAIImage(state.capturedPhoto, styleId, state.mockMode, signal)
        console.log('[handleGenerate] AI生成完成, url:', finalImage?.slice(0, 80))
        // 原版照片直传COS
        const cosUrl = await uploadToCosDirect(state.capturedPhoto)
        // AI照片由服务端保存（远程URL，前端无法直传）
        savePhotosWithRetry({
          originalUrl: cosUrl || state.capturedPhoto,
          aiUrl: finalImage,
          regId: registration?.id || null,
          style: styleId
        })
        imageUrlForQr = finalImage
      }

      // 生成下载页面URL（微信扫码可直接下载）
      // 使用最短的URL格式，方便QR码扫描
      const host = window.location.origin
      let qrUrl = imageUrlForQr
      if (photoId) {
        qrUrl = `${host}/p/${photoId}`
      } else if (!imageUrlForQr.startsWith('http')) {
        qrUrl = `${host}${imageUrlForQr}`
      }
      // COS URL 直接用，不走代理
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
