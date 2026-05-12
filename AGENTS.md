# AI 智能写真自助机 — 项目文档

## 项目概述

面向河南应用技术职业学院的 AI 校园写真自助机。用户扫码登记，自助机拍照，选择相框和艺术风格，AI 生成写真，扫码下载或打印。

**技术栈：** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Express 5 + SQLite + PM2 + Cloudflare Tunnel + 腾讯云 COS

**启动：** `npm start`（Express 后端 + Vite 前端）

**部署地址：** `https://swordawn.cloud`（CF 隧道 HTTPS）

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M, 4Mbps)

**COS 存储：** `ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com`（南京区域）

---

## 页面流程

```
首页（QR码/欢迎） → 拍照（选相框+摄像头选择+3秒倒计时） → 合成（选风格/相框） → 结果（下载/打印/扫码）
```

| 页面 | 组件 | 说明 |
|------|------|------|
| 首页 | `HomePage.tsx` | 深蓝主题，校园轮播（COS），动态QR码，扫码登记后显示欢迎 |
| 拍照 | `CameraPage.tsx` | 摄像头预览+相框叠加，支持外接摄像头选择，3秒倒计时 |
| 合成 | `ComposePage.tsx` | 照片+相框预览，7种风格选择（原版+6种AI），相框更换 |
| 结果 | `PrintPage.tsx` | 大图展示，下载/打印6寸照片/二维码扫码，90秒倒计时自动reset回首页 |

---

## 核心流程

### 扫码登记
1. 首页显示动态 QR 码（指向 `https://swordawn.cloud/register`）
2. 手机扫码 → 填写姓名/班级/手机号（11位校验 `1[3-9]\d{9}`）→ 提交到 SQLite
3. 自助机轮询（5秒）检测到登记 → 显示"欢迎 XXX"
4. 用户点"开始拍照" → 标记登记已使用 → 进入拍照页
5. 90秒超时自动清除（不标记已使用，允许重新扫码）
6. 跳过按钮不标记已使用，允许重新扫码

### AI 合成
1. 拍照 → base64 JPEG（原始数据，不镜像）
2. 选择风格 + 相框
3. **并行执行**：AI生成 + COS直传原版照片
4. AI生成：发送到 DashScope `wan2.7-image`（异步任务模式，轮询间隔 500ms→1s→2s→3s，提交超时60s）
5. 保存照片到服务器（带重试机制，最多3次，失败存入localStorage下次重试，最多5次后放弃）
6. 立即显示结果页，后台异步保存照片
7. ComposePage 卸载时自动 abort 进行中的AI请求

### 照片保存（可靠机制）
- **持久化队列**：保存任务存入 localStorage（上限15条），页面加载时自动重试
- **重试机制**：失败最多重试3次，间隔递增（2s→4s→6s）
- **放弃机制**：单条任务最多重试5次后永久丢弃，防止队列无限增长
- **QuotaExceeded保护**：localStorage写入失败时自动清理旧数据
- **数据库优先本地路径**：DB 存 `/uploads/已完成照片/xxx.jpg`，不存远程URL
- **COS 直传**：原版照片前端直传 COS，不经过服务器
- **服务端保存**：AI照片由服务端下载后上传 COS + 本地备份
- **保存位置**：`/opt/ai-photo/uploads/已完成照片/` + 腾讯云 COS
- **时间戳**：所有 `created_at` 使用 `datetime('now', '+8 hours')` 北京时间

### 扫码下载（/download 页面）
- QR码指向 `/download?p=照片ID&frame=相框ID`
- **`/dl/:id` 端点**：优先读本地文件（毫秒级），远程URL自动fetch+保存本地+更新DB
- **内存缓存**：远程fetch的照片缓存到内存Map（1小时TTL），后续请求直接返回
- **Canvas预合成**：页面加载时合成镜像+相框，预览=保存=同一张图
- **iOS检测**：iOS设备提示"长按图片保存"（Safari不支持`<a download>`）
- **超时+重试**：图片加载20s超时，失败显示重试按钮

### 镜像处理（方案B：预览镜像+保存不镜像）
- **预览（CSS镜像）**：摄像头/合成页/结果页 → CSS `scaleX(-1)` → 脸自然
- **保存（不镜像）**：下载/打印/QR码 → Canvas直接绘制 → 文字正确
- 自助机下载：Canvas合成不镜像
- 自助机打印：Canvas合成不镜像
- 扫码下载（/download）：Canvas合成不镜像

