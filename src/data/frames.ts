// 相框走COS CDN（服务器4Mbps扛不住），Canvas合成时通过代理解决CORS
const COS_BASE = 'https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com'
const FRAME_BASE = `${COS_BASE}/frames`

export interface Frame {
  id: string
  name: string
  src: string
}

export const FRAMES: Frame[] = [
  { id: 'frame1', name: '相框一', src: `${FRAME_BASE}/xiangkuang1.png` },
  { id: 'frame2', name: '相框二', src: `${FRAME_BASE}/xiangkuang2.png` },
  { id: 'frame3', name: '相框三', src: `${FRAME_BASE}/xiangkuang3.png` },
  { id: 'frame4', name: '相框四', src: `${FRAME_BASE}/xiangkuang4.png` },
  { id: 'frame5', name: '相框五', src: `${FRAME_BASE}/xiangkuang5.png` },
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}

// Canvas合成用：通过代理加载相框（解决CORS）
export function getFrameProxySrc(frameId: string): string {
  const src = getFrameSrc(frameId)
  return `/api/proxy-image?url=${encodeURIComponent(src)}`
}
