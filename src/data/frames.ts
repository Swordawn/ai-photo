// 边框图片放在服务器本地，加快加载速度
const FRAME_BASE = '/frames'

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
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}
