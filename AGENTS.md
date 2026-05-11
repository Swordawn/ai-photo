# AI 智能写真自助机 — 项目文档

## 项目概述

面向河南应用技术职业学院的 AI 校园写真自助机。用户扫码登记，自助机拍照，选择相框和艺术风格，AI 生成写真，扫码下载或打印。

**技术栈：** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Express 5 + SQLite + PM2 + Cloudflare Tunnel + 腾讯云 COS

**启动：** `npm start`（Express 后端 + Vite 前端）

**部署地址：** `https://swordawn.cloud`（CF 隧道 HTTPS）

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M)

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
2. 手机扫码 → 填写姓名/班级/手机号（11位校验）→ 提交到 SQLite
3. 自助机轮询（5秒）检测到登记 → 显示"欢迎 XXX"
4. 用户点"开始拍照" → 标记登记已使用 → 进入拍照页
5. 90秒超时自动清除（不标记已使用，允许重新扫码）
6. 跳过按钮不标记已使用，允许重新扫码

### AI 合成
1. 拍照 → base64 JPEG（已镜像）
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

### 扫码下载（/download 页面）
- QR码指向 `/download?p=照片ID&frame=相框ID`
- **`/dl/:id` 端点**：优先读本地文件（毫秒级），远程URL自动fetch+缓存到本地+更新DB
- **内存缓存**：照片首次fetch后缓存到内存Map（1小时TTL），后续请求直接返回
- **Canvas预合成**：页面加载时合成镜像+相框，预览=保存=同一张图
- **iOS检测**：iOS设备提示"长按图片保存"（Safari不支持`<a download>`）
- **超时+重试**：图片加载20s超时，失败显示重试按钮

### 镜像处理
- 摄像头预览：CSS `scaleX(-1)`
- 拍照数据：原始数据（不镜像）
- 拍照后预览：CSS `scaleX(-1)`（与预览一致）
- 合成页面：CSS `scaleX(-1)`
- 结果页面：CSS `scaleX(-1)`
- 下载/打印：Canvas 合成时镜像处理

---

## 部署架构

```
用户浏览器
  ├── 页面 → swordawn.cloud（CF 隧道 → 服务器 3001）
  ├── 相框 → /frames/*（服务器本地 + COS CDN）
  ├── 照片 → /dl/:id（服务器本地文件，毫秒级）
  └── API → swordawn.cloud/api/*（CF 隧道 → 服务器）
```

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M)
**隧道：** Cloudflare Named Tunnel `swordawn.cloud`
**进程管理：** PM2（开机自启，`pm2 reload` 平滑重载）
**COS：** 腾讯云对象存储（南京区域，所有图片资源）

---

## 管理后台

**地址：** `https://swordawn.cloud/booth-admin`
**密码：** `710317`（.env 中 ADMIN_PASSWORD）
**安全：** 10次密码错误封禁IP 5分钟

### 功能模块

#### 1. 仪表盘
- 统计概览：今日拍照、总照片、总登记、在线设备
- 最近7天拍照趋势图（柱状图）
- 风格分布图

#### 2. 服务器管理
- 系统监控：CPU/内存/磁盘使用率
- 实时日志：PM2日志查看
- 快捷操作：重启服务
- 服务器信息：CPU型号、内存、系统、Node版本

#### 3. 数据管理
- 登记记录：搜索、分页、导出CSV（防注入转义）
- 照片记录：关联登记信息（姓名、班级、手机号、风格）
- 照片类型标签：原版（黄色）/ AI版（蓝色）

#### 4. 内容配置
- AI风格管理：增删改风格名称和提示词
- 相框管理：查看相框列表

#### 5. 设备管理
- 在线设备列表
- 远程关机（单个/全部）

#### 6. 系统设置
- Mock模式开关
- 自助机暂停开关
- API锁定开关
- 空闲超时设置
- 环境变量查看

---

## 相框系统

**5款相框**（服务器本地 `/frames/` + COS CDN）：
- `xiangkuang1.png` - 相框一
- `xiangkuang2.png` - 相框二
- `xiangkuang3.png` - 相框三
- `xiangkuang4.png` - 相框四
- `xiangkuang5.png` - 相框五

**默认选中**：frame1

**存储位置**：
- 源文件：`src/assets/1-5.png`
- 公共目录：`public/frames/xiangkuang*.png`
- 服务器：`/opt/ai-photo/public/frames/`
- COS：`cos.ap-nanjing.myqcloud.com/frames/`

---

## AI风格

| ID | 名称 | 提示词 |
|----|------|--------|
| original | 原版 | 不经过AI处理 |
| guofeng | 古风 | 转换为古风中国画风格，水墨质感，古典优雅 |
| guochao | 国潮 | 转换为国潮艺术风格，鲜艳色彩，现代中国风 |
| jiaopian | 胶片风 | 转换为复古胶片摄影风格，暖色调，颗粒质感 |
| qingxin | 小清新 | 转换为小清新风格，明亮柔和色调，自然光线 |
| youhua | 油画 | 转换为油画风格，厚重笔触质感，丰富色彩层次 |
| sumiao | 素描 | 转换为铅笔素描风格，黑白线条，细腻明暗关系 |

