import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { writeFile, mkdir, readdir, unlink, readFile, rm } from 'fs/promises'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import { spawn, execSync } from 'child_process'
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import COS from 'cos-nodejs-sdk-v5'

config()

// 腾讯云 COS 客户端
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
})
const COS_BUCKET = process.env.COS_BUCKET
const COS_REGION = process.env.COS_REGION
const COS_ENABLED = !!(COS_BUCKET && COS_REGION)

// 上传文件到 COS
async function uploadToCOS(key, buffer, contentType = 'image/jpeg') {
  if (!COS_ENABLED) return null
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }, (err, data) => {
      if (err) reject(err)
      else resolve(`https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`)
    })
  })
}
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = 3001
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '888888'
const startTime = Date.now()
const isWin = process.platform === 'win32'

// 启动时警告默认密码
if (ADMIN_PASSWORD === '888888') {
  console.warn('⚠️  使用默认管理密码 888888，请在 .env 中设置 ADMIN_PASSWORD')
}

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

// ===== 照片缓存（避免每次从COS拉取）=====
const photoCache = new Map() // photoId -> { buffer, contentType, cachedAt }
const PHOTO_CACHE_TTL = 3600000 // 1小时

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
app.use(cors({
  origin: process.env.PUBLIC_HOST ? [`https://${process.env.PUBLIC_HOST}`, `http://${process.env.PUBLIC_HOST}`] : true,
  credentials: true,
}))
app.use(compression())
app.use(express.json({ limit: '10mb' }))

// 简易速率限制（内存计数器）
const rateLimitMap = new Map()
function rateLimit(key, maxPerMinute = 30) {
  const now = Date.now()
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + 60000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000 }
  entry.count++
  rateLimitMap.set(key, entry)
  return entry.count <= maxPerMinute
}

// 每5分钟清理过期的速率限制条目和离线设备
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key)
  }
  for (const [id, device] of devices) {
    if (now - device.lastSeen > 600000) { // 10分钟未活动
      devices.delete(id)
      deviceCommands.delete(id)
    }
  }
  // 清理过期照片缓存
  for (const [id, entry] of photoCache) {
    if (now - entry.cachedAt > PHOTO_CACHE_TTL) photoCache.delete(id)
  }
}, 300000)

// 静态文件服务
const uploadsDir = join(__dirname, 'uploads')
if (!existsSync(uploadsDir)) {
  await mkdir(uploadsDir, { recursive: true })
}
app.use('/uploads', express.static(uploadsDir))

// 服务 public 目录的静态文件（边框图片等）
const publicDir = join(__dirname, 'public')
app.use(express.static(publicDir))

// 生产环境：服务前端构建文件
const distDir = join(__dirname, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
}

