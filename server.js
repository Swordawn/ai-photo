import express from 'express'
import cors from 'cors'
import { writeFile, mkdir, readdir, unlink, readFile, rm } from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { spawn, execSync } from 'child_process'
import { config } from 'dotenv'

config()
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3001
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '888888'
const startTime = Date.now()
const isWin = process.platform === 'win32'

// OTA 热更新（零依赖，纯 Node.js 内置模块，使用 Gitee）
const OTA_URL = 'https://gitee.com/Swordawn/ai-photo/raw/main/ota.json'
const OTA_TREE_URL = 'https://gitee.com/api/v5/repos/Swordawn/ai-photo/git/trees/main?recursive=1'
const OTA_RAW_BASE = 'https://gitee.com/Swordawn/ai-photo/raw/main/'
const OTA_INTERVAL = 30 * 60 * 1000
const PKG_PATH = join(__dirname, 'package.json')
const OTA_STATE_PATH = join(__dirname, '.ota-state.json')
const OTA_SKIP = ['node_modules/', '.env', 'uploads/', 'cloudflared.exe', '.git/', '.tunnel-url', '__update_tmp__/', '__update__.zip']
let localVersion = '1.0.0'
let localSha = ''
let updateStatus = 'idle'
let updateMessage = ''

// ===== 多设备管理 =====
const devices = new Map()        // deviceId -> { name, page, lastSeen, ip, version }
const deviceCommands = new Map() // deviceId -> [{ type, timestamp }]

// 读取本地版本和 SHA
try {
  const pkg = JSON.parse(await readFile(PKG_PATH, 'utf-8'))
  localVersion = pkg.version || '1.0.0'
} catch {}
try {
  const state = JSON.parse(await readFile(OTA_STATE_PATH, 'utf-8'))
  localSha = state.sha || ''
} catch {}

// 中间件
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// 静态文件服务
const uploadsDir = join(__dirname, 'uploads')
if (!existsSync(uploadsDir)) {
  await mkdir(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir))

// ===== API 锁中间件 =====
// 开启后拦截所有前端 API 调用（防止 API 被盗用/滥用）
function apiGateMiddleware(req, res, next) {
  // 管理 API 不受限制
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/machine-status') || req.path.startsWith('/api/device')) {
    return next()
  }
  // 如果 API 已锁定，返回 503
  if (app.get('apiLocked')) {
    return res.status(503).json({ error: '服务暂时关闭', locked: true })
  }
  next()
}

// 对需要保护的 API 路径应用拦截
app.use('/api/upload', apiGateMiddleware)
app.use('/api/proxy-image', apiGateMiddleware)
app.use('/api/report-page', apiGateMiddleware)

// ===== 管理员认证 =====
function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-password']
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '未授权' })
  }
  next()
}

// ===== 现有 API =====

app.post('/api/upload', async (req, res) => {
  try {
    const { image, filename } = req.body
    if (!image) return res.status(400).json({ error: '没有图片数据' })
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    const sanitized = (filename || `photo_${Date.now()}.jpg`).replace(/\.\.|[\/\\]/g, '')
    const uniqueFilename = sanitized || `photo_${Date.now()}.jpg`
    const filepath = join(uploadsDir, uniqueFilename)
    const dir = dirname(filepath)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(filepath, buffer)
    // 今日拍照计数（按日重置）
    const today = new Date().toISOString().slice(0, 10)
    if (app.get('todayDate') !== today) {
      app.set('todayDate', today)
      app.set('todayCount', 0)
    }
    app.set('todayCount', (app.get('todayCount') || 0) + 1)
    // 使用 CF 隧道域名，确保扫码可访问
    const publicHost = process.env.PUBLIC_HOST || req.headers.host || `localhost:${PORT}`
    const protocol = process.env.PUBLIC_HOST ? 'https' : (req.headers['x-forwarded-proto'] || 'http')
    res.json({ success: true, url: `${protocol}://${publicHost}/uploads/${uniqueFilename}`, filename: uniqueFilename })
  } catch (error) {
    console.error('上传失败:', error)
    res.status(500).json({ error: '上传失败' })
  }
})

app.get('/download/:filename', (req, res) => {
  const { filename } = req.params
  const filepath = join(uploadsDir, filename)
  const resolved = resolve(filepath)
  if (!resolved.startsWith(resolve(uploadsDir))) {
    return res.status(403).json({ error: '禁止访问' })
  }
  if (!existsSync(filepath)) return res.status(404).json({ error: '文件不存在' })
  res.download(filepath, filename)
})