---

## 打印功能

**支持6寸照片打印**（4×6英寸 / 10×15cm）

**打印流程：**
1. 点击「打印6寸照片」按钮
2. 弹出打印窗口，显示照片预览（Canvas合成：镜像+边框）
3. 提示用户选择纸张大小
4. 用户点击「打印照片」按钮
5. 在打印对话框中设置纸张后打印

**打印设置：**
- 纸张大小：4×6英寸 或 10×15cm
- 纸张类型：照片纸
- 打印质量：最佳
- 方向：横向

---

## 摄像头支持

**支持外接摄像头**（高像素USB摄像头）

**功能：**
- 自动检测所有摄像头设备
- 优先选择外接摄像头（非Integrated/内置）
- 右侧面板显示摄像头选择下拉框
- 分辨率：1920×1080

**切换逻辑：**
- 获取设备列表需要先请求摄像头权限
- 选择设备后重新加载摄像头
- 设备名称显示在下拉框中

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
| POST | `/api/save-photos` | 保存原版+AI版照片（带重试，DB存本地路径） |
| POST | `/api/save-photo-record` | 记录照片到数据库（COS直传后） |
| POST | `/api/cos-sign` | 生成COS预签名URL（前端直传） |
| GET | `/api/proxy-image?url=` | 代理远程图片（DashScope+COS白名单） |
| GET | `/dl/:id` | 直接serve照片（本地文件/远程fetch+缓存+更新DB） |
| POST | `/api/report-page` | 前端上报当前页面 |
| GET | `/api/machine-status` | 前端读取机器状态 |

### 设备管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/device/heartbeat` | 设备心跳（30秒） |
| POST | `/api/device/local-shutdown` | 本地关机 |

### 短链接
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/p/:id` | 短链接重定向到COS URL |
| GET | `/api/p/:id` | 获取照片URL（JSON格式） |

### 管理员（需 X-Admin-Password header，10次错误封禁5分钟）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/status` | 系统状态 |
| GET/POST | `/api/admin/config` | 配置读写 |
| GET | `/api/admin/server-info` | 服务器信息（CPU/内存/磁盘） |
| GET | `/api/admin/logs` | PM2日志 |
| POST | `/api/admin/restart` | 重启服务 |
| GET/POST | `/api/admin/env` | 环境变量读写 |
| GET | `/api/admin/photos` | 照片列表 |
| GET | `/api/admin/photos-with-info` | 照片列表（关联登记） |
| DELETE | `/api/admin/photos/:name` | 删除照片 |
| DELETE | `/api/admin/photos` | 清空所有 |
| GET | `/api/admin/registrations` | 登记列表（分页/搜索） |
| GET | `/api/admin/stats` | 统计数据 |
| GET | `/api/admin/export/csv` | 导出CSV（防注入） |
| GET | `/api/admin/styles` | 风格列表 |
| POST | `/api/admin/styles` | 添加/修改风格 |
| DELETE | `/api/admin/styles/:id` | 删除风格 |
| GET | `/api/admin/frames` | 相框列表 |
| GET | `/api/admin/params` | 系统参数 |
| POST | `/api/admin/params` | 更新参数 |
| GET | `/api/admin/devices` | 设备列表 |
| POST | `/api/admin/devices/:id/shutdown` | 关闭设备 |
| POST | `/api/admin/devices/shutdown-all` | 全部关机 |
| PUT | `/api/admin/devices/:id/name` | 重命名设备 |

