const collegeLogo = new URL('../assets/college-logo.png', import.meta.url).href

export default function AppHeader() {
  return (
    <header style={{
      background: 'linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)',
      padding: '12px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      flexShrink: 0,
    }}>
      {/* 左边：学院Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={collegeLogo}
          alt="学院Logo"
          style={{ width: 50, height: 50, objectFit: 'contain' }}
        />
      </div>

      {/* 右边：单位名称 */}
      <div style={{ color: 'white', textAlign: 'right' }}>
        <p style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 2 }}>
          人工智能与信息技术学院
        </p>
      </div>
    </header>
  )
}