app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') return res.status(400).json({ error: '缺少 url 参数' })
    const resp = await fetch(url)
    if (!resp.ok) return res.status(resp.status).json({ error: `远程图片获取失败: ${resp.status}` })
    const buffer = Buffer.from(await resp.arrayBuffer())
    res.set('Content-Type', resp.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(buffer)
  } catch (err) {
    console.error('代理图片失败:', err)
    res.status(500).json({ error: '代理图片失败' })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 前端检查机器状态（包含 apiLocked）
app.get('/api/machine-status', (req, res) => {
  res.json({
    paused: app.get('paused') || false,
    mockMode: app.get('mockMode') || false,
    idleTimeout: app.get('idleTimeout') || 120,
    apiLocked: app.get('apiLocked') || false,
  })
})

// 前端上报当前页面
app.post('/api/report-page', (req, res) => {
  const { page } = req.body
  if (page) app.set('currentPage', page)
  res.json({ ok: true })
})

// ===== 设备管理 API =====

// 设备心跳（每30秒调用，返回待执行命令）
app.post('/api/device/heartbeat', (req, res) => {
  const { deviceId, page, version } = req.body
  if (!deviceId) return res.status(400).json({ error: '缺少 deviceId' })
  const existing = devices.get(deviceId) || {}
  devices.set(deviceId, {
    name: existing.name || deviceId,
    page: page || 'unknown',
    lastSeen: Date.now(),
    ip: req.ip || req.connection?.remoteAddress || '',
    version: version || '1.0.0',
  })
  // 返回待执行命令并清空队列
  const commands = deviceCommands.get(deviceId) || []
  deviceCommands.delete(deviceId)
  res.json({ commands })
})

// 设备确认关机（记录状态）
app.post('/api/device/ack-shutdown', (req, res) => {
  const { deviceId } = req.body
  if (deviceId) {
    const dev = devices.get(deviceId)
    if (dev) dev.page = 'shutdown'
  }
  res.json({ ok: true })
})

// 本地关机（浏览器调用本地服务器，写标志文件并退出进程）
app.post('/api/device/local-shutdown', (req, res) => {
  console.log('[Shutdown] 收到远程关机指令，正在关闭...')
  res.json({ ok: true })
  // 写标志文件，start.bat 检测到后不再重启
  writeFile(join(__dirname, '.shutdown'), new Date().toISOString()).catch(() => {})
  // 延迟退出，让响应返回
  setTimeout(() => process.exit(0), 1000)
})

// 管理员：获取所有设备列表
app.get('/api/admin/devices', authMiddleware, (req, res) => {
  const list = []
  for (const [id, dev] of devices) {
    const online = Date.now() - dev.lastSeen < 60000
    list.push({ id, name: dev.name, page: dev.page, lastSeen: dev.lastSeen, online, version: dev.version })
  }
  list.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.lastSeen - a.lastSeen)
  res.json({ devices: list })
})

// 管理员：向单个设备发送关机命令
app.post('/api/admin/devices/:deviceId/shutdown', authMiddleware, (req, res) => {
  const { deviceId } = req.params
  if (!devices.has(deviceId)) return res.status(404).json({ error: '设备不存在' })
  if (!deviceCommands.has(deviceId)) deviceCommands.set(deviceId, [])
  deviceCommands.get(deviceId).push({ type: 'shutdown', timestamp: Date.now() })
  res.json({ success: true })
})

// 管理员：向所有设备发送关机命令
app.post('/api/admin/devices/shutdown-all', authMiddleware, (req, res) => {
  const now = Date.now()
  for (const [id] of devices) {
    if (!deviceCommands.has(id)) deviceCommands.set(id, [])
    deviceCommands.get(id).push({ type: 'shutdown', timestamp: now })
  }
  res.json({ success: true, count: devices.size })
})

// 管理员：重命名设备
app.put('/api/admin/devices/:deviceId/name', authMiddleware, (req, res) => {
  const { deviceId } = req.params
  const { name } = req.body
  if (!devices.has(deviceId)) return res.status(404).json({ error: '设备不存在' })
  if (name) devices.get(deviceId).name = name
  res.json({ success: true })
})

// ===== 管理页面 =====
app.get('/booth-admin', (req, res) => {
  res.send(getAdminHTML())
})

// ===== 管理 API =====
app.get('/api/admin/status', authMiddleware, async (req, res) => {
  try {
    const finishedDir = join(uploadsDir, '已完成照片')
    let photoCount = 0
    if (existsSync(finishedDir)) {
      const files = await readdir(finishedDir)
      photoCount = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f)).length
    }
    const uptimeMs = Date.now() - startTime
    const uptimeMin = Math.floor(uptimeMs / 60000)
    const uptimeH = Math.floor(uptimeMin / 60)
    // 隧道 URL
    const publicHost = process.env.PUBLIC_HOST || ''
    const tunnelUrl = publicHost ? `https://${publicHost}` : ''
    res.json({
      currentPage: app.get('currentPage') || 'home',
      todayCount: app.get('todayCount') || 0,
      photoCount,
      uptime: uptimeH > 0 ? `${uptimeH}h${uptimeMin % 60}m` : `${uptimeMin}m`,
      tunnelUrl,
    })
  } catch { res.status(500).json({ error: '获取状态失败' }) }
})

app.get('/api/admin/config', authMiddleware, (req, res) => {
  res.json({
    mockMode: app.get('mockMode') || false,
    idleTimeout: app.get('idleTimeout') || 120,
    paused: app.get('paused') || false,
    apiLocked: app.get('apiLocked') || false,
  })
})

app.post('/api/admin/config', authMiddleware, (req, res) => {
  const { mockMode, idleTimeout, paused, apiLocked } = req.body
  if (mockMode !== undefined) app.set('mockMode', mockMode)
  if (idleTimeout !== undefined) app.set('idleTimeout', idleTimeout)
  if (paused !== undefined) app.set('paused', paused)
  if (apiLocked !== undefined) app.set('apiLocked', apiLocked)
  res.json({ success: true })
})