### 页面
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/register` | 手机登记页面（HTML，含11位手机号校验） |
| GET | `/download` | 下载页面（Canvas预合成镜像+相框，iOS长按提示） |
| GET | `/booth-admin` | 管理后台（HTML） |
| ALL | `/dashscope/*` | DashScope API 代理（90秒超时） |
| GET | `/api/health` | 健康检查 |

---

## 数据库

### registrations 表（登记记录）
```sql
CREATE TABLE registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used INTEGER DEFAULT 0
)
```

### photos 表（照片记录）
```sql
CREATE TABLE photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,  -- 本地路径 /uploads/已完成照片/xxx.jpg
  style TEXT,
  frame TEXT,
  reg_id INTEGER,
  type TEXT DEFAULT 'ai',  -- 'original' 或 'ai'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### styles 表（AI风格）
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

## 目录结构

```
ai-photo-booth/
├── src/
│   ├── components/
│   │   ├── HomePage.tsx        # 首页（QR码+轮播+欢迎）
│   │   ├── CameraPage.tsx      # 拍照页（摄像头+相框+倒计时）
│   │   ├── ComposePage.tsx     # 合成页（风格+相框选择，卸载时abort）
│   │   ├── PrintPage.tsx       # 结果页（下载+打印+QR码，90s自动reset）
│   │   ├── AppHeader.tsx       # 通用头部
│   │   └── FloatingCatkins.tsx # 装饰动画
│   ├── data/
│   │   ├── frames.ts           # 5款相框（COS URL）
│   │   └── styles.ts           # 6种AI风格
│   ├── api/
│   │   ├── generate.ts         # DashScope wan2.7-image API（60s提交超时）
│   │   └── apiBase.ts          # API 请求封装
│   ├── state/
│   │   └── useAppState.ts      # 全局状态
│   ├── utils/
│   │   └── compositeFrame.ts   # Canvas 合成（备用）
│   └── App.tsx                 # 路由 + 登记轮询 + 合成逻辑 + 照片保存队列
├── server.js                   # Express 后端（全部后端逻辑）
├── admin.html                  # 管理后台HTML
├── public/
│   └── frames/                 # 相框图片（5款）
├── uploads/                    # 上传照片目录
│   └── 已完成照片/              # 合成完成的照片（本地备份）
├── .env                        # 环境变量
├── vite.config.ts              # Vite + 代理配置
└── package.json                # 依赖配置
```

---

## 安全措施

- CORS 限制为 `PUBLIC_HOST` 域名
- `/api/proxy-image` 限制为 DashScope OSS + COS 域名白名单
- `/api/device/local-shutdown` 仅允许本地 IP 或管理员密码
- 管理员照片删除有路径穿越检查
- 注册接口有速率限制（5次/分）和输入长度限制
- 手机号11位格式校验（`1[3-9]\d{9}`，前后端双重）
- 上传接口有图片格式验证（魔数检查）和大小限制（10MB）
- JSON body 限制 10MB
- 默认密码启动警告
- SSRF 白名单验证（save-photos 端点）
- CSV 导出防注入转义
- execSync 输入范围限制（1-1000）
- 全局错误处理中间件
- unhandledRejection / uncaughtException 处理
- React Error Boundary 防白屏
- 管理API暴力破解防护（10次失败封禁5分钟）
- localStorage保存队列上限（15条）+ 单条重试上限（5次）

---

## 性能优化

- **轮询间隔**：指数退避 500ms→1s→2s→3s（快任务秒出）
- **AI生成+COS直传并行**：不互相依赖，同时执行
- **照片保存并行**：Promise.all 并行下载+写入
- **DB事务**：两个 INSERT 包在事务中
- **DashScope代理超时**：90秒
- **AI提交超时**：60秒
- **图片资源走COS CDN**：背景图、相框走COS
- **照片走本地serve**：`/dl/:id` 直接读本地文件（毫秒级）
- **内存缓存**：远程fetch的照片缓存到内存Map（1小时TTL）
- **自动缓存**：远程URL首次fetch后保存本地+更新DB，后续秒加载
- **下载页面Canvas预合成**：镜像+相框一次合成，预览=保存
- **localStorage持久化队列**：刷新不丢，自动重试，有上限保护
- **ComposePage卸载abort**：离开页面自动取消AI请求
- **PrintPage自动reset**：90秒倒计时结束后清理全部状态

---

## 部署流程

### 标准部署
```bash
# 本地
npm run build
tar czf dist.tar.gz dist/
git add -A && git commit -m "xxx" && git push origin main

# 服务器 (81.70.134.240, ubuntu/Sm710317)
cd /opt/ai-photo && sudo git pull origin main
# 上传 dist.tar.gz 到 /tmp/
sudo rm -rf /opt/ai-photo/dist
cd /opt/ai-photo && sudo tar xzf /tmp/dist.tar.gz
sudo chown -R root:root /opt/ai-photo/dist
sudo pm2 reload ai-photo  # 用 reload 不用 restart
```

### PM2 管理
```bash
sudo pm2 list              # 查看进程
sudo pm2 reload ai-photo   # 平滑重载（不中断服务）
sudo pm2 logs ai-photo     # 查看日志
sudo pm2 save              # 保存进程列表
sudo pm2 startup           # 开机自启
```

---

## 已知问题

1. **DashScope图片URL有时效性** - 已通过DB存本地路径+`/dl/:id`自动缓存解决
2. **微信扫码需要复制链接** - 已添加下载页面 `/download`
3. **相框图片较大** - 已改为COS CDN加载
4. **iOS Safari不支持下载** - 已检测iOS提示长按保存
5. **旧照片迁移不完整** - 部分旧照片DB记录指向错误的本地文件，`/dl/:id`有自动修复机制

---

## 待开发功能

1. 打印机驱动集成（惠普Tank599）
2. 多语言支持
3. 数据统计报表
4. 照片自动清理机制（定期清理旧照片）

---

## 已安装 Skills

- `ui-ux-pro-max` — UI/UX 设计指南
- `frontend-patterns` — React 前端模式
- `superpowers` — Agent Team 开发流程