// SQLite 数据库
const dbPath = join(__dirname, 'data.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    used INTEGER DEFAULT 0
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    style TEXT,
    frame TEXT,
    reg_id INTEGER,
    type TEXT DEFAULT 'ai',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// 添加type字段（如果不存在）
try {
  db.exec("ALTER TABLE photos ADD COLUMN type TEXT DEFAULT 'ai'")
} catch {}

// AI 风格管理
db.exec(`
  CREATE TABLE IF NOT EXISTS styles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  )
`)

// 相框管理
db.exec(`
  CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  )
`)

// 系统参数
db.exec(`
  CREATE TABLE IF NOT EXISTS params (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
  )
`)

// 初始化默认风格
const defaultStyles = [
  { id: 'guofeng', name: '古风', prompt: '转换为古风中国画风格，水墨质感，古典优雅，保持人物面部清晰', sort: 1 },
  { id: 'guochao', name: '国潮', prompt: '转换为国潮艺术风格，鲜艳色彩，现代中国风，潮流插画感', sort: 2 },
  { id: 'jiaopian', name: '胶片风', prompt: '转换为复古胶片摄影风格，暖色调，颗粒质感，怀旧氛围', sort: 3 },
  { id: 'qingxin', name: '小清新', prompt: '转换为小清新风格，明亮柔和色调，自然光线，清新淡雅', sort: 4 },
  { id: 'youhua', name: '油画', prompt: '转换为油画风格，厚重笔触质感，丰富色彩层次，艺术感强', sort: 5 },
  { id: 'sumiao', name: '素描', prompt: '转换为铅笔素描风格，黑白线条，细腻明暗关系，写实素描', sort: 6 },
]
const insertStyle = db.prepare('INSERT OR IGNORE INTO styles (id, name, prompt, sort_order) VALUES (?, ?, ?, ?)')
for (const s of defaultStyles) {
  insertStyle.run(s.id, s.name, s.prompt, s.sort)
}

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
app.use('/api/save-photos', apiGateMiddleware)

// ===== 管理员认证（含暴力破解防护）=====
const adminFailMap = new Map()
function authMiddleware(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  const entry = adminFailMap.get(ip)
  if (entry && entry.count >= 10 && Date.now() < entry.blockUntil) {
    return res.status(429).json({ error: '尝试次数过多，请5分钟后再试' })
  }
  const token = req.headers['x-admin-password']
  if (token !== ADMIN_PASSWORD) {
    const now = Date.now()
    const cur = adminFailMap.get(ip) || { count: 0, blockUntil: 0 }
    cur.count++
    if (cur.count >= 10) cur.blockUntil = now + 300000
    adminFailMap.set(ip, cur)
    return res.status(401).json({ error: '未授权' })
  }
  adminFailMap.delete(ip)
  next()
}

// ===== 现有 API =====

app.post('/api/upload', async (req, res) => {
  // 速率限制：每 IP 每分钟最多 20 次上传
  if (!rateLimit(`upload:${req.ip}`, 20)) {
    return res.status(429).json({ error: '上传太频繁' })
  }
  try {
    const { image, filename } = req.body
    if (!image) return res.status(400).json({ error: '没有图片数据' })
    // 验证是图片 base64
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: '仅支持图片格式' })
    }
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    // 文件大小限制（10MB）
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '文件过大（最大10MB）' })
    }
    // 验证图片魔数
    const isJpg = buffer[0] === 0xFF && buffer[1] === 0xD8
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    const isWebp = buffer.length > 12 && buffer.toString('ascii', 8, 12) === 'WEBP'
    if (!isJpg && !isPng && !isWebp) {
      return res.status(400).json({ error: '不支持的图片格式' })
    }
    const sanitized = (filename || `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`).replace(/\.\.|[\/\\]/g, '').slice(0, 100)
    const uniqueFilename = sanitized || `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
    const filepath = join(uploadsDir, uniqueFilename)
    const resolved = resolve(filepath)
    if (!resolved.startsWith(resolve(uploadsDir))) {
      return res.status(403).json({ error: '禁止访问' })
    }
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

// 下载页面（手机端扫码下载带边框的照片）- 必须在 /download/:filename 之前
app.get('/download', (req, res) => {
  res.send(getDownloadHTML())
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

// 代理图片（仅允许 DashScope OSS 域名，防止 SSRF）
const ALLOWED_PROXY_HOSTS = [
  'dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com',
  'dashscope-7c2c.oss-accelerate.aliyuncs.com',
  'dashscope.aliyuncs.com',
  'cdn.ai-photo-cdn.pages.dev',
  'ai-photo-cdn.pages.dev',
  'ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com',
]

app.get('/api/proxy-image', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') return res.status(400).json({ error: '缺少 url 参数' })
    // 校验 URL 域名
    let parsed
    try { parsed = new URL(url) } catch { return res.status(400).json({ error: '无效 URL' }) }
    if (!ALLOWED_PROXY_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
      return res.status(403).json({ error: '不允许的域名' })
    }
    const resp = await fetch(url, { signal: AbortSignal.timeout(90000) })
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

// DashScope API 代理（前端通过此端点调用 AI 接口，避免 CORS）
app.all('/dashscope/{*path}', async (req, res) => {
  try {
    const targetUrl = `https://dashscope.aliyuncs.com${req.url.replace('/dashscope', '')}`
    const headers = { ...req.headers, host: 'dashscope.aliyuncs.com' }
    delete headers['origin']
    delete headers['referer']
    const fetchOptions = {
      method: req.method,
      headers,
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body)
    }
    fetchOptions.signal = AbortSignal.timeout(90000)
    const resp = await fetch(targetUrl, fetchOptions)
    const data = await resp.text()
    res.status(resp.status)
    res.set('Content-Type', resp.headers.get('content-type') || 'application/json')
    res.send(data)
  } catch (err) {
    console.error('DashScope 代理失败:', err)
    res.status(500).json({ error: 'DashScope 代理失败' })
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
// 关机端点（仅允许本地请求或管理员密码）
app.post('/api/device/local-shutdown', (req, res) => {
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
  const hasAuth = req.headers['x-admin-password'] === ADMIN_PASSWORD
  if (!isLocal && !hasAuth) {
    return res.status(403).json({ error: '禁止访问' })
  }
  console.log('[Shutdown] 收到远程关机指令，正在关闭...')
  res.json({ ok: true })
  writeFile(join(__dirname, '.shutdown'), new Date().toISOString()).catch(() => {})
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

// ===== 扫码登记 API =====

// 用户扫码登记
app.post('/api/register', (req, res) => {
  // 速率限制：每 IP 每分钟最多 5 次
  if (!rateLimit(`register:${req.ip}`, 5)) {
    return res.status(429).json({ error: '操作太频繁，请稍后再试' })
  }
  const { name, className, phone } = req.body
  if (!name || !className) return res.status(400).json({ error: '姓名和班级必填' })
  // 输入长度校验
  if (name.length > 50 || className.length > 50 || (phone && phone.length > 20)) {
    return res.status(400).json({ error: '输入内容过长' })
  }
  // 清理输入
  const cleanName = String(name).trim().slice(0, 50)
  const cleanClass = String(className).trim().slice(0, 50)
  const cleanPhone = phone ? String(phone).trim().slice(0, 20) : ''
  // 手机号格式校验（非空时必须11位数字）
  if (cleanPhone && !/^1[3-9]\d{9}$/.test(cleanPhone)) {
    return res.status(400).json({ error: '请输入正确的11位手机号' })
  }
  const stmt = db.prepare("INSERT INTO registrations (name, class_name, phone, created_at) VALUES (?, ?, ?, datetime('now', '+8 hours'))")
  const result = stmt.run(cleanName, cleanClass, cleanPhone)
  res.json({ success: true, id: result.lastInsertRowid })
})

// 获取最新登记（自助机轮询）
app.get('/api/registration/latest', (req, res) => {
  const row = db.prepare('SELECT * FROM registrations WHERE used = 0 ORDER BY id DESC LIMIT 1').get()
  if (!row) return res.json({ registration: null })
  res.json({ registration: row })
})

// 确认登记已使用
app.post('/api/registration/:id/use', (req, res) => {
  db.prepare('UPDATE registrations SET used = 1 WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// URL白名单验证（复用ALLOWED_PROXY_HOSTS）
function isAllowedUrl(urlStr) {
  if (urlStr.startsWith('data:')) return true
  try {
    const parsed = new URL(urlStr)
    return ALLOWED_PROXY_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  } catch { return false }
}

// 生成COS预签名URL（前端直传COS用）
app.post('/api/cos-sign', (req, res) => {
  if (!COS_ENABLED) return res.status(503).json({ error: 'COS未配置' })
  const { filename } = req.body
  const key = `photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
  const url = cos.getObjectUrl({
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: key,
    Sign: true,
    Method: 'PUT',
    Expires: 300, // 5分钟有效
  })
  res.json({ url, key })
})

// 记录照片到数据库（前端直传COS后调用）
app.post('/api/save-photo-record', (req, res) => {
  try {
    const { cosUrl, style, regId, type } = req.body
    if (!cosUrl) return res.status(400).json({ error: '缺少cosUrl' })
    const result = db.prepare("INSERT INTO photos (filename, style, reg_id, type, created_at) VALUES (?, ?, ?, ?, datetime('now', '+8 hours'))").run(cosUrl, style || '', regId || null, type || 'ai')
    res.json({ success: true, id: result.lastInsertRowid })
  } catch (err) {
    console.error('保存照片记录失败:', err)
    res.status(500).json({ error: '保存失败' })
  }
})

// 短链接（QR码用，重定向到COS URL）
app.get('/p/:id', (req, res) => {
  try {
    const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id)
    if (!photo) return res.status(404).json({ error: '照片不存在' })
    res.redirect(photo.filename)
  } catch (err) {
    res.status(500).json({ error: '查询失败' })
  }
})

// API：通过照片ID获取URL（下载页面用，返回JSON）
app.get('/api/p/:id', (req, res) => {
  try {
    const photo = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id)
    if (!photo) return res.status(404).json({ error: '照片不存在' })
    res.json({ url: photo.filename })
  } catch (err) {
    res.status(500).json({ error: '查询失败' })
  }
})

// 直接serve照片文件（同源，无CORS问题，下载页用，带内存+磁盘双重缓存）
app.get('/dl/:id', async (req, res) => {
  try {
    const photoId = req.params.id
    // 1. 检查内存缓存
    const cached = photoCache.get(photoId)
    if (cached && Date.now() - cached.cachedAt < PHOTO_CACHE_TTL) {
      res.set('Content-Type', cached.contentType)
      res.set('Cache-Control', 'public, max-age=3600')
      res.set('X-Cache', 'HIT')
      return res.send(cached.buffer)
    }

    const photo = db.prepare('SELECT filename, type FROM photos WHERE id = ?').get(photoId)
    if (!photo) return res.status(404).json({ error: '照片不存在' })
    const filename = photo.filename

    // 2. 本地文件直接serve
    if (filename.startsWith('/uploads/')) {
      const filepath = join(__dirname, filename)
      const resolved = resolve(filepath)
      if (!resolved.startsWith(resolve(uploadsDir))) return res.status(403).json({ error: '禁止访问' })
      if (!existsSync(filepath)) return res.status(404).json({ error: '文件不存在' })
      res.set('Cache-Control', 'public, max-age=3600')
      res.set('X-Cache', 'LOCAL')
      return res.sendFile(resolved)
    }

    // 3. 远程URL → fetch并缓存到本地+内存
    if (filename.startsWith('http')) {
      console.log(`[dl] fetching from remote: ${filename.slice(0, 80)}`)
      const resp = await fetch(filename, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) return res.status(502).json({ error: '远程图片获取失败' })
      const buffer = Buffer.from(await resp.arrayBuffer())
      const contentType = resp.headers.get('content-type') || 'image/jpeg'

      // 保存到本地磁盘
      const finishedDir = join(uploadsDir, '已完成照片')
      await mkdir(finishedDir, { recursive: true })
      const localFilename = `cached_${photoId}_${Date.now()}.jpg`
      const localFilepath = join(finishedDir, localFilename)
      await writeFile(localFilepath, buffer)
      const localDbPath = `/uploads/已完成照片/${localFilename}`
      // 更新DB，下次直接读本地
      db.prepare('UPDATE photos SET filename = ? WHERE id = ?').run(localDbPath, photoId)
      console.log(`[dl] saved to local: ${localDbPath}, ${buffer.length} bytes`)

      // 存入内存缓存
      photoCache.set(photoId, { buffer, contentType, cachedAt: Date.now() })
      res.set('Content-Type', contentType)
      res.set('Cache-Control', 'public, max-age=3600')
      res.set('X-Cache', 'MISS')
      return res.send(buffer)
    }

    // 其他URL重定向
    res.redirect(filename)
  } catch (err) {
    console.error('serve照片失败:', err)
    res.status(500).json({ error: '加载失败' })
  }
})

// 保存两份照片（原版+AI版，并行保存，优先上传到COS）
app.post('/api/save-photos', async (req, res) => {
  try {
    const { originalUrl, aiUrl, regId, style } = req.body
    if (!originalUrl || !aiUrl) return res.status(400).json({ error: '缺少照片URL' })
    if (!isAllowedUrl(originalUrl) || !isAllowedUrl(aiUrl)) {
      return res.status(403).json({ error: '不允许的图片来源域名' })
    }

    // 确保目录存在（幂等，不需要检查存在）
    const finishedDir = join(uploadsDir, '已完成照片')
    await mkdir(finishedDir, { recursive: true })

    const timestamp = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const originalFilename = `original_${timestamp}.jpg`
    const aiFilename = `ai_${timestamp}.jpg`

    // 辅助函数：获取图片buffer
    async function fetchImageBuffer(url, referer) {
      if (url.startsWith('data:')) {
        const base64Data = url.replace(/^data:image\/\w+;base64,/, '')
        return Buffer.from(base64Data, 'base64')
      }
      const opts = { signal: AbortSignal.timeout(30000) }
      if (referer) opts.headers = { 'Referer': referer }
      const resp = await fetch(url, opts)
      if (!resp.ok) throw new Error(`下载图片失败: ${resp.status}`)
      return Buffer.from(await resp.arrayBuffer())
    }

    // 并行下载两张照片
    const [originalBuffer, aiBuffer] = await Promise.all([
      fetchImageBuffer(originalUrl),
      fetchImageBuffer(aiUrl, 'https://dashscope.aliyuncs.com/'),
    ])

    // 并行上传到COS + 写入本地文件
    const [originalCosUrl, aiCosUrl] = await Promise.all([
      COS_ENABLED ? uploadToCOS(`photos/${originalFilename}`, originalBuffer).catch(e => { console.error('[COS] 原版上传失败:', e); return null }) : null,
      COS_ENABLED ? uploadToCOS(`photos/${aiFilename}`, aiBuffer).catch(e => { console.error('[COS] AI版上传失败:', e); return null }) : null,
    ])

    // 本地备份（COS可用时作为备份，COS不可用时作为主存储）
    await Promise.all([
      writeFile(join(finishedDir, originalFilename), originalBuffer),
      writeFile(join(finishedDir, aiFilename), aiBuffer),
    ])

    console.log(`[保存] 原版: ${originalFilename} (${originalBuffer.length} bytes) COS:${!!originalCosUrl}`)
    console.log(`[保存] AI版: ${aiFilename} (${aiBuffer.length} bytes) COS:${!!aiCosUrl}`)

    // 事务写入数据库（优先本地路径，COS URL作备份）
    const localOriginal = `/uploads/已完成照片/${originalFilename}`
    const localAi = `/uploads/已完成照片/${aiFilename}`
    const originalPath = localOriginal
    const aiPath = localAi
    let aiPhotoId = null
    const insertPhotos = db.transaction(() => {
      db.prepare("INSERT INTO photos (filename, style, reg_id, type, created_at) VALUES (?, ?, ?, 'original', datetime('now', '+8 hours'))").run(originalPath, style || '', regId || null)
      const result = db.prepare("INSERT INTO photos (filename, style, reg_id, type, created_at) VALUES (?, ?, ?, 'ai', datetime('now', '+8 hours'))").run(aiPath, style || '', regId || null)
      aiPhotoId = result.lastInsertRowid
    })
    insertPhotos()

    res.json({
      success: true,
      cos: COS_ENABLED,
      aiPhotoId,
      photos: [
        { type: 'original', filename: originalPath },
        { type: 'ai', filename: aiPath },
      ]
    })
  } catch (err) {
    console.error('保存照片失败:', err)
    res.status(500).json({ error: '保存失败: ' + err.message })
  }
})

// 管理员：清空登记
app.delete('/api/admin/registrations', authMiddleware, (req, res) => {
  db.exec('DELETE FROM registrations')
  res.json({ success: true })
})

// 登记页面（手机端访问）
app.get('/register', (req, res) => {
  res.send(getRegisterHTML())
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
    // 路径穿越检查
    const resolved = resolve(filepath)
    if (!resolved.startsWith(resolve(uploadsDir))) {
      return res.status(403).json({ error: '禁止访问' })
    }
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

// ===== 服务器管理 API =====

// 系统信息
app.get('/api/admin/server-info', authMiddleware, (req, res) => {
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const uptime = os.uptime()
  let diskUsage = ['0', '0', '0', '0%']
  try {
    diskUsage = execSync("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'", { timeout: 5000 }).toString().trim().split(' ')
  } catch {}

  res.json({
    cpu: {
      model: cpus[0]?.model || 'Unknown',
      cores: cpus.length,
      usage: Math.min(100, Math.round(os.loadavg()[0] / cpus.length * 100))
    },
    memory: {
      total: Math.round(totalMem / 1024 / 1024),
      used: Math.round((totalMem - freeMem) / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      percent: Math.round((1 - freeMem / totalMem) * 100)
    },
    disk: {
      total: diskUsage[0] || '0',
      used: diskUsage[1] || '0',
      free: diskUsage[2] || '0',
      percent: diskUsage[3] || '0%'
    },
    uptime: Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm',
    nodeVersion: process.version,
    platform: os.platform(),
    hostname: os.hostname()
  })
})

// 获取日志
app.get('/api/admin/logs', authMiddleware, (req, res) => {
  const lines = Math.min(Math.max(parseInt(req.query.lines) || 100, 1), 1000)
  try {
    const logs = execSync(`sudo pm2 logs ai-photo --nostream --lines ${lines} 2>&1 | head -${lines}`, { timeout: 5000 }).toString()
    res.json({ logs })
  } catch (err) {
    res.json({ logs: '无法获取日志: ' + err.message })
  }
})

// 重启服务
app.post('/api/admin/restart', authMiddleware, (req, res) => {
  try {
    execSync('sudo pm2 restart ai-photo', { timeout: 10000 })
    res.json({ success: true, message: '服务已重启' })
  } catch (err) {
    res.status(500).json({ error: '重启失败: ' + err.message })
  }
})

// 读取 .env
app.get('/api/admin/env', authMiddleware, async (req, res) => {
  try {
    const envContent = await readFile(join(__dirname, '.env'), 'utf-8')
    const env = {}
    envContent.split('\n').forEach(line => {
      const [key, ...value] = line.split('=')
      if (key && !key.startsWith('#')) {
        env[key.trim()] = value.join('=').trim()
      }
    })
    res.json({ env })
  } catch (err) {
    res.status(500).json({ error: '读取失败' })
  }
})

// 更新 .env
app.post('/api/admin/env', authMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body
    if (!key) return res.status(400).json({ error: '缺少 key' })

    let envContent = ''
    try { envContent = await readFile(join(__dirname, '.env'), 'utf-8') } catch {}

    const lines = envContent.split('\n')
    let found = false
    const newLines = lines.map(line => {
      if (line.startsWith(key + '=')) {
        found = true
        return `${key}=${value}`
      }
      return line
    })

    if (!found) newLines.push(`${key}=${value}`)
    await writeFile(join(__dirname, '.env'), newLines.join('\n'))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '更新失败' })
  }
})

// ===== 数据管理 API =====

// 获取登记记录（增强版，支持分页搜索）
app.get('/api/admin/registrations', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 50
  const search = req.query.search || ''
  const offset = (page - 1) * limit

  let query = 'SELECT * FROM registrations'
  let countQuery = 'SELECT COUNT(*) as total FROM registrations'
  const params = []

  if (search) {
    const where = ' WHERE name LIKE ? OR class_name LIKE ? OR phone LIKE ?'
    query += where
    countQuery += where
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  query += ' ORDER BY id DESC LIMIT ? OFFSET ?'

  const total = db.prepare(countQuery).get(...params).total
  const rows = db.prepare(query).all(...params, limit, offset)

  res.json({ registrations: rows, total, page, limit })
})

// 获取照片记录（关联登记信息）
app.get('/api/admin/photos-with-info', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const offset = (page - 1) * limit

    // 从数据库获取照片记录（关联登记）
    const rows = db.prepare(`
      SELECT p.*, r.name, r.class_name, r.phone
      FROM photos p
      LEFT JOIN registrations r ON p.reg_id = r.id
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset)

    const total = db.prepare('SELECT COUNT(*) as total FROM photos').get().total

    // 检查文件实际路径，添加正确的URL
    const photosWithUrl = rows.map(p => {
      let url = `/uploads/${p.filename}`
      // 检查文件是否在根目录
      if (!existsSync(join(uploadsDir, p.filename))) {
        // 检查是否在已完成照片目录
        const finishedPath = join(uploadsDir, '已完成照片', p.filename)
        if (existsSync(finishedPath)) {
          // 对中文路径进行编码
          url = `/uploads/${encodeURIComponent('已完成照片')}/${p.filename}`
        }
      }
      return { ...p, url }
    })

    res.json({ photos: photosWithUrl, total, page, limit })
  } catch (err) {
    res.status(500).json({ error: '获取失败' })
  }
})

// 统计数据
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)

    // 今日拍照数
    const todayCount = db.prepare("SELECT COUNT(*) as c FROM photos WHERE date(created_at) = ?").get(today).c

    // 总照片数
    const totalCount = db.prepare("SELECT COUNT(*) as c FROM photos").get().c

    // 总登记数
    const totalRegs = db.prepare("SELECT COUNT(*) as c FROM registrations").get().c

    // 风格分布
    const styleStats = db.prepare("SELECT style, COUNT(*) as count FROM photos GROUP BY style ORDER BY count DESC").all()

    // 最近7天每日数量
    const dailyStats = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM photos
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).all()

    res.json({ todayCount, totalCount, totalRegs, styleStats, dailyStats })
  } catch (err) {
    res.status(500).json({ error: '统计失败' })
  }
})

