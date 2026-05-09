import { useState, useCallback } from 'react'
import { FRAMES, getFrameSrc } from '../data/frames'

const STYLES = [
  { id: 'guofeng', name: '古风' },
  { id: 'guochao', name: '国潮' },
  { id: 'jiaopian', name: '胶片风' },
  { id: 'qingxin', name: '小清新' },
  { id: 'youhua', name: '油画' },
  { id: 'sumiao', name: '素描' },
]

interface Props {
  capturedPhoto: string
  selectedStyle: string | null
  selectedFrame: string | null
  onSelectStyle: (style: string) => void
  onSelectFrame: (frameId: string) => void
  onGenerate: (styleId: string, signal?: AbortSignal) => Promise<void>
  onRetake: () => void
  onBack: () => void
  errorMsg: string | null
}

export default function ComposePage({
  capturedPhoto, selectedStyle, selectedFrame,
  onSelectStyle, onSelectFrame, onGenerate, onRetake, onBack, errorMsg,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const currentFrameSrc = selectedFrame ? getFrameSrc(selectedFrame) : null

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    const styleId = selectedStyle || STYLES[0].id
    const controller = new AbortController()
    setAbortController(controller)
    setIsGenerating(true)
    try {
      await onGenerate(styleId, controller.signal)
    } catch {
      // handled by parent
    } finally {
      setIsGenerating(false)
      setAbortController(null)
    }
  }, [isGenerating, selectedStyle, onGenerate])

  const handleCancel = useCallback(() => {
    abortController?.abort()
    setIsGenerating(false)
    setAbortController(null)
  }, [abortController])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#111827' }}>
      {/* Header */}
      <header style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', flexShrink: 0,
        background: '#111827',
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer',
        }}>
          ← 返回
        </button>
        <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 500 }}>
          AI智能合成
        </span>
        <div style={{ width: 40 }} />
      </header>

      {/* 主体 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ===== 左侧：照片+相框预览 ===== */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#eef0f3', padding: '12px 20px', position: 'relative',
        }}>
          <div style={{
            position: 'relative',
            height: 'calc(100vh - 100px)',
            aspectRatio: '2/3',
            overflow: 'hidden',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            {/* 底层：用户照片 */}
            <img src={capturedPhoto} alt="您的照片" style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: 'scaleX(-1)',
            }} />
            {/* 顶层：相框叠加 */}
            {currentFrameSrc && (
              <img src={currentFrameSrc} alt="相框" style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'fill',
                pointerEvents: 'none',
              }} />
            )}
          </div>

          {/* 生成中覆盖层 */}
          {isGenerating && (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: 'rgba(255,255,255,0.85)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 20,
            }}>
              <div style={{
                width: 48, height: 48,
                border: '3px solid rgba(21,101,192,0.2)',
                borderTopColor: '#1565C0',
                borderRadius: '50%',
                animation: 'spin-slow 1s linear infinite',
                marginBottom: 16,
              }} />
              <p style={{ color: '#1a1a1a', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                AI智能合成中
              </p>
              <p style={{ color: '#999', fontSize: 11, marginBottom: 12 }}>
                请稍候，正在生成您的专属写真...
              </p>
              <button onClick={handleCancel} style={{
                background: 'none', border: 'none', color: '#1565C0', fontSize: 12, cursor: 'pointer',
              }}>
                取消生成
              </button>
            </div>
          )}
        </div>

        {/* ===== 右侧：选项面板 ===== */}
        <div style={{
          width: 220, background: '#1f2937',
          borderLeft: '0.5px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* 区块1：更换相框 */}
          <div style={{ padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
              更换相框
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

          {/* 分隔线 */}
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.08)', margin: '0 14px' }} />

          {/* 区块2：艺术风格 */}
          <div style={{ padding: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
              合成风格
            </p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
              选择AI处理效果
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => onSelectStyle(style.id)}
                  style={{
                    background: selectedStyle === style.id ? '#1565C0' : 'rgba(255,255,255,0.08)',
                    border: `0.5px solid ${selectedStyle === style.id ? '#1565C0' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 20, padding: '4px 10px',
                    fontSize: 11,
                    color: selectedStyle === style.id ? 'white' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          {/* 错误提示 */}
          {errorMsg && (
            <div style={{
              margin: '0 14px', background: '#fff2f0', border: '0.5px solid #ffccc7',
              borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#cf1322',
            }}>
              {errorMsg}
            </div>
          )}

          {/* 底部按钮 */}
          <div style={{ padding: 12, marginTop: 'auto' }}>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                width: '100%',
                background: isGenerating ? '#90caf9' : '#1565C0',
                color: 'white', border: 'none', borderRadius: 8,
                padding: 12, fontSize: 13, fontWeight: 500,
                cursor: isGenerating ? 'not-allowed' : 'pointer', marginBottom: 8,
              }}
            >
              {isGenerating ? '合成中...' : '确认合成'}
            </button>
            <button
              onClick={onRetake}
              disabled={isGenerating}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.08)',
                border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8,
                padding: 10, fontSize: 12, color: 'rgba(255,255,255,0.4)',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
              }}
            >
              重新拍照
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
