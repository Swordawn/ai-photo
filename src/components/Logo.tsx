import logoSrc from '../assets/logo.png'

export default function Logo() {
  return (
    <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
      <img
        src={logoSrc}
        alt="人工智能与信息技术学院"
        className="w-20 h-20 md:w-24 md:h-24 object-contain"
      />
      <span className="text-sm text-muted-soft leading-tight">
        人工智能与
        <br />
        信息技术学院
      </span>
    </div>
  )
}
