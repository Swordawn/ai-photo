import express from 'express'
import cors from 'cors'
import { writeFile, mkdir, readdir, unlink, readFile } from 'fs/promises'
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

// OTA 自动更新
const OTA_URL = 'https://raw.githubusercontent.com/Swordawn/ai-photo/main/ota.json'
const OTA_INTERVAL = 30 * 60 * 1000 // 30分钟检查一次
const PKG_PATH = join(__dirname, 'package.json')
let localVersion = '1.0.0'
let updateStatus = 'idle' // idle | checking | updating | done | error
let updateMessage = ''

try {
  const pkg = JSON.parse(await readFile(PKG_PATH, 'utf-8'))
  localVersion = pkg.version || '1.0.0'
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
  if (req.path.startsWith('/api/admin') || req.path.startsWith('/api/machine-status')) {
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
.stats-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:16px 20px}
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
loadAll();if(_statusInterval)clearInterval(_statusInterval);_statusInterval=setInterval(loadStatus,10000)
}).catch(e=>{
document.getElementById('loginError').textContent='网络错误，请检查连接';
document.getElementById('loginError').style.display='block'
})}
function doLogout(){pwd='';document.getElementById('appPage').classList.remove('show');document.getElementById('loginPage').style.display='flex';document.getElementById('pwdInput').value=''}
function loadAll(){loadStatus();loadConfig();loadPhotos();loadVersion()}
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
const photos=r.photos||[];
const grid=document.getElementById('photoGrid');
const empty=document.getElementById('emptyState');
if(photos.length===0){grid.innerHTML='';empty.style.display='block';return}
empty.style.display='none';
grid.innerHTML=photos.map(p=>'<div class="photo-item" onclick="dl(\\''+esc(p)+'\\')"><img src="/uploads/'+encodeURIComponent(p)+'" loading="lazy"><span class="photo-name">'+esc(p.split('/').pop())+'</span><div class="photo-overlay"><div class="photo-btns"><button class="dl" onclick="event.stopPropagation();dl(\\''+esc(p)+'\\')">下载</button><button class="rm" onclick="event.stopPropagation();rm(\\''+esc(p)+'\\')">删除</button></div></div></div>').join('')})}
function esc(s){return s.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'")}
function dl(n){window.open('/uploads/'+encodeURIComponent(n))}
function rm(n){showModal('确认删除','确定删除此照片？',[{text:'取消',cls:'cancel'},{text:'删除',cls:'confirm'}]).then(i=>{if(i===1)api('/api/admin/photos/'+encodeURIComponent(n),'DELETE').then(()=>{loadPhotos();toast('已删除')})})}
function confirmClearAll(){showModal('确认清空','确定清空所有照片？此操作不可恢复！',[{text:'取消',cls:'cancel'},{text:'清空全部',cls:'confirm'}]).then(i=>{if(i===1)api('/api/admin/photos','DELETE').then(()=>{loadPhotos();toast('已清空')})})}
function loadVersion(){api('/api/admin/ota-status').then(r=>{document.getElementById('versionTag').textContent='v'+r.localVersion})}
function checkUpdate(){toast('正在检查...');api('/api/admin/check-update').then(r=>{if(r.hasUpdate){showModal('发现新版本','当前: v'+r.localVersion+' → 最新: v'+r.remoteVersion,[{text:'稍后',cls:'cancel'},{text:'立即更新',cls:'confirm primary'}]).then(i=>{if(i===1){api('/api/admin/do-update','POST').then(()=>{toast('更新中，请等待重启...')})}})}else{toast('已是最新版本 v'+r.localVersion)}}).catch(()=>{toast('检查失败')})}
</script></body></html>`
}

// ===== Cloudflare Tunnel（命名隧道，固定域名）=====
const CLOUDFLARED_BIN = join(__dirname, 'cloudflared.exe')
const TUNNEL_TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN || ''

// ===== OTA 自动更新（不依赖 git，纯 server.js 内完成）=====
const OTA_ZIP_URL = 'https://github.com/Swordawn/ai-photo/archive/refs/heads/main.zip'
const SKIP_COPY = ['node_modules', '.env', 'uploads', 'cloudflared.exe', '.git', '.tunnel-url']

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

  const tmpZip = join(__dirname, '__update__.zip')
  const tmpDir = join(__dirname, '__update_tmp__')

  try {
    // 1. 下载 zip
    updateMessage = '下载更新包...'
    const resp = await fetch(OTA_ZIP_URL, { signal: AbortSignal.timeout(120000) })
    if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    await writeFile(tmpZip, buf)

    // 2. 解压
    updateMessage = '解压文件...'
    if (existsSync(tmpDir)) execSync(`rd /s /q "${tmpDir}"`, { stdio: 'ignore' })
    execSync(`tar -xf "${tmpZip}" -C "${tmpDir}" --strip-components=1`, { cwd: __dirname, timeout: 60000 })

    // 3. 覆盖文件（跳过敏感/运行时目录）
    updateMessage = '覆盖文件...'
    const items = await readdir(tmpDir)
    for (const item of items) {
      if (SKIP_COPY.includes(item)) continue
      const src = join(tmpDir, item)
      const dst = join(__dirname, item)
      try {
        execSync(`rd /s /q "${dst}"`, { stdio: 'ignore' })
      } catch {}
      try {
        execSync(`xcopy "${src}" "${dst}" /E /I /Y /Q`, { stdio: 'ignore' })
      } catch {}
    }

    // 4. 安装依赖
    updateMessage = '安装依赖...'
    execSync('npm install', { cwd: __dirname, timeout: 120000 })

    // 5. 读取新版本号
    try {
      const pkg = JSON.parse(await readFile(PKG_PATH, 'utf-8'))
      localVersion = pkg.version || localVersion
    } catch {}

    // 6. 清理临时文件
    try { execSync(`rd /s /q "${tmpDir}"`, { stdio: 'ignore' }) } catch {}
    try { execSync(`del /q "${tmpZip}"`, { stdio: 'ignore' }) } catch {}

    updateStatus = 'done'
    updateMessage = `更新完成 v${localVersion}，正在重启...`

    // 7. 自动重启（spawn 新进程，当前进程退出）
    setTimeout(() => {
      const isWin = process.platform === 'win32'
      const cmd = isWin ? 'npm.cmd' : 'npm'
      const child = spawn(cmd, ['start'], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
        ...(isWin ? { windowsHide: true } : {}),
      })
      child.unref()
      process.exit(0)
    }, 2000)
  } catch (err) {
    updateStatus = 'error'
    updateMessage = `更新失败: ${err.message}`
    try { execSync(`rd /s /q "${tmpDir}"`, { stdio: 'ignore' }) } catch {}
    try { execSync(`del /q "${tmpZip}"`, { stdio: 'ignore' }) } catch {}
  }
}

// 管理 API：检查更新
app.get('/api/admin/check-update', authMiddleware, async (req, res) => {
  const remote = await checkForUpdate()
  res.json({ localVersion, remoteVersion: remote?.version || null, hasUpdate: !!remote, status: updateStatus, message: updateMessage })
})

// 管理 API：执行更新
app.post('/api/admin/do-update', authMiddleware, (req, res) => {
  performUpdate()
  res.json({ success: true, message: '更新已启动' })
})

// 管理 API：OTA 状态
app.get('/api/admin/ota-status', authMiddleware, (req, res) => {
  res.json({ localVersion, status: updateStatus, message: updateMessage })
})

// 定时自动检查更新
setInterval(async () => {
  const remote = await checkForUpdate()
  if (remote) {
    console.log(`发现新版本 ${remote.version}，自动更新...`)
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
