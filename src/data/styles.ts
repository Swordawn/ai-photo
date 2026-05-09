export interface PhotoStyle {
  id: string
  name: string
  emoji: string
  description: string
  color: string
  styleIndex: number
}

export const PHOTO_STYLES: PhotoStyle[] = [
  {
    id: 'scholar',
    name: '学霸风',
    emoji: '\u{1F393}',
    description: '复古漫画',
    color: '#4FC3F7',
    styleIndex: 0, // 复古漫画
  },
  {
    id: 'cyber',
    name: 'AI赛博风',
    emoji: '\u{1F916}',
    description: '未来科技',
    color: '#00e5ff',
    styleIndex: 4, // 未来科技
  },
  {
    id: 'guochao',
    name: '国潮古风',
    emoji: '\u{1F3DB}',
    description: '国画古风',
    color: '#FF8A65',
    styleIndex: 5, // 国画古风
  },
  {
    id: 'astronaut',
    name: '未来宇航员',
    emoji: '\u{1F680}',
    description: '二次元',
    color: '#7E57C2',
    styleIndex: 2, // 二次元
  },
  {
    id: 'geek',
    name: '极客程序员',
    emoji: '\u{1F468}‍\u{1F4BB}',
    description: '炫彩卡通',
    color: '#66BB6A',
    styleIndex: 7, // 炫彩卡通
  },
  {
    id: 'graduate',
    name: '毕业纪念风',
    emoji: '\u{1F31F}',
    description: '3D童话',
    color: '#FFD700',
    styleIndex: 1, // 3D童话
  },
]
