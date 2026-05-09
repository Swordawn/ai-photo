# Hidden Admin Panel + Cloudflare Tunnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将隐藏后台管理系统和 Cloudflare Tunnel 完全整合到 server.js 中，运行 `npm start` 即自动启动自助机+远程隧道+管理后台，用户无感知。

**Architecture:** 所有功能集中在 `server.js` 一个文件中。Express 启动后自动 fork cloudflared 子进程创建公网隧道。管理页面以内联 HTML 字符串返回（不依赖前端构建）。前端 App.tsx 仅移除旧的本地 AdminPanel/Debug 面板，改为纯后端管理。

**Tech Stack:** Express 5, Node.js child_process, cloudflared CLI, 纯 HTML/CSS/JS（管理页面）

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server.js` | **重写** | Express 服务 + cloudflared 隧道 + 管理页面 + API |
| `.env` | 修改 | 添加 ADMIN_PASSWORD |
| `vite.config.ts` | 修改 | 添加 /booth-admin 代理到 Express |
| `src/App.tsx` | 修改 | 移除旧 AdminPanel/Debug 面板 |
| `src/components/AdminPanel.tsx` | 删除 | 功能迁移到后端管理页面 |
| `package.json` | 修改 | 添加 start 脚本确保 cloudflared 可用 |

## Environment Variables

```
ADMIN_PASSWORD=888888
```

---

### Task 1: .env 添加管理员密码

**Files:**
- Modify: `.env`

- [ ] **Step 1: 添加 ADMIN_PASSWORD**

在 `.env` 文件末尾添加一行：

```
ADMIN_PASSWORD=888888
```

---

### Task 2: server.js 重写 — cloudflared 隧道自动启动

**Files:**
- Modify: `server.js:1-6` (imports)

- [ ] **Step 1: 添加 imports**

在 `server.js` 顶部现有 imports 后添加：

```js
import { spawn } from 'child_process'
import { readdir, unlink, stat } from 'fs/promises'
import { config } from 'dotenv'

config() // 加载 .env
```

- [ ] **Step 2: 添加 cloudflared 启动函数**

在 `const app = express()` 之前添加：

```js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '888888'
const startTime = Date.now()
let photoCount = 0 // 今日拍照计数（内存中，重启清零）

