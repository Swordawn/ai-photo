import { useCallback, useState, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppState } from './state/useAppState'
import { generateAIImage } from './api/generate'
import { compositeFrame } from './utils/compositeFrame'
import { autoSaveImage } from './utils/autoSave'
import { getFrameSrc } from './data/frames'

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
  fetch('/api/report-page', {
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
      fetch('/api/machine-status')
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

  // 设备心跳（每30秒上报，自动检测中心服务器地址）
  useEffect(() => {
    const sendHeartbeat = () => {
      // 自动检测：如果在本地开发就用相对路径，否则用当前域名
      const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      const apiBase = isLocal ? '' : `${window.location.protocol}//${window.location.host}`
      fetch(`${apiBase}/api/device/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), page: state.page, version: '1.0.3' }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.commands && data.commands.length > 0) {
            for (const cmd of data.commands) {
              if (cmd.type === 'shutdown') {
                // 通知中心服务器已收到命令
                fetch(`${apiBase}/api/device/ack-shutdown`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deviceId: getDeviceId() }),
                }).catch(() => {})
                // 通知本地服务器关闭（写标志文件 + exit）
                fetch('/api/device/local-shutdown', {
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

    try {
      const aiResult = await generateAIImage(
        state.capturedPhoto,
        styleId,
        state.mockMode,
        signal
      )

      // 合成：在 AI 结果上叠加相框
      let finalImage = aiResult
      if (state.selectedFrame) {
        const frameSrc = getFrameSrc(state.selectedFrame)
        if (frameSrc) {
          finalImage = await compositeFrame(aiResult, frameSrc)
        }
      }

      // 自动保存到服务器，获取 URL 用于二维码
      const url = await autoSaveImage(finalImage)
      setServerUrl(url)

      setResultImage(finalImage)
      setErrorMsg(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败'
      setErrorMsg(message)
    }
  }, [state.capturedPhoto, state.mockMode, state.selectedFrame, setSelectedStyle, setResultImage])

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
