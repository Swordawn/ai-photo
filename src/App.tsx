import { useCallback, useState, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppState } from './state/useAppState'
import { generateAIImage } from './api/generate'
import { apiFetch } from './apiBase'

import FloatingCatkins from './components/FloatingCatkins'
import HomePage from './components/HomePage'
import CameraPage from './components/CameraPage'
import ComposePage from './components/ComposePage'
import PrintPage from './components/PrintPage'

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
    if (registration) {
      apiFetch(`/api/registration/${registration.id}/use`, { method: 'POST' }).catch(() => {})
    }
    setRegistration(null)
  }, [registration])

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

    setSelectedStyle(styleId)
    console.log('[handleGenerate] 开始生成, styleId:', styleId)

    try {
      // AI生成图片（返回远程URL）
      const aiResult = await generateAIImage(
        state.capturedPhoto,
        styleId,
        state.mockMode,
        signal
      )
      console.log('[handleGenerate] AI生成完成, url:', aiResult?.slice(0, 80))

      // 保存照片与登记关联
      const filename = `photo_${Date.now()}.jpg`
      apiFetch('/api/save-photo-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regId: registration?.id || null,
          filename,
          style: styleId
        })
      }).catch(() => {})

      // 跳过前端合成，直接用AI生成的URL
      console.log('[handleGenerate] 跳转到结果页')
      setResultImage(aiResult)
      setServerUrl(aiResult)
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
      </AnimatePresence>
    </div>
  )
}