// CSV转义函数（防止CSV注入）
function csvEscape(val) {
  if (val == null) return ''
  const str = String(val)
  // 防止CSV注入：公式字符前加tab
  const safe = /^[=+\-@\t\r]/.test(str) ? '\t' + str : str
  // 转义双引号
  return '"' + safe.replace(/"/g, '""') + '"'
}

// 导出 CSV
app.get('/api/admin/export/csv', authMiddleware, (req, res) => {
  try {
    const type = req.query.type || 'registrations'

    if (type === 'registrations') {
      const rows = db.prepare('SELECT * FROM registrations ORDER BY id DESC').all()
      const csv = '﻿' + 'ID,姓名,班级,手机号,登记时间,已使用\n' +
        rows.map(r => `${r.id},${csvEscape(r.name)},${csvEscape(r.class_name)},${csvEscape(r.phone)},${csvEscape(r.created_at)},${r.used}`).join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=registrations.csv')
      res.send(csv)
    } else if (type === 'photos') {
      const rows = db.prepare(`
        SELECT p.*, r.name, r.class_name
        FROM photos p
        LEFT JOIN registrations r ON p.reg_id = r.id
        ORDER BY p.id DESC
      `).all()
      const csv = '﻿' + 'ID,文件名,风格,相框,登记ID,姓名,班级,拍摄时间\n' +
        rows.map(r => `${r.id},${csvEscape(r.filename)},${csvEscape(r.style)},${csvEscape(r.frame)},${r.reg_id||''},${csvEscape(r.name)},${csvEscape(r.class_name)},${csvEscape(r.created_at)}`).join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=photos.csv')
      res.send(csv)
    }
  } catch (err) {
    res.status(500).json({ error: '导出失败' })
  }
})

// ===== 内容配置 API =====

// 获取风格列表
app.get('/api/admin/styles', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM styles ORDER BY sort_order').all()
  res.json({ styles: rows })
})

