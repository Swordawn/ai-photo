// 显示用：COS CDN（快）
const COS_BASE = 'https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com'
const FRAME_COS = `${COS_BASE}/frames`

// Canvas合成用：本地路径（同源无CORS，不走服务器带宽也没关系因为是自助机本地请求）
const FRAME_LOCAL = '/frames'

export interface Frame {
  id: string
  name: string
  src: string
}

export const FRAMES: Frame[] = [
  { id: 'frame1', name: '相框一', src: `${FRAME_COS}/xiangkuang1.png` },
  { id: 'frame2', name: '相框二', src: `${FRAME_COS}/xiangkuang2.png` },
  { id: 'frame3', name: '相框三', src: `${FRAME_COS}/xiangkuang3.png` },
  { id: 'frame4', name: '相框四', src: `${FRAME_COS}/xiangkuang4.png` },
  { id: 'frame5', name: '相框五', src: `${FRAME_COS}/xiangkuang5.png` },
]

export function getFrameSrc(frameId: string): string {
  return FRAMES.find(f => f.id === frameId)?.src ?? FRAMES[0].src
}

// Canvas合成用：本地路径（同源，无CORS，秒加载）
export function getFrameProxySrc(frameId: string): string {
  const id = FRAMES.find(f => f.id === frameId)?.id ?? FRAMES[0].id
  return `${FRAME_LOCAL}/${id.replace('frame', 'xiangkuang')}.png`
}