// 自动启动 Cloudflare Tunnel
function startTunnel() {
  // 尝试多个常见路径查找 cloudflared
  const candidates = [
    'cloudflared',
    join(__dirname, 'cloudflared'),
    join(__dirname, 'cloudflared.exe'),
    'C:/cloudflared/cloudflared.exe',
  ]

  const cmd = candidates[0] // 默认用 PATH 中的 cloudflared
  const tunnel = spawn(cmd, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  tunnel.stdout.on('data', (data) => {
    const text = data.toString()
    // 提取 trycloudflare.com URL
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (match) {
      console.log(`\n🌐 远程管理后台: ${match[0]}/booth-admin`)
      console.log(`🔑 管理员密码: ${ADMIN_PASSWORD}\n`)
    }
  })

  tunnel.stderr.on('data', (data) => {
    const text = data.toString()
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    if (match) {
      console.log(`\n🌐 远程管理后台: ${match[0]}/booth-admin`)
      console.log(`🔑 管理员密码: ${ADMIN_PASSWORD}\n`)
    }
  })

  tunnel.on('error', (err) => {
    console.warn('⚠️  cloudflared 未安装或启动失败，远程访问不可用')
    console.warn('   安装: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/')
  })

  // 优雅退出
  process.on('SIGTERM', () => { tunnel.kill(); process.exit(0) })
  process.on('SIGINT', () => { tunnel.kill(); process.exit(0) })
}
```

---

### Task 3: server.js — 密码验证中间件

**Files:**
- Modify: `server.js` (添加中间件)

- [ ] **Step 1: 添加 auth 中间件**

在 `startTunnel()` 函数之后添加：

```js
// 管理员认证中间件
function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-password'] || req.query.pwd
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '未授权' })
  }
  next()
}
```

---

### Task 4: server.js — 管理页面路由

**Files:**
- Modify: `server.js` (添加 /booth-admin 路由)

- [ ] **Step 1: 添加管理页面 HTML 常量和路由**

在 `authMiddleware` 之后添加：

```js
// 管理页面（密码保护，内联 HTML）
app.get('/booth-admin', (req, res) => {
  res.send(getAdminHTML())
})
```

- [ ] **Step 2: 添加 getAdminHTML 函数**

在路由之后添加 `getAdminHTML()` 函数，返回完整的管理页面 HTML（内联 CSS + JS），包含：
- 登录界面（密码输入框）
- 三个 Tab：系统配置 / 实时监控 / 内容管理
- 系统配置 Tab：mock 模式开关、超时时间设置、暂停使用开关
- 实时监控 Tab：当前页面、今日拍照数、已完成照片数、运行时间、定时刷新
- 内容管理 Tab：照片网格、下载/删除按钮、批量清空
- 所有 API 调用通过 fetch + `X-Admin-Password` header 认证

HTML 结构（核心骨架）：

```js
function getAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>自助机管理后台</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, sans-serif; background:#f5f5f5; }
  .login { display:flex; align-items:center; justify-content:center; height:100vh; }
  .login-box { background:white; padding:40px; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.1); text-align:center; }
  .login-box h2 { margin-bottom:20px; color:#1a1a1a; }
  .login-box input { padding:10px 16px; border:1px solid #ddd; border-radius:8px; font-size:16px; width:240px; margin-bottom:12px; }
  .login-box button { padding:10px 24px; background:#1565C0; color:white; border:none; border-radius:8px; font-size:14px; cursor:pointer; }
  .app { display:none; }
  .header { background:#1565C0; color:white; padding:16px 24px; display:flex; justify-content:space-between; align-items:center; }
  .tabs { display:flex; border-bottom:1px solid #e5e5e5; background:white; }
  .tab { padding:12px 24px; cursor:pointer; border-bottom:2px solid transparent; color:#666; }
  .tab.active { color:#1565C0; border-bottom-color:#1565C0; }
  .panel { padding:20px; display:none; }
  .panel.active { display:block; }
  .card { background:white; border-radius:8px; padding:16px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .stat { font-size:28px; font-weight:700; color:#1565C0; }
  .stat-label { font-size:12px; color:#999; margin-top:4px; }
  .btn { padding:8px 16px; border-radius:6px; border:none; cursor:pointer; font-size:13px; }
  .btn-primary { background:#1565C0; color:white; }
  .btn-danger { background:#f44336; color:white; }
  .btn-ghost { background:#f5f5f5; border:0.5px solid #e5e5e5; color:#666; }
  .photo-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; }
  .photo-item { position:relative; aspect-ratio:3/4; border-radius:6px; overflow:hidden; }
  .photo-item img { width:100%; height:100%; object-fit:cover; }
  .photo-actions { position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); padding:4px; display:flex; gap:4px; }
  .photo-actions button { flex:1; padding:3px; font-size:10px; border:none; border-radius:3px; cursor:pointer; color:white; }
  .switch { position:relative; width:44px; height:24px; background:#ccc; border-radius:12px; cursor:pointer; transition:0.2s; }
  .switch.on { background:#1565C0; }
  .switch::after { content:''; position:absolute; top:2px; left:2px; width:20px; height:20px; background:white; border-radius:50%; transition:0.2s; }
  .switch.on::after { left:22px; }
  input[type=range] { width:200px; }
</style>
</head>
<body>

<!-- 登录界面 -->
<div class="login" id="loginPage">
  <div class="login-box">
    <h2>自助机管理后台</h2>
    <input type="password" id="pwdInput" placeholder="请输入管理密码" onkeydown="if(event.key==='Enter')doLogin()">
    <br>
    <button onclick="doLogin()">登 录</button>
    <p id="loginError" style="color:#f44336;font-size:12px;margin-top:8px;display:none">密码错误</p>
  </div>
</div>

<!-- 主界面 -->
<div class="app" id="appPage">
  <div class="header">
    <span style="font-weight:600">自助机管理后台</span>
    <span id="remoteUrl" style="font-size:12px;opacity:0.8"></span>
  </div>
  <div class="tabs">
    <div class="tab active" onclick="switchTab(0)">系统配置</div>
    <div class="tab" onclick="switchTab(1)">实时监控</div>
    <div class="tab" onclick="switchTab(2)">内容管理</div>
  </div>
  <div class="panel active" id="panel0">
    <!-- 系统配置 -->
    <div class="card">
      <p style="font-weight:500;margin-bottom:12px">Mock 模式</p>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="switch" id="mockSwitch" onclick="toggleMock()"></div>
        <span style="color:#666;font-size:13px" id="mockLabel">关闭</span>
      </div>
    </div>
    <div class="card">
      <p style="font-weight:500;margin-bottom:12px">空闲超时（秒）</p>
      <input type="range" id="timeoutSlider" min="60" max="600" step="30" value="120" oninput="updateTimeout(this.value)">
      <span id="timeoutValue">120秒</span>
    </div>
    <div class="card">
      <p style="font-weight:500;margin-bottom:12px">自助机状态</p>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="switch on" id="machineSwitch" onclick="toggleMachine()"></div>
        <span style="color:#666;font-size:13px" id="machineLabel">运行中</span>
      </div>
    </div>
  </div>
  <div class="panel" id="panel1">
    <!-- 实时监控 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="card"><div class="stat" id="statPage">-</div><div class="stat-label">当前页面</div></div>
      <div class="card"><div class="stat" id="statToday">0</div><div class="stat-label">今日拍照</div></div>
      <div class="card"><div class="stat" id="statPhotos">0</div><div class="stat-label">已完成照片</div></div>
      <div class="card"><div class="stat" id="statUptime">0m</div><div class="stat-label">运行时间</div></div>
    </div>
  </div>
  <div class="panel" id="panel2">
    <!-- 内容管理 -->
    <div style="margin-bottom:12px">
      <button class="btn btn-danger" onclick="clearAll()">清空所有照片</button>
      <button class="btn btn-ghost" onclick="loadPhotos()" style="margin-left:8px">刷新</button>
    </div>
    <div class="photo-grid" id="photoGrid"></div>
  </div>
</div>

<script>
let pwd = '';
function doLogin() {
  pwd = document.getElementById('pwdInput').value;
  api('/api/admin/status').then(r => {
    if (r.error) { document.getElementById('loginError').style.display='block'; return; }
    document.getElementById('loginPage').style.display='none';
    document.getElementById('appPage').style.display='block';
    loadAll();
    setInterval(loadStatus, 10000);
  });
}
function api(path, method='GET', body) {
  return fetch(path, { method, headers:{'Content-Type':'application/json','X-Admin-Password':pwd}, body:body&&JSON.stringify(body) }).then(r=>r.json());
}
function switchTab(i) {
  document.querySelectorAll('.tab').forEach((t,j)=>t.classList.toggle('active',j===i));
  document.querySelectorAll('.panel').forEach((p,j)=>p.classList.toggle('active',j===i));
  if(i===1) loadStatus();
  if(i===2) loadPhotos();
}
function loadAll() { loadStatus(); loadConfig(); loadPhotos(); }
function loadStatus() {
  api('/api/admin/status').then(r=>{
    document.getElementById('statPage').textContent=r.currentPage||'-';
    document.getElementById('statToday').textContent=r.todayCount||0;
    document.getElementById('statPhotos').textContent=r.photoCount||0;
    document.getElementById('statUptime').textContent=r.uptime||'0m';
  });
}
function loadConfig() {
  api('/api/admin/config').then(r=>{
    document.getElementById('mockSwitch').classList.toggle('on',r.mockMode);
    document.getElementById('mockLabel').textContent=r.mockMode?'开启':'关闭';
    document.getElementById('timeoutSlider').value=r.idleTimeout||120;
    document.getElementById('timeoutValue').textContent=(r.idleTimeout||120)+'秒';
    document.getElementById('machineSwitch').classList.toggle('on',!r.paused);
    document.getElementById('machineLabel').textContent=r.paused?'已暂停':'运行中';
  });
}
function toggleMock() {
  const on = !document.getElementById('mockSwitch').classList.contains('on');
  api('/api/admin/config','POST',{mockMode:on}).then(()=>loadConfig());
}
function updateTimeout(v) {
  document.getElementById('timeoutValue').textContent=v+'秒';
  api('/api/admin/config','POST',{idleTimeout:parseInt(v)});
}
function toggleMachine() {
  const paused = document.getElementById('machineSwitch').classList.contains('on');
  api('/api/admin/config','POST',{paused:paused}).then(()=>loadConfig());
}
function loadPhotos() {
  api('/api/admin/photos').then(r=>{
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = (r.photos||[]).map(p=>'
      <div class="photo-item"><img src="/uploads/'+p+'" loading="lazy">
        <div class="photo-actions">
          <button style="background:#1565C0" onclick="downloadPhoto(\\''+p+'\\')">下载</button>
          <button style="background:#f44336" onclick="deletePhoto(\\''+p+'\\')">删除</button>
        </div>
      </div>').join('');
  });
}
function downloadPhoto(name) { window.open('/uploads/'+name); }
function deletePhoto(name) {
  if(!confirm('确定删除 '+name+' ?')) return;
  api('/api/admin/photos/'+name,'DELETE').then(()=>loadPhotos());
}
function clearAll() {
  if(!confirm('确定清空所有照片？此操作不可恢复！')) return;
  api('/api/admin/photos','DELETE').then(()=>loadPhotos());
}
</script>
</body></html>`;
}
```

---

### Task 5: server.js — 管理 API 端点

**Files:**
- Modify: `server.js` (添加 /api/admin/* 路由)

- [ ] **Step 1: 添加状态和配置 API**

在管理页面路由之后添加：

```js
// ===== 管理 API =====

// 系统状态
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
    const uptimeStr = uptimeH > 0 ? `${uptimeH}h${uptimeMin % 60}m` : `${uptimeMin}m`

    res.json({
      currentPage: req.app.get('currentPage') || 'home',
      todayCount: req.app.get('todayCount') || 0,
      photoCount,
      uptime: uptimeStr,
    })
  } catch (err) {
    res.status(500).json({ error: '获取状态失败' })
  }
})

// 配置读写
app.get('/api/admin/config', authMiddleware, (req, res) => {
  res.json({
    mockMode: req.app.get('mockMode') || false,
    idleTimeout: req.app.get('idleTimeout') || 120,
    paused: req.app.get('paused') || false,
  })
})

app.post('/api/admin/config', authMiddleware, (req, res) => {
  const { mockMode, idleTimeout, paused } = req.body
  if (mockMode !== undefined) req.app.set('mockMode', mockMode)
  if (idleTimeout !== undefined) req.app.set('idleTimeout', idleTimeout)
  if (paused !== undefined) req.app.set('paused', paused)
  res.json({ success: true })
})
```

- [ ] **Step 2: 添加照片管理 API**

```js
// 照片列表
app.get('/api/admin/photos', authMiddleware, async (req, res) => {
  try {
    const finishedDir = join(uploadsDir, '已完成照片')
    if (!existsSync(finishedDir)) {
      return res.json({ photos: [] })
    }
    const files = await readdir(finishedDir)
    const photos = files
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .sort((a, b) => b.localeCompare(a))
    res.json({ photos })
  } catch (err) {
    res.status(500).json({ error: '获取照片列表失败' })
  }
})

// 删除单张照片
app.delete('/api/admin/photos/:filename', authMiddleware, async (req, res) => {
  try {
    const filepath = join(uploadsDir, '已完成照片', req.params.filename)
    if (existsSync(filepath)) {
      await unlink(filepath)
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '删除失败' })
  }
})

// 清空所有照片
app.delete('/api/admin/photos', authMiddleware, async (req, res) => {
  try {
    const finishedDir = join(uploadsDir, '已完成照片')
    if (existsSync(finishedDir)) {
      const files = await readdir(finishedDir)
      for (const f of files) {
        if (/\.(jpg|jpeg|png)$/i.test(f)) {
          await unlink(join(finishedDir, f))
        }
      }
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: '清空失败' })
  }
})
```

- [ ] **Step 3: 添加暂停使用 API 端点（供前端检查）**

```js
// 前端检查是否暂停
app.get('/api/machine-status', (req, res) => {
  res.json({
    paused: req.app.get('paused') || false,
    mockMode: req.app.get('mockMode') || false,
    idleTimeout: req.app.get('idleTimeout') || 120,
  })
})

// 前端上报当前页面
app.post('/api/report-page', (req, res) => {
  const { page } = req.body
  if (page) req.app.set('currentPage', page)
  res.json({ ok: true })
})
```

---

### Task 6: server.js — 启动时调用 startTunnel + 修正 listen 回调

**Files:**
- Modify: `server.js:106-116`

- [ ] **Step 1: 修改 listen 回调添加 startTunnel 调用**

将现有的 `app.listen` 回调改为：

```js
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
    ____                       _
   / ___|_      _____  _ __ __| |
   \\___ \\ \\ /\\ / / _ \\| '__/ _\` |
    ___) \\ V  V / (_) | | | (_| |
   |____/ \\_/\\_/ \\___/|_|  \\__,_|
                                  `)
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`)
  console.log(`📸 图片访问地址: http://localhost:${PORT}/uploads/`)
  console.log(`🔧 本地管理后台: http://localhost:${PORT}/booth-admin`)
  console.log(`🔑 管理员密码: ${ADMIN_PASSWORD}`)
  console.log('')

  // 启动 Cloudflare Tunnel
  startTunnel()
})
```

---

### Task 7: vite.config.ts — 添加 /booth-admin 代理

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 在 proxy 中添加 /booth-admin 路由**

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/booth-admin': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/dashscope': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashscope/, ''),
      },
    },
  },
})
```

---

### Task 8: App.tsx — 移除旧 AdminPanel 和 Debug 面板

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 删除 AdminPanel import 和相关状态**

删除：
- `import AdminPanel from './components/AdminPanel'`
- `adminVisible` state
- `handleAdminTouchStart` / `handleAdminTouchEnd`
- 管理员触发区域 div
- `<AdminPanel ... />` 组件渲染
- Debug 面板按钮和面板（`debugOpen`, `debugJump`, 整个 debug 区块）

---

### Task 9: 删除 AdminPanel.tsx 组件

**Files:**
- Delete: `src/components/AdminPanel.tsx`

- [ ] **Step 1: 删除文件**

```bash
rm src/components/AdminPanel.tsx
```

---

### Task 10: 验证和测试

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd D:/ClaudeWorkspace/ai-photo-booth && npx tsc -b --noEmit
```
Expected: 无错误输出

- [ ] **Step 2: Vite 构建检查**

```bash
cd D:/ClaudeWorkspace/ai-photo-booth && npx vite build
```
Expected: 成功构建

- [ ] **Step 3: 启动测试**

```bash
cd D:/ClaudeWorkspace/ai-photo-booth && npm start
```
Expected:
- Express 服务器启动在 3001
- 打印本地管理后台地址
- 如果 cloudflared 已安装，打印远程 URL
- 访问 http://localhost:3001/booth-admin 显示登录页
- 输入密码后显示管理面板

---

## Spec Self-Review

1. **Spec coverage:** 所有5个需求（cloudflared、管理页面、密码验证、管理API、.env）都有对应Task
2. **No placeholders:** HTML 代码完整，无 TBD/TODO
3. **Type consistency:** API 路径统一使用 `/api/admin/*`，认证统一使用 `X-Admin-Password` header
4. **Scope check:** 聚焦在 server.js 重写 + 前端清理，无额外复杂性
5. **Ambiguity check:** 管理页面 HTML 已完整写出，含完整 CSS/JS，无歧义
