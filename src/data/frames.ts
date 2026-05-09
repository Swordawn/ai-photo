import xiangkuang1 from '../assets/xiangkuang1.png'
import xiangkuang2 from '../assets/xiangkuang2.png'
import xiangkuang3 from '../assets/xiangkuang3.png'
import xiangkuang4 from '../assets/xiangkuang4.png'

export interface Frame {
  id: string
  name: string
  src: string
}

export const FRAMES: Frame[] = [
  { id: 'frame1', name: '相框一', src: xiangkuang1 },
  { id: 'frame2', name: '相框二', src: xiangkuang2 },
  { id: 'frame3', name: '相框三', src: xiangkuang3 },
  { id: 'frame4', name: '相框四', src: xiangkuang4 },
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}