// 添加/修改风格
app.post('/api/admin/styles', authMiddleware, (req, res) => {
  const { id, name, prompt, enabled, sort_order } = req.body
  if (!id || !name || !prompt) return res.status(400).json({ error: '缺少必填字段' })

  db.prepare('INSERT OR REPLACE INTO styles (id, name, prompt, enabled, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, prompt, enabled ?? 1, sort_order ?? 0)
  res.json({ success: true })
})

// 删除风格
app.delete('/api/admin/styles/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM styles WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// 获取相框列表
app.get('/api/admin/frames', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM frames ORDER BY sort_order').all()
  res.json({ frames: rows })
})

// 获取系统参数
app.get('/api/admin/params', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM params').all()
  const params = {}
  rows.forEach(r => params[r.key] = r.value)
  res.json({ params })
})

// 更新系统参数
app.post('/api/admin/params', authMiddleware, (req, res) => {
  const { key, value, description } = req.body
  if (!key) return res.status(400).json({ error: '缺少 key' })

  db.prepare('INSERT OR REPLACE INTO params (key, value, description) VALUES (?, ?, ?)')
    .run(key, value, description || '')
  res.json({ success: true })
})

// ===== 管理页面 HTML =====
function getAdminHTML() {
  // 读取外部HTML文件
  try {
    return readFileSync(join(__dirname, 'admin.html'), 'utf-8')
  } catch (err) {
    console.error('加载管理后台HTML失败:', err)
    return '<h1>管理后台加载失败</h1>'
  }
}