app.get('/api/admin/photos', authMiddleware, async (req, res) => {
  try {
    const photos = []
    // 读取 uploads 根目录的照片
    if (existsSync(uploadsDir)) {
      const rootFiles = await readdir(uploadsDir)
      for (const f of rootFiles) {
        if (/\.(jpg|jpeg|png)$/i.test(f)) photos.push(f)
      }
    }
    // 读取 已完成照片 子目录
    const finishedDir = join(uploadsDir, '已完成照片')
    if (existsSync(finishedDir)) {
      const files = await readdir(finishedDir)
      for (const f of files) {
        if (/\.(jpg|jpeg|png)$/i.test(f)) photos.push('已完成照片/' + f)
      }
    }
    res.json({ photos: photos.sort((a, b) => b.localeCompare(a)) })
  } catch { res.status(500).json({ error: '获取照片列表失败' }) }
})

app.delete('/api/admin/photos/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename
    const filepath = join(uploadsDir, filename)
    if (existsSync(filepath)) await unlink(filepath)
    res.json({ success: true })
  } catch { res.status(500).json({ error: '删除失败' }) }
})

app.delete('/api/admin/photos', authMiddleware, async (req, res) => {
  try {
    const finishedDir = join(uploadsDir, '已完成照片')
    if (existsSync(finishedDir)) {
      const files = await readdir(finishedDir)
      for (const f of files) {
        if (/\.(jpg|jpeg|png)$/i.test(f)) await unlink(join(finishedDir, f))
      }
    }
    res.json({ success: true })
  } catch { res.status(500).json({ error: '清空失败' }) }
})

