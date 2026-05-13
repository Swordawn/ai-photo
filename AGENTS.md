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

### 拍照
- **react-webcam** 组件，`videoConstraints: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }`
- **直接从 video 元素截取**：`video.videoWidth × video.videoHeight`，绕过 react-webcam 的 canvas 压缩
- **JPEG 质量 0.95**，原始分辨率输出
- 支持多摄像头切换（自动选择外接摄像头）

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
- **`/dl/:id` 端点**：
  - 本地文件直接 serve（毫秒级）
  - 远程 COS URL → fetch → **先返回响应** → 后台异步保存本地+更新DB
  - **并发去重**：同一 photoId 多个请求只 fetch 一次 COS
  - **内存缓存**：1小时 TTL，后续请求直接返回
  - **磁盘缓存非阻塞**：writeFile 失败不影响响应，只打日志
- **相框走 COS CDN**：`/api/proxy-image?url=COS帧URL`，不走本地服务器
- **自动重试**：加载失败自动重试 3 次（间隔 2s/4s/6s），解决 CF 隧道冷启动问题
- **Canvas 预合成**：页面加载时合成镜像+相框，预览=保存=同一张图
- **iOS 检测**：iOS 设备提示"长按图片保存"

### 打印（PrintPage）
- **相框预加载**：页面加载时通过 proxy 预加载 COS 相框为 blob URL，点击打印直接用
- **toBlob 异步编码**：不阻塞主线程
- **@page 4in×6in 纵向**：精确匹配 6 寸照片，无空白第二页
- **打印弹窗样式**：html/body 打印时精确 4×6 英寸 + overflow:hidden

### 镜像处理（方案B：预览镜像+保存不镜像）
- **预览（CSS镜像）**：摄像头/合成页/结果页 → CSS `scaleX(-1)` → 脸自然
- **保存（不镜像）**：下载/打印/QR码 → Canvas直接绘制 → 文字正确

---

## 部署架构

```
用户浏览器
  ├── 页面 → swordawn.cloud（CF 隧道 → 服务器 3001）
  ├── 相框 → COS CDN（显示+合成都走COS）
  ├── 背景图 → COS CDN
  ├── 校园Logo → COS CDN
  ├── 照片 → /dl/:id（本地缓存/远程COS fetch）
  └── API → swordawn.cloud/api/*（CF 隧道 → 服务器）
```

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M, 4Mbps)
**隧道：** Cloudflare Named Tunnel `swordawn.cloud`
**进程管理：** PM2（ubuntu 用户，开机自启，`pm2 reload` 平滑重载）
**COS：** 腾讯云对象存储（南京区域，图片资源CDN）

### 资源全部走 COS（除域名隧道）

| 资源 | 来源 |
|------|------|
| 相框图片 | COS CDN（显示+Canvas合成都走COS，通过proxy解决CORS） |
| 背景轮播图 | COS CDN |
| 校园Logo | COS CDN |
| 照片存储 | COS + 本地缓存 |

---

## 相框系统

**5款相框**，全部走 COS CDN：

| 用途 | 路径 | 说明 |
|------|------|------|
| CSS显示 | `COS_BASE/frames/xiangkuang*.png` | COS CDN |
| Canvas合成 | 通过 `/api/proxy-image` 加载 COS URL → blob URL | 同源无CORS |

- `xiangkuang1.png` ~ `xiangkuang5.png`
- 默认选中：frame1
- COS：`https://ai-photo-booth-1313122021.cos.ap-nanjing.myqcloud.com/frames/`
- PrintPage 预加载相框到内存（blob URL），点击打印/下载直接用

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
| GET | `/dl/:id` | serve照片（本地缓存/远程fetch+内存缓存+并发去重） |
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
  filename TEXT NOT NULL,  -- 本地路径 /uploads/已完成照片/xxx.jpg 或 COS URL
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

### 前端
- **PrintPage useMemo**：`frameSrc`/`effectiveFrame`/`frameProxySrc` 全部 memoize，避免 countdown 每秒触发重渲染
- **PrintPage 相框预加载**：页面加载时通过 proxy 预加载 COS 相框为 blob URL
- **PrintPage toBlob**：异步编码，不阻塞主线程
- **PrintPage @page 4×6**：精确匹配 6 寸照片，无空白第二页
- **Google Fonts 非阻塞**：`media="print" onload="this.media='all'"` 异步加载
- **去掉未用字体**：Inter、JetBrains Mono 从未使用，已删除
- **首页图片优先级**：首张背景图 `fetchpriority="high"` + `decoding="async"`
- **Canvas 预合成**：下载页加载时一次性合成，预览=保存
- **ComposePage 卸载 abort**：离开页面自动取消 AI 请求

### 后端
- **dl/:id 先响应后缓存**：`res.send(buffer)` 在 `writeFile` 之前，磁盘写入失败不影响客户端
- **dl/:id 并发去重**：同一 photoId 多个请求只 fetch 一次 COS
- **dl/:id 磁盘缓存非阻塞**：后台异步写入，失败只打日志
- **dl/:id 内存缓存**：1小时 TTL，后续请求直接返回
- **相框全部走 COS**：不走本地服务器 4Mbps 带宽
- **校园Logo 走 COS**：不走 CF 隧道
- **AI+COS 并行**：不互相依赖，同时执行

---

## 部署流程

```bash
# 本地
npm run build
tar czf dist.tar.gz dist/
git add -A && git commit -m "xxx" && git push origin main

# 自动部署（paramiko SSH）
python -c "
import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('81.70.134.240', username='ubuntu', password='Sm710317')
for cmd in [
    'cd /opt/ai-photo && sudo git pull origin main',
    'cd /opt/ai-photo && sudo rm -rf dist && sudo tar xzf dist.tar.gz',
    'cd /opt/ai-photo && sudo chown -R root:root dist',
    'pm2 reload ai-photo --update-env',
]:
    ssh.exec_command(cmd)
ssh.close()
"
```

### 服务器权限注意事项
- PM2 以 `ubuntu` 用户运行
- `uploads/` 和 `data.db` 必须属于 `ubuntu:ubuntu`
- 部署时 `dist/` 用 `root:root`，其他目录不动
- 如遇权限问题：`sudo chown -R ubuntu:ubuntu /opt/ai-photo/uploads /opt/ai-photo/data.db`

---

## 已知问题

1. **旧照片 COS URL** — 部分旧照片 DB 记录指向 COS URL，`/dl/:id` 首次访问需 fetch（已优化为先响应后缓存）
2. **服务器带宽 4Mbps** — 所有静态资源走 COS CDN，不走本地服务器
3. **Google Fonts 国内慢** — 已改为异步加载，不阻塞渲染

---

## 待开发功能

1. 打印机驱动集成（惠普Tank599）
2. 照片自动清理机制（定期清理旧照片）

---

## 已安装 Skills

- `ui-ux-pro-max` — UI/UX 设计指南
- `frontend-patterns` — React 前端模式