---

## 部署架构

```
用户浏览器
  ├── 页面 → swordawn.cloud（CF 隧道 → 服务器 3001）
  ├── 相框显示 → COS CDN（快）
  ├── 相框合成 → /frames/*（服务器本地，同源无CORS）
  ├── 照片 → /dl/:id（服务器本地文件，毫秒级）
  └── API → swordawn.cloud/api/*（CF 隧道 → 服务器）
```

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M, 4Mbps)
**隧道：** Cloudflare Named Tunnel `swordawn.cloud`
**进程管理：** PM2（开机自启，`pm2 reload` 平滑重载）
**COS：** 腾讯云对象存储（南京区域，图片资源CDN）

---

## 相框系统

**5款相框**，双路径加载：

| 用途 | 路径 | 说明 |
|------|------|------|
| CSS显示 | COS CDN `frames.ts` FRAME_COS | 快，走CDN |
| Canvas合成 | `/frames/xiangkuang*.png` 本地 | 同源无CORS，秒加载 |

- `xiangkuang1.png` ~ `xiangkuang5.png`
- 默认选中：frame1
- 服务器本地：`/opt/ai-photo/public/frames/`（构建后复制到 `dist/frames/`）
- COS：`cos.ap-nanjing.myqcloud.com/frames/`

---

## 管理后台

**地址：** `https://swordawn.cloud/booth-admin`
**密码：** `710317`（.env 中 ADMIN_PASSWORD）
**安全：** 10次密码错误封禁IP 5分钟

### 功能模块
1. **仪表盘** — 统计概览、7天趋势图、风格分布
2. **服务器管理** — CPU/内存/磁盘监控、PM2日志、重启
3. **数据管理** — 登记记录（搜索/分页/导出CSV）、照片记录（关联登记）
4. **内容配置** — AI风格管理、相框管理
5. **设备管理** — 在线设备、远程关机
6. **系统设置** — Mock模式、暂停、API锁定、空闲超时

---

## AI风格

| ID | 名称 | 提示词 |
|----|------|--------|
| original | 原版 | 不经过AI处理 |
| guofeng | 古风 | 水墨质感，古典优雅 |
| guochao | 国潮 | 鲜艳色彩，现代中国风 |
| jiaopian | 胶片风 | 暖色调，颗粒质感 |
| qingxin | 小清新 | 明亮柔和色调 |
| youhua | 油画 | 厚重笔触质感 |
| sumiao | 素描 | 黑白线条，细腻明暗 |

---

## 环境变量 (.env)

```
VITE_DASHSCOPE_KEY=sk-xxx          # DashScope API Key
ADMIN_PASSWORD=710317              # 管理后台密码
CLOUDFLARE_TUNNEL_TOKEN=eyJ...     # CF 命名隧道 Token
PUBLIC_HOST=swordawn.cloud         # 公网域名
VITE_PUBLIC_HOST=swordawn.cloud    # 前端用公网域名
COS_SECRET_ID=AKID...             # 腾讯云 COS SecretId
COS_SECRET_KEY=DHCy...            # 腾讯云 COS SecretKey
COS_BUCKET=ai-photo-booth-xxx     # COS 存储桶名称
COS_REGION=ap-nanjing              # COS 区域
```

---

## API 端点

### 用户端
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 手机扫码登记（含11位手机号校验） |
| GET | `/api/registration/latest` | 自助机轮询最新登记 |
| POST | `/api/registration/:id/use` | 标记登记已使用 |
| POST | `/api/upload` | 上传照片（base64） |
| POST | `/api/save-photos` | 保存原版+AI版照片（DB存本地路径） |
| POST | `/api/save-photo-record` | 记录照片到数据库（COS直传后） |
| POST | `/api/cos-sign` | 生成COS预签名URL（前端直传） |
| GET | `/api/proxy-image?url=` | 代理远程图片（白名单） |
| GET | `/dl/:id` | serve照片（本地/远程fetch+缓存+更新DB） |
| POST | `/api/report-page` | 前端上报当前页面 |
| GET | `/api/machine-status` | 前端读取机器状态 |

### 设备管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/device/heartbeat` | 设备心跳（30秒） |
| POST | `/api/device/local-shutdown` | 本地关机 |