// ===== 管理页面 HTML =====
function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>自助机管理后台</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0f172a;--card:#1e293b;--card-hover:#253449;--border:#334155;--accent:#3b82f6;--accent-dim:#1e40af;--danger:#ef4444;--success:#22c55e;--warning:#f59e0b;--text:#f1f5f9;--text-dim:#94a3b8;--text-muted:#64748b;--radius:12px;--radius-sm:8px}
body{font-family:'Noto Sans SC',-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow-x:hidden}
/* 登录 */
.login{display:flex;align-items:center;justify-content:center;height:100vh;padding:20px}
.login-box{background:var(--card);padding:48px 40px;border-radius:20px;box-shadow:0 25px 60px rgba(0,0,0,.4);text-align:center;max-width:360px;width:100%;border:1px solid var(--border)}
.login-box h2{font-size:22px;font-weight:700;margin-bottom:8px}
.login-box p{color:var(--text-dim);font-size:13px;margin-bottom:28px}
.login-box input{width:100%;padding:14px 18px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:15px;background:var(--bg);color:var(--text);outline:none;transition:.2s}
.login-box input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(59,130,246,.15)}
.login-box button{width:100%;padding:14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);font-size:15px;font-weight:600;cursor:pointer;margin-top:12px;transition:.2s}
.login-box button:hover{background:var(--accent-dim)}
.login-err{color:var(--danger);font-size:12px;margin-top:10px;display:none}
/* 主应用 */
.app{display:none;min-height:100vh}
.app.show{display:block;min-height:100vh}
/* 状态栏 */
.status-bar{background:var(--card);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.status-left{display:flex;align-items:center;gap:10px}
.status-dot{width:10px;height:10px;border-radius:50%;background:var(--success);box-shadow:0 0 8px rgba(34,197,94,.4);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.status-title{font-weight:600;font-size:15px}
.status-right{display:flex;align-items:center;gap:12px}
.btn-logout{background:none;border:1px solid var(--border);color:var(--text-dim);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;transition:.2s}
.btn-logout:hover{border-color:var(--danger);color:var(--danger)}
/* 统计条 */
.stats-bar{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:16px 20px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center;transition:.2s}
.stat-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.stat-num{font-size:26px;font-weight:700;color:var(--accent);line-height:1.2}
.stat-label{font-size:11px;color:var(--text-muted);margin-top:4px}
/* 快捷控制 */
.quick-ctrl{padding:0 20px 16px}
.ctrl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ctrl-btn{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px 12px;text-align:center;cursor:pointer;transition:.2s;user-select:none}
.ctrl-btn:hover{border-color:var(--accent);background:var(--card-hover)}
.ctrl-btn.active{border-color:var(--accent);background:rgba(59,130,246,.1)}
.ctrl-btn.danger.active{border-color:var(--danger);background:rgba(239,68,68,.1)}
.ctrl-icon{font-size:22px;margin-bottom:6px}
.ctrl-name{font-size:12px;color:var(--text-dim);font-weight:500}
.ctrl-status{font-size:10px;margin-top:4px;padding:2px 8px;border-radius:10px;display:inline-block}
.ctrl-status.on{background:rgba(34,197,94,.15);color:var(--success)}
.ctrl-status.off{background:rgba(148,163,184,.1);color:var(--text-muted)}
.ctrl-status.locked{background:rgba(239,68,68,.15);color:var(--danger)}
/* 超时滑块 */
.slider-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin:0 20px 16px}
.slider-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.slider-header span{font-size:13px;color:var(--text-dim)}
.slider-val{color:var(--accent);font-weight:600;font-size:14px}
input[type=range]{width:100%;height:6px;-webkit-appearance:none;background:var(--border);border-radius:3px;outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:var(--accent);cursor:pointer;box-shadow:0 2px 8px rgba(59,130,246,.3)}
/* 隧道地址 */
.tunnel-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;margin:0 20px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.tunnel-url{font-size:13px;color:var(--accent);word-break:break-all;flex:1}
.tunnel-copy{background:var(--accent);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;transition:.2s}
.tunnel-copy:hover{background:var(--accent-dim)}
/* 照片区域 */
.photos-section{padding:0 20px 20px}
.photos-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.photos-title{font-size:14px;font-weight:600}
.photos-actions{display:flex;gap:8px}
.btn-sm{padding:6px 14px;border-radius:6px;border:none;font-size:12px;cursor:pointer;transition:.2s}
.btn-danger{background:var(--danger);color:#fff}.btn-danger:hover{background:#dc2626}
.btn-ghost{background:var(--card);border:1px solid var(--border);color:var(--text-dim)}.btn-ghost:hover{border-color:var(--text-dim)}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.photo-item{position:relative;aspect-ratio:2/3;border-radius:var(--radius-sm);overflow:hidden;cursor:pointer;transition:.2s}
.photo-item:hover{transform:scale(1.02);box-shadow:0 8px 24px rgba(0,0,0,.3)}
.photo-item img{width:100%;height:100%;object-fit:cover}
.photo-overlay{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.7) 0%,transparent 50%);opacity:0;transition:.2s;display:flex;align-items:flex-end;padding:8px}
.photo-item:hover .photo-overlay{opacity:1}
.photo-btns{display:flex;gap:4px;width:100%}
.photo-btns button{flex:1;padding:6px;border:none;border-radius:4px;font-size:10px;font-weight:500;cursor:pointer;color:#fff;transition:.15s}
.photo-btns .dl{background:var(--accent)}.photo-btns .dl:hover{background:var(--accent-dim)}
.photo-btns .rm{background:var(--danger)}.photo-btns .rm:hover{background:#dc2626}
.photo-name{position:absolute;top:6px;left:6px;font-size:9px;color:rgba(255,255,255,.7);background:rgba(0,0,0,.4);padding:2px 6px;border-radius:4px;opacity:0;transition:.2s}
.photo-item:hover .photo-name{opacity:1}
/* 空状态 */
.empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
.empty-icon{font-size:48px;margin-bottom:12px;opacity:.3}
.empty-text{font-size:14px}
/* 自定义确认弹窗 */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px;max-width:320px;width:90%;text-align:center}
.modal h3{font-size:16px;margin-bottom:8px}
.modal p{font-size:13px;color:var(--text-dim);margin-bottom:20px}
.modal-btns{display:flex;gap:10px}
.modal-btns button{flex:1;padding:10px;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;transition:.2s}
.modal-btns .cancel{background:var(--card);border:1px solid var(--border);color:var(--text-dim)}
.modal-btns .confirm{background:var(--danger);color:#fff}
.modal-btns .confirm.primary{background:var(--accent)}
/* 手机端自适应 */
@media(max-width:767px){
.stats-bar{grid-template-columns:repeat(2,1fr)}
.ctrl-grid{grid-template-columns:repeat(3,1fr)}
.stat-num{font-size:22px}
.photo-grid{grid-template-columns:repeat(2,1fr)}
.tunnel-card{flex-direction:column;align-items:flex-start}
}
/* 桌面端 */
@media(min-width:768px){
.main-area{flex:1;overflow-y:auto;padding-bottom:20px}
}
/* 加载态 */
.loading{opacity:.5;pointer-events:none}
/* toast */
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--border);color:var(--text);padding:10px 20px;border-radius:var(--radius-sm);font-size:13px;z-index:200;animation:toastIn .3s ease}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
/* 设备管理 */
.devices-section{padding:0 20px 20px}
.devices-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.devices-title{font-size:14px;font-weight:600}
.devices-actions{display:flex;gap:8px}
.device-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.device-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;transition:.2s;position:relative}
.device-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.device-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.device-name{font-size:13px;font-weight:600;color:var(--text)}
.device-name-input{font-size:13px;font-weight:600;color:var(--text);background:var(--bg);border:1px solid var(--accent);border-radius:4px;padding:2px 6px;width:120px;outline:none}
.device-status{display:flex;align-items:center;gap:5px;font-size:11px}
.device-dot{width:8px;height:8px;border-radius:50%}
.device-dot.on{background:var(--success);box-shadow:0 0 6px rgba(34,197,94,.4)}
.device-dot.off{background:var(--text-muted)}
.device-page{font-size:11px;color:var(--text-dim);margin-bottom:4px}
.device-meta{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
.device-info{font-size:10px;color:var(--text-muted)}
.device-id{font-size:10px;color:var(--text-muted);font-family:monospace;margin-bottom:6px}
.btn-shutdown{background:var(--danger);color:#fff;border:none;padding:5px 12px;border-radius:4px;font-size:11px;cursor:pointer;transition:.2s}
.btn-shutdown:hover{background:#dc2626}
.btn-shutdown-all{background:var(--danger);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;transition:.2s}
.btn-shutdown-all:hover{background:#dc2626}
</style></head><body>
<div class="login" id="loginPage"><div class="login-box">
<h2>自助机管理后台</h2>
<p>输入管理密码以继续</p>
<input type="password" id="pwdInput" placeholder="管理密码" onkeydown="if(event.key==='Enter')doLogin()">
<button onclick="doLogin()">登 录</button>
<div class="login-err" id="loginError">密码错误，请重试</div>
</div></div>
<div class="app" id="appPage">
<div class="main-area">
<div class="status-bar">
<div class="status-left"><div class="status-dot" id="statusDot"></div><span class="status-title">自助机管理后台</span></div>
<div class="status-right"><span id="uptimeTag" style="font-size:11px;color:var(--text-muted)"></span><span id="versionTag" style="font-size:11px;color:var(--text-muted)"></span><button class="btn-logout" onclick="checkUpdate()" style="margin-right:6px">检查更新</button><button class="btn-logout" onclick="doLogout()">登出</button></div>
</div>
<div class="stats-bar">
<div class="stat-card"><div class="stat-num" id="sPage">-</div><div class="stat-label">当前页面</div></div>
<div class="stat-card"><div class="stat-num" id="sToday">0</div><div class="stat-label">今日拍照</div></div>
<div class="stat-card"><div class="stat-num" id="sPhotos">0</div><div class="stat-label">已完成</div></div>
<div class="stat-card"><div class="stat-num" id="sUp">0m</div><div class="stat-label">运行时间</div></div>
<div class="stat-card"><div class="stat-num" id="sDevices">0</div><div class="stat-label">在线设备</div></div>
</div>
<div class="quick-ctrl">
<div class="ctrl-grid">
<div class="ctrl-btn" id="ctrlMock" onclick="toggleMock()">
<div class="ctrl-icon">&#9889;</div><div class="ctrl-name">Mock</div><span class="ctrl-status off" id="mockTag">关闭</span>
</div>
<div class="ctrl-btn" id="ctrlMachine" onclick="toggleMachine()">
<div class="ctrl-icon">&#9654;</div><div class="ctrl-name">自助机</div><span class="ctrl-status on" id="machineTag">运行</span>
</div>
<div class="ctrl-btn danger" id="ctrlApi" onclick="toggleApiLock()">
<div class="ctrl-icon">&#128274;</div><div class="ctrl-name">API锁</div><span class="ctrl-status off" id="apiTag">未锁</span>
</div>
</div>
</div>
<div class="slider-card">
<div class="slider-header"><span>空闲超时</span><span class="slider-val" id="timeoutV">120秒</span></div>
<input type="range" id="timeoutSlider" min="60" max="600" step="30" value="120" oninput="updateTimeout(this.value)">
</div>
<div class="tunnel-card">
<span class="tunnel-url" id="sTunnel">-</span>
<button class="tunnel-copy" onclick="copyTunnel()">复制</button>
</div>
<div class="photos-section">
<div class="photos-header">
<span class="photos-title">已完成照片</span>
<div class="photos-actions">
<button class="btn-sm btn-ghost" onclick="loadPhotos()">刷新</button>
<button class="btn-sm btn-danger" onclick="confirmClearAll()">清空全部</button>
</div>
</div>
<div class="photo-grid" id="photoGrid"></div>
<div class="empty" id="emptyState" style="display:none"><div class="empty-icon">&#128247;</div><div class="empty-text">暂无照片</div></div>
</div>
<div class="devices-section">
<div class="devices-header">
<span class="devices-title">设备管理</span>
<div class="devices-actions">
<button class="btn-sm btn-ghost" onclick="loadDevices()">刷新</button>
<button class="btn-shutdown-all" onclick="confirmShutdownAll()">全部关机</button>
</div>
</div>
<div class="device-grid" id="deviceGrid"></div>
<div class="empty" id="emptyDevices" style="display:none"><div class="empty-icon">&#128187;</div><div class="empty-text">暂无设备连接</div></div>
</div>
</div>
</div>
<div id="modalRoot"></div>
<script>
let pwd='';
let _statusInterval=null;
function api(p,m,b){return fetch(p,{method:m||'GET',headers:{'Content-Type':'application/json','X-Admin-Password':pwd},body:b?JSON.stringify(b):undefined}).then(r=>r.json()).catch(()=>({error:'网络错误'}))}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2500)}
function showModal(title,text,btns){
return new Promise(r=>{const o=document.createElement('div');o.className='modal-overlay';
o.innerHTML='<div class="modal"><h3>'+title+'</h3><p>'+text+'</p><div class="modal-btns">'+btns.map((b,i)=>'<button class="'+b.cls+'" data-i="'+i+'">'+b.text+'</button>').join('')+'</div></div>';
o.querySelectorAll('button').forEach(b=>b.onclick=()=>{o.remove();r(parseInt(b.dataset.i))});
document.getElementById('modalRoot').appendChild(o)})}
function doLogin(){
pwd=document.getElementById('pwdInput').value;
if(!pwd){document.getElementById('loginError').textContent='请输入密码';document.getElementById('loginError').style.display='block';return}
document.getElementById('loginError').style.display='none';
fetch('/api/admin/status',{headers:{'X-Admin-Password':pwd}}).then(r=>{
if(r.status===401){document.getElementById('loginError').textContent='密码错误';document.getElementById('loginError').style.display='block';return}
if(!r.ok){document.getElementById('loginError').textContent='服务器错误 ('+r.status+')';document.getElementById('loginError').style.display='block';return}
return r.json()
}).then(r=>{
if(!r||r.error){document.getElementById('loginError').textContent='密码错误';document.getElementById('loginError').style.display='block';return}
document.getElementById('loginPage').style.display='none';
document.getElementById('appPage').classList.add('show');
loadAll();if(_statusInterval)clearInterval(_statusInterval);_statusInterval=setInterval(function(){loadStatus();loadDevices()},30000)
}).catch(e=>{
document.getElementById('loginError').textContent='网络错误，请检查连接';
document.getElementById('loginError').style.display='block'
})}
function doLogout(){pwd='';document.getElementById('appPage').classList.remove('show');document.getElementById('loginPage').style.display='flex';document.getElementById('pwdInput').value=''}
function loadAll(){loadStatus();loadConfig();loadPhotos();loadVersion();loadDevices()}
function loadStatus(){api('/api/admin/status').then(r=>{
document.getElementById('sPage').textContent=r.currentPage||'-';
document.getElementById('sToday').textContent=r.todayCount||0;
document.getElementById('sPhotos').textContent=r.photoCount||0;
document.getElementById('sUp').textContent=r.uptime||'0m';
document.getElementById('uptimeTag').textContent=r.uptime?'运行 '+r.uptime:'';
document.getElementById('sTunnel').textContent=r.tunnelUrl?r.tunnelUrl+'/booth-admin':'未连接';
const dot=document.getElementById('statusDot');
dot.style.background=r.paused?'var(--warning)':'var(--success)';
dot.style.boxShadow=r.paused?'0 0 8px rgba(245,158,11,.4)':'0 0 8px rgba(34,197,94,.4)'})}
function loadConfig(){api('/api/admin/config').then(r=>{
const m=document.getElementById('ctrlMock');m.classList.toggle('active',r.mockMode);
document.getElementById('mockTag').className='ctrl-status '+(r.mockMode?'on':'off');
document.getElementById('mockTag').textContent=r.mockMode?'开启':'关闭';
const mc=document.getElementById('ctrlMachine');mc.classList.toggle('active',r.paused);
document.getElementById('machineTag').className='ctrl-status '+(r.paused?'locked':'on');
document.getElementById('machineTag').textContent=r.paused?'已暂停':'运行';
const apiBtn=document.getElementById('ctrlApi');apiBtn.classList.toggle('active',r.apiLocked);
document.getElementById('apiTag').className='ctrl-status '+(r.apiLocked?'locked':'off');
document.getElementById('apiTag').textContent=r.apiLocked?'已锁定':'未锁';
document.getElementById('timeoutSlider').value=r.idleTimeout||120;
document.getElementById('timeoutV').textContent=(r.idleTimeout||120)+'秒'})}
function toggleMock(){const on=!document.getElementById('ctrlMock').classList.contains('active');api('/api/admin/config','POST',{mockMode:on}).then(()=>{loadConfig();toast(on?'Mock 已开启':'Mock 已关闭')})}
function toggleMachine(){const paused=!document.getElementById('ctrlMachine').classList.contains('active');api('/api/admin/config','POST',{paused}).then(()=>{loadConfig();toast(paused?'自助机已暂停':'自助机已恢复')})}
function toggleApiLock(){const locked=!document.getElementById('ctrlApi').classList.contains('active');
if(locked){showModal('确认锁定','开启API保护后，自助机将无法正常拍照合成。',[{text:'取消',cls:'cancel'},{text:'确认锁定',cls:'confirm'}]).then(i=>{if(i===1)api('/api/admin/config','POST',{apiLocked:true}).then(()=>{loadConfig();toast('API 已锁定')})})}
else{api('/api/admin/config','POST',{apiLocked:false}).then(()=>{loadConfig();toast('API 已解锁')})}}
function updateTimeout(v){document.getElementById('timeoutV').textContent=v+'秒';clearTimeout(window._tt);window._tt=setTimeout(()=>api('/api/admin/config','POST',{idleTimeout:parseInt(v)}),500)}
function copyTunnel(){const url=document.getElementById('sTunnel').textContent;if(url==='-')return;navigator.clipboard.writeText(url).then(()=>toast('已复制'))}
function loadPhotos(){api('/api/admin/photos').then(r=>{
var photos=r.photos||[];
var grid=document.getElementById('photoGrid');
var empty=document.getElementById('emptyState');
if(photos.length===0){grid.innerHTML='';empty.style.display='block';return}
empty.style.display='none';
grid.innerHTML=photos.map(function(p){return '<div class="photo-item" data-name="'+encodeURIComponent(p)+'"><img src="/uploads/'+encodeURIComponent(p)+'" loading="lazy"><span class="photo-name">'+p.split('/').pop()+'</span><div class="photo-overlay"><div class="photo-btns"><button class="dl" data-action="dl">下载</button><button class="rm" data-action="rm">删除</button></div></div></div>'}).join('')})}
function dl(n){window.open('/uploads/'+encodeURIComponent(n))}
document.addEventListener('DOMContentLoaded',function(){
var grid=document.getElementById('photoGrid');
if(grid){
grid.addEventListener('click',function(e){
var btn=e.target.closest('[data-action]');
var card=e.target.closest('.photo-item');
if(!card)return;
var name=decodeURIComponent(card.dataset.name);
if(btn){
var action=btn.dataset.action;
e.stopPropagation();
if(action==='dl'){dl(name)}
if(action==='rm'){showModal('确认删除','确定删除此照片？',[{text:'取消',cls:'cancel'},{text:'删除',cls:'confirm'}]).then(function(i){if(i===1){api('/api/admin/photos/'+encodeURIComponent(name),'DELETE').then(function(){loadPhotos();toast('已删除')})}})}
} else {dl(name)}
});
}
});
function confirmClearAll(){showModal('确认清空','确定清空所有照片？此操作不可恢复！',[{text:'取消',cls:'cancel'},{text:'清空全部',cls:'confirm'}]).then(i=>{if(i===1)api('/api/admin/photos','DELETE').then(()=>{loadPhotos();toast('已清空')})})}
function loadVersion(){api('/api/admin/ota-status').then(r=>{document.getElementById('versionTag').textContent='v'+r.localVersion})}
function checkUpdate(){toast('正在检查...');api('/api/admin/check-update').then(r=>{if(r.hasUpdate){showModal('发现新版本','当前: v'+r.localVersion+' → 最新: v'+r.remoteVersion,[{text:'稍后',cls:'cancel'},{text:'立即更新',cls:'confirm primary'}]).then(i=>{if(i===1){api('/api/admin/do-update','POST').then(()=>{toast('更新中，请等待重启...')})}})}else{toast('已是最新版本 v'+r.localVersion)}}).catch(()=>{toast('检查失败')})}
function loadDevices(){api('/api/admin/devices').then(r=>{var devices=r.devices||[];var onlineCount=devices.filter(function(d){return d.online}).length;document.getElementById('sDevices').textContent=onlineCount;var grid=document.getElementById('deviceGrid');var empty=document.getElementById('emptyDevices');if(devices.length===0){grid.innerHTML='';empty.style.display='block';return}empty.style.display='none';grid.innerHTML=devices.map(function(d){var ago=Math.floor((Date.now()-d.lastSeen)/1000);var timeText=ago<60?ago+'秒前':ago<3600?Math.floor(ago/60)+'分钟前':Math.floor(ago/3600)+'小时前';return '<div class="device-card" data-id="'+encodeURIComponent(d.id)+'"><div class="device-row"><span class="device-name" data-action="rename">'+escHtml(d.name)+'</span><span class="device-status"><span class="device-dot '+(d.online?'on':'off')+'"></span>'+(d.online?'在线':'离线')+'</span></div><div class="device-id">ID: '+escHtml(d.id)+'</div><div class="device-page">当前页面: '+escHtml(d.page)+'</div><div class="device-meta"><span class="device-info">v'+escHtml(d.version)+' · '+timeText+'</span><button class="btn-shutdown" data-action="shutdown">关机</button></div></div>'}).join('')})}
function escHtml(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function confirmShutdownAll(){api('/api/admin/devices').then(function(r){var devices=r.devices||[];if(devices.length===0){toast('无在线设备');return}showModal('全部关机','确定向所有 '+devices.length+' 台设备发送关机命令？此操作不可撤销！',[{text:'取消',cls:'cancel'},{text:'确认全部关机',cls:'confirm'}]).then(function(i){if(i===1){api('/api/admin/devices/shutdown-all','POST').then(function(r2){loadDevices();toast('已向 '+r2.count+' 台设备发送关机命令')})}})})}
document.addEventListener('DOMContentLoaded',function(){
var grid=document.getElementById('deviceGrid');
if(grid){
grid.addEventListener('click',function(e){
var btn=e.target.closest('[data-action]');
if(!btn)return;
var card=btn.closest('.device-card');
if(!card)return;
var id=decodeURIComponent(card.dataset.id);
var action=btn.dataset.action;
if(action==='shutdown'){
showModal('确认关机','确定向设备 '+id+' 发送关机命令？',[{text:'取消',cls:'cancel'},{text:'确认关机',cls:'confirm'}]).then(function(i){if(i===1){api('/api/admin/devices/'+encodeURIComponent(id)+'/shutdown','POST').then(function(){loadDevices();toast('已发送关机命令')})}});
}
});
grid.addEventListener('dblclick',function(e){
var nameEl=e.target.closest('[data-action="rename"]');
if(!nameEl)return;
var card=nameEl.closest('.device-card');
if(!card)return;
var id=decodeURIComponent(card.dataset.id);
var oldName=nameEl.textContent;
var inp=document.createElement('input');
inp.className='device-name-input';
inp.value=oldName;
inp.onblur=function(){
var newName=inp.value.trim()||id;
api('/api/admin/devices/'+encodeURIComponent(id)+'/name','PUT',{name:newName}).then(function(){loadDevices();toast('设备已重命名')});
};
inp.onkeydown=function(ev){if(ev.key==='Enter')inp.blur()};
nameEl.replaceWith(inp);
inp.focus();
inp.select();
});
}
});
</script></body></html>`
}

// ===== Cloudflare Tunnel（命名隧道，固定域名）=====
const CLOUDFLARED_BIN = join(__dirname, 'cloudflared.exe')
const TUNNEL_TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN || ''

// ===== OTA 热更新（纯 Node.js，零外部依赖）=====

// 跳过路径检查
function shouldSkip(path) {
  return OTA_SKIP.some(s => path.startsWith(s) || path === s.replace(/\/$/, ''))
}

async function checkForUpdate() {
  try {
    const resp = await fetch(OTA_URL, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return null
    const remote = await resp.json()
    if (remote.version && remote.version !== localVersion) return remote
    return null
  } catch { return null }
}

async function performUpdate() {
  if (updateStatus === 'updating') return
  updateStatus = 'updating'
  updateMessage = '正在更新...'

  try {
    // 1. 获取远程文件树
    updateMessage = '检查文件差异...'
    const treeResp = await fetch(OTA_TREE_URL, {
      headers: { 'User-Agent': 'ai-photo-booth' },
      signal: AbortSignal.timeout(30000),
    })
    if (!treeResp.ok) throw new Error(`获取文件树失败: ${treeResp.status}`)
    const treeData = await treeResp.json()
    const remoteFiles = treeData.tree.filter(f => f.type === 'blob' && !shouldSkip(f.path))
    const remoteSha = treeData.sha

    // 2. 对比差异（SHA 不同的文件才下载）
    const toDownload = []
    let localFileMap = {}
    try {
      const state = JSON.parse(await readFile(OTA_STATE_PATH, 'utf-8'))
      localFileMap = state.files || {}
    } catch {}

    for (const file of remoteFiles) {
      if (localFileMap[file.path] !== file.sha) {
        toDownload.push(file)
      }
    }

    if (toDownload.length === 0 && remoteSha === localSha) {
      updateStatus = 'idle'
      updateMessage = '无更新'
      return
    }

    // 3. 逐个下载变更文件
    updateMessage = `下载 ${toDownload.length} 个文件...`
    let downloaded = 0
    for (const file of toDownload) {
      const url = OTA_RAW_BASE + encodeURI(file.path)
      const localPath = join(__dirname, file.path)
      const dir = dirname(localPath)

      // 确保目录存在
      if (!existsSync(dir)) await mkdir(dir, { recursive: true })

      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) {
        console.warn(`[OTA] 跳过 ${file.path}: HTTP ${resp.status}`)
        continue
      }
      const buf = Buffer.from(await resp.arrayBuffer())
      await writeFile(localPath, buf)
      localFileMap[file.path] = file.sha
      downloaded++

      // 每 10 个文件更新一次进度
      if (downloaded % 10 === 0) {
        updateMessage = `下载中 ${downloaded}/${toDownload.length}...`
      }
    }

    // 4. 删除远程已移除的文件
    const remotePaths = new Set(remoteFiles.map(f => f.path))
    for (const [path] of Object.entries(localFileMap)) {
      if (!remotePaths.has(path) && !shouldSkip(path)) {
        try { await unlink(join(__dirname, path)) } catch {}
        delete localFileMap[path]
      }
    }

    // 5. 安装依赖
    updateMessage = '安装依赖...'
    await new Promise((resolve, reject) => {
      const cmd = isWin ? 'npm.cmd' : 'npm'
      const child = spawn(cmd, ['install'], { cwd: __dirname, stdio: 'ignore' })
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`npm install 退出码 ${code}`)))
      child.on('error', reject)
    })

    // 6. 保存更新状态
    try {
      const pkg = JSON.parse(await readFile(PKG_PATH, 'utf-8'))
      localVersion = pkg.version || localVersion
    } catch {}
    localSha = remoteSha
    await writeFile(OTA_STATE_PATH, JSON.stringify({ sha: remoteSha, files: localFileMap, updated: new Date().toISOString() }))

    updateStatus = 'done'
    updateMessage = `更新完成 v${localVersion}（${downloaded} 个文件），正在重启...`

    // 7. 自动重启
    setTimeout(() => {
      const cmd = isWin ? 'npm.cmd' : 'npm'
      const child = spawn(cmd, ['start'], { cwd: __dirname, detached: true, stdio: 'ignore', ...(isWin ? { windowsHide: true } : {}) })
      child.unref()
      process.exit(0)
    }, 2000)
  } catch (err) {
    updateStatus = 'error'
    updateMessage = `更新失败: ${err.message}`
  }
}

// 管理 API
app.get('/api/admin/check-update', authMiddleware, async (req, res) => {
  const remote = await checkForUpdate()
  res.json({ localVersion, remoteVersion: remote?.version || null, hasUpdate: !!remote, status: updateStatus, message: updateMessage })
})

app.post('/api/admin/do-update', authMiddleware, (req, res) => {
  performUpdate()
  res.json({ success: true, message: '更新已启动' })
})

app.get('/api/admin/ota-status', authMiddleware, (req, res) => {
  res.json({ localVersion, status: updateStatus, message: updateMessage })
})

// 定时检查
setInterval(async () => {
  const remote = await checkForUpdate()
  if (remote) {
    console.log(`[OTA] 发现新版本 ${remote.version}，自动更新...`)
    await performUpdate()
  }
}, OTA_INTERVAL)

function startTunnel() {
  if (!existsSync(CLOUDFLARED_BIN) || !TUNNEL_TOKEN) return

  try {
    const tunnel = spawn(CLOUDFLARED_BIN, ['tunnel', 'run', '--token', TUNNEL_TOKEN], {
      stdio: 'ignore',
      windowsHide: true,
    })

    tunnel.unref()

    tunnel.on('error', (err) => {
      console.error('cloudflared 启动失败:', err.message)
      setTimeout(startTunnel, 5000)
    })

    tunnel.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`cloudflared 退出 (code=${code})，5秒后重启...`)
        setTimeout(startTunnel, 5000)
      }
    })

    const cleanup = () => { try { tunnel.kill() } catch {} }
    process.on('exit', cleanup)
  } catch (err) {
    console.error('cloudflared spawn 失败:', err.message)
    setTimeout(startTunnel, 5000)
  }
}

// ===== 优雅退出 =====
process.on('SIGINT', () => {
  console.log('\n收到 SIGINT，正在关闭...')
  process.exit(0)
})

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动 :${PORT}`)
  startTunnel()
})
