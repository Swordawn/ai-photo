const CDN = 'https://ai-photo-cdn.pages.dev'

export interface Frame {
  id: string
  name: string
  src: string
}

export const FRAMES: Frame[] = [
  { id: 'frame1', name: '相框一', src: `${CDN}/frames/xiangkuang1.png` },
  { id: 'frame2', name: '相框二', src: `${CDN}/frames/xiangkuang2.png` },
  { id: 'frame3', name: '相框三', src: `${CDN}/frames/xiangkuang3.png` },
  { id: 'frame4', name: '相框四', src: `${CDN}/frames/xiangkuang4.png` },
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}