### 管理员（需 X-Admin-Password header，10次错误封禁5分钟）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/status` | 系统状态 |
| GET/POST | `/api/admin/config` | 配置读写 |
| GET | `/api/admin/server-info` | 服务器信息 |
| GET | `/api/admin/logs` | PM2日志 |
| POST | `/api/admin/restart` | 重启服务 |
| GET/POST | `/api/admin/env` | 环境变量读写 |
| GET | `/api/admin/photos` | 照片列表 |
| GET | `/api/admin/photos-with-info` | 照片列表（关联登记） |
| DELETE | `/api/admin/photos/:name` | 删除照片 |
| GET | `/api/admin/registrations` | 登记列表（分页/搜索） |
| GET | `/api/admin/stats` | 统计数据 |
| GET | `/api/admin/export/csv` | 导出CSV |
| GET/POST | `/api/admin/styles` | 风格管理 |
| GET | `/api/admin/frames` | 相框列表 |
| GET/POST | `/api/admin/params` | 系统参数 |
| GET | `/api/admin/devices` | 设备列表 |
| POST | `/api/admin/devices/:id/shutdown` | 关闭设备 |
| POST | `/api/admin/devices/shutdown-all` | 全部关机 |
| PUT | `/api/admin/devices/:id/name` | 重命名设备 |

### 页面
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/register` | 手机登记页面（11位手机号校验） |
| GET | `/download` | 下载页面（Canvas预合成，iOS长按提示） |
| GET | `/dl/:id` | 照片直接serve（同源） |
| GET | `/booth-admin` | 管理后台 |
| ALL | `/dashscope/*` | DashScope API 代理（90秒超时） |
| GET | `/api/health` | 健康检查 |

---

## 数据库

### registrations 表
```sql
CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 存储北京时间
  used INTEGER DEFAULT 0
)
```

### photos 表
```sql
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,  -- 本地路径 /uploads/已完成照片/xxx.jpg
  style TEXT,
  frame TEXT,
  reg_id INTEGER,
  type TEXT DEFAULT 'ai',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 存储北京时间
)
```

### styles 表
```sql
CREATE TABLE styles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
)
```

---

## 安全措施

- CORS 限制为 `PUBLIC_HOST` 域名
- `/api/proxy-image` 白名单（DashScope OSS + COS）
- 管理API暴力破解防护（10次失败封禁5分钟）
- 注册接口速率限制（5次/分）+ 11位手机号校验
- 上传接口魔数检查 + 10MB限制
- 路径穿越检查、CSV导出防注入
- localStorage队列上限（15条）+ 重试上限（5次）
- React Error Boundary 防白屏

---

## 性能优化

- **相框双路径**：显示走COS CDN，Canvas合成走本地`/frames/`
- **照片本地serve**：`/dl/:id` 直接读本地文件（毫秒级）
- **内存缓存**：远程照片fetch后缓存到Map（1小时TTL）
- **自动缓存**：远程URL首次fetch后保存本地+更新DB
- **AI+COS并行**：不互相依赖，同时执行
- **Canvas预合成**：下载页加载时一次性合成，预览=保存
- **ComposePage卸载abort**：离开页面自动取消AI请求
- **PrintPage自动reset**：90秒倒计时结束后清理全部状态

---

## 部署流程

```bash
# 本地
npm run build
tar czf dist.tar.gz dist/
git add -A && git commit -m "xxx" && git push origin main

# 服务器 (81.70.134.240, ubuntu/Sm710317)
cd /opt/ai-photo && sudo git pull origin main
sudo rm -rf /opt/ai-photo/dist
cd /opt/ai-photo && sudo tar xzf /tmp/dist.tar.gz
sudo chown -R root:root /opt/ai-photo/dist
sudo pm2 reload ai-photo
```

---

## 已知问题

1. **旧照片迁移不完整** — 部分旧照片DB记录可能指向错误文件，`/dl/:id`有自动修复
2. **服务器带宽4Mbps** — 相框显示走COS CDN，仅Canvas合成走本地

---

## 待开发功能

1. 打印机驱动集成（惠普Tank599）
2. 照片自动清理机制（定期清理旧照片）

---

## 已安装 Skills

- `ui-ux-pro-max` — UI/UX 设计指南
- `frontend-patterns` — React 前端模式
- `superpowers` — Agent Team 开发流程