/* 旧代码已移至 admin.html */
// ===== 登记页面 HTML =====
function getRegisterHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>AI校园写真 - 信息登记</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans SC',-apple-system,sans-serif;background:linear-gradient(135deg,#0d2a6e 0%,#1a3a7e 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:white;border-radius:20px;padding:36px 28px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
h1{font-size:22px;font-weight:700;color:#0d2a6e;text-align:center;margin-bottom:6px}
p.sub{text-align:center;color:#666;font-size:13px;margin-bottom:28px}
label{display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:6px}
input{width:100%;padding:14px 16px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:15px;outline:none;transition:.2s;margin-bottom:16px}
input:focus{border-color:#1565C0;box-shadow:0 0 0 3px rgba(21,101,192,.1)}
button{width:100%;padding:16px;background:linear-gradient(135deg,#C9A84C,#FFE566);color:#0d2a6e;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;margin-top:8px;transition:.2s}
button:active{transform:scale(.98)}
.msg{text-align:center;padding:12px;border-radius:10px;margin-bottom:16px;font-size:13px;display:none}
.msg.ok{display:block;background:#e8f5e9;color:#2e7d32}
.msg.err{display:block;background:#ffebee;color:#c62828}
.done{text-align:center;padding:40px 20px}
.done h2{font-size:20px;color:#0d2a6e;margin-bottom:8px}
.done p{color:#666;font-size:14px}
</style></head><body>
<div class="card" id="formCard">
<h1>AI校园写真</h1>
<p class="sub">请填写信息完成登记</p>
<div class="msg" id="msg"></div>
<form id="regForm">
<label>姓名 *</label>
<input type="text" id="name" placeholder="请输入姓名" required>
<label>班级 *</label>
<input type="text" id="className" placeholder="请输入班级" required>
<label>手机号（选填）</label>
<input type="tel" id="phone" placeholder="用于接收照片" maxlength="11" pattern="^1[3-9]\\d{9}$" title="请输入11位手机号">
<button type="submit">提交登记</button>
</form>
</div>
<div class="card done" id="doneCard" style="display:none">
<h2>✅ 登记成功！</h2>
<p id="doneMsg">请在 <strong id="cdNum">90</strong> 秒内前往自助机拍照</p>
<p id="expiredMsg" style="display:none;color:#c62828;font-weight:600;font-size:15px;margin-top:8px">登记已过期，请重新扫码登记</p>
</div>
<script>
document.getElementById('regForm').onsubmit=function(e){
e.preventDefault();
var name=document.getElementById('name').value.trim();
var className=document.getElementById('className').value.trim();
var phone=document.getElementById('phone').value.trim();
if(!name||!className){showMsg('请填写姓名和班级','err');return}
if(phone&&!/^1[3-9]\\d{9}$/.test(phone)){showMsg('请输入正确的11位手机号','err');return}
fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,className:className,phone:phone})})
.then(function(r){return r.json()})
.then(function(d){
if(d.success){document.getElementById('formCard').style.display='none';document.getElementById('doneCard').style.display='block';startCountdown()}
else{showMsg(d.error||'提交失败','err')}
})
.catch(function(){showMsg('网络错误','err')})
};
function showMsg(t,c){var m=document.getElementById('msg');m.textContent=t;m.className='msg '+c}
var cdTimer=null;
function startCountdown(){var sec=90;var el=document.getElementById('cdNum');var msg=document.getElementById('doneMsg');var expired=document.getElementById('expiredMsg');cdTimer=setInterval(function(){sec--;if(el)el.textContent=sec;if(sec<=0){clearInterval(cdTimer);cdTimer=null;if(msg)msg.style.display='none';if(expired)expired.style.display='block'}},1000)}
</script></body></html>`
}

// ===== 下载页面 HTML =====
function getDownloadHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>AI校园写真 - 下载</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans SC',-apple-system,sans-serif;background:#f5f5f5;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px}
.card{background:white;border-radius:16px;padding:20px;max-width:400px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}
.preview{width:100%;aspect-ratio:2/3;border-radius:12px;overflow:hidden;margin-bottom:16px}
.preview img{width:100%;height:100%;object-fit:cover;display:block;-webkit-touch-callout:default}
h1{font-size:18px;color:#0d2a6e;margin-bottom:8px}
.btn{width:100%;padding:14px;background:linear-gradient(135deg,#C9A84C,#FFE566);color:#0d2a6e;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}
.btn:active{transform:scale(.98)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.tip{font-size:12px;color:#999;margin-top:8px}
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px}
.spinner{width:40px;height:40px;border:3px solid #eee;border-top-color:#1565C0;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:12px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="card">
<div class="loading" id="loading">
<div class="spinner"></div>
<p style="color:#666;font-size:14px">正在合成图片...</p>
</div>
<div id="content" style="display:none">
<h1>AI校园写真</h1>
<div class="preview">
<img id="result" src="" alt="AI校园写真" draggable="true">
</div>
<button class="btn" id="downloadBtn" onclick="download()">保存到相册</button>
<p class="tip" id="saveTip">长按图片也可保存</p>
</div>
</div>
<script>
var T0=Date.now();
function log(msg){console.log('[DL '+Math.round(Date.now()-T0)+'ms] '+msg)}

var params=new URLSearchParams(window.location.search);
var photoUrl=params.get('url');
var photoId=params.get('p');
var frameId=params.get('frame')||'frame1';
var frameMap={frame1:'xiangkuang1.png',frame2:'xiangkuang2.png',frame3:'xiangkuang3.png',frame4:'xiangkuang4.png',frame5:'xiangkuang5.png'};
var frameSrc='/frames/'+(frameMap[frameId]||'xiangkuang1.png');
var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
log('page loaded, photoId='+photoId+', photoUrl='+(photoUrl?photoUrl.slice(0,60):'null')+', frame='+frameId);

function isCrossOrigin(url){
if(!url)return false;
if(url.startsWith('data:')||url.startsWith('blob:')||url.startsWith('/'))return false;
try{return new URL(url,window.location.origin).origin!==window.location.origin}catch{return false}
}

function loadImg(src,timeout,label){
return new Promise(function(resolve,reject){
var t=Date.now();
log('loadImg['+label+'] start: '+src.slice(0,80));
var timer=setTimeout(function(){log('loadImg['+label+'] TIMEOUT after '+(Date.now()-t)+'ms');reject(new Error('图片加载超时'))},timeout||15000);
var img=new Image();
if(isCrossOrigin(src))img.crossOrigin='anonymous';
img.onload=function(){clearTimeout(timer);log('loadImg['+label+'] ok in '+(Date.now()-t)+'ms, size='+img.naturalWidth+'x'+img.naturalHeight);resolve(img)};
img.onerror=function(){clearTimeout(timer);log('loadImg['+label+'] ERROR after '+(Date.now()-t)+'ms');reject(new Error('图片加载失败'))};
img.src=src;
});
}

function proxyIfNeeded(url){
if(!url||!isCrossOrigin(url)){log('no proxy needed for: '+String(url).slice(0,60));return url}
log('using proxy for: '+url.slice(0,60));
return '/api/proxy-image?url='+encodeURIComponent(url);
}

function composite(photo,frame,cw,ch){
var t=Date.now();
log('composite start, canvas='+cw+'x'+ch);
var c=document.createElement('canvas');
c.width=cw;c.height=ch;
var ctx=c.getContext('2d');
var pw=photo.naturalWidth||photo.width;
var ph=photo.naturalHeight||photo.height;
var fa=cw/ch;
var pa=pw/ph;
var sx=0,sy=0,sw=pw,sh=ph;
if(pa>fa){sw=sh*fa;sx=(pw-sw)/2}else{sh=sw/fa;sy=(ph-sh)/2}
ctx.save();ctx.translate(cw,0);ctx.scale(-1,1);
ctx.drawImage(photo,sx,sy,sw,sh,0,0,cw,ch);
ctx.restore();
ctx.drawImage(frame,0,0,cw,ch);
var dataUrl=c.toDataURL('image/jpeg',0.92);
c.width=0;c.height=0;
log('composite done in '+(Date.now()-t)+'ms, dataUrl length='+dataUrl.length);
return dataUrl;
}

function showError(msg,retryFn){
var html='<p style="color:red;margin-bottom:12px">'+msg+'</p>';
if(retryFn){
window._retryFn=retryFn;
html+='<button onclick="window._retryFn()" style="padding:8px 20px;background:#1565C0;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer">重试</button>';
}
document.getElementById('loading').innerHTML=html;
}

async function init(url){
if(!url){showError('请通过扫描二维码访问此页面');return}
try{
log('init start, url='+url.slice(0,80));
var loadUrl=proxyIfNeeded(url);
log('loading photo+frame in parallel...');
var results=await Promise.all([loadImg(loadUrl,20000,'photo'),loadImg(frameSrc,5000,'frame')]);
var photo=results[0],frame=results[1];
log('both images loaded, photo='+photo.naturalWidth+'x'+photo.naturalHeight+', frame='+frame.naturalWidth+'x'+frame.naturalHeight);
var fw=frame.naturalWidth||1016;
var fh=frame.naturalHeight||1524;
if(fw<500)fw=1016;
if(fh<500)fh=1524;
var dataUrl=composite(photo,frame,fw,fh);
log('setting img src...');
var result=document.getElementById('result');
result.src=dataUrl;
document.getElementById('loading').style.display='none';
document.getElementById('content').style.display='block';
log('DONE, total='+Math.round(Date.now()-T0)+'ms');
if(isIOS){
document.getElementById('downloadBtn').textContent='长按上方图片保存到相册';
document.getElementById('downloadBtn').style.background='#999';
document.getElementById('downloadBtn').disabled=true;
document.getElementById('saveTip').textContent='iOS设备请长按图片保存';
}
}catch(e){
console.error(e);
log('ERROR: '+(e.message||e)+' total='+Math.round(Date.now()-T0)+'ms');
showError(e.message||'图片合成失败',function(){init(url)});
}
}

if(photoId){
if(!/^\\d+$/.test(photoId)){showError('无效的照片ID');}
else{init('/dl/'+photoId)}
}else{init(photoUrl)}

function download(){
if(isIOS)return;
var btn=document.getElementById('downloadBtn');
var result=document.getElementById('result');
if(!result.src||result.src===window.location.href){alert('图片未加载完成');return}
btn.disabled=true;
btn.textContent='正在保存...';
try{
var a=document.createElement('a');
a.href=result.src;
a.download='AI校园写真_'+Date.now()+'.jpg';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
btn.textContent='保存完成';
setTimeout(function(){btn.textContent='保存到相册';btn.disabled=false},2000);
}catch(e){
console.error(e);
btn.textContent='请长按图片保存';
btn.disabled=false;
}
}
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

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('未捕获的路由错误:', err)
  if (!res.headersSent) {
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// SPA 路由回退（生产环境）
if (existsSync(distDir)) {
  app.get('{*path}', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/booth-admin')) return res.status(404).end()
    res.sendFile(join(distDir, 'index.html'))
  })
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

// 防止未处理的 Promise rejection 导致进程崩溃
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise rejection:', reason)
})

process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err)
  // 不退出进程，让 PM2 管理重启
})
