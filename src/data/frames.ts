export interface Frame {
  id: string
  name: string
  src: string
}

export const FRAMES: Frame[] = [
  { id: 'frame1', name: '相框一', src: '/frames/xiangkuang1.png' },
  { id: 'frame2', name: '相框二', src: '/frames/xiangkuang2.png' },
  { id: 'frame3', name: '相框三', src: '/frames/xiangkuang3.png' },
  { id: 'frame4', name: '相框四', src: '/frames/xiangkuang4.png' },
  { id: 'frame5', name: '相框五', src: '/frames/xiangkuang5.png' },
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}
