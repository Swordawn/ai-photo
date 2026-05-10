# AI 智能写真自助机 — 项目文档

## 项目概述

面向河南应用技术职业学院的 AI 校园写真自助机。用户扫码登记，自助机拍照，选择相框和艺术风格，AI 生成写真，扫码下载。

**技术栈：** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Express 5 + SQLite + Cloudflare Tunnel

**启动：** `npm start`（Express 后端 + Vite 前端 + cloudflared 隧道）

**部署地址：** `https://swordawn.cloud`（CF 隧道 HTTPS）

---

## 页面流程

```
首页（QR码/欢迎） → 拍照（选相框+3秒倒计时） → 合成（选风格/相框） → 结果（下载/打印/扫码）
```

| 页面 | 组件 | 说明 |
|------|------|------|
| 首页 | `HomePage.tsx` | 深蓝主题，校园轮播（CDN），动态QR码，扫码登记后显示欢迎 |
| 拍照 | `CameraPage.tsx` | 420×560 容器，摄像头预览+相框叠加，3秒倒计时，左侧相框选择 |
| 合成 | `ComposePage.tsx` | 照片+相框预览，6种AI风格选择，相框更换 |
| 结果 | `PrintPage.tsx` | 大图展示，下载/打印/二维码扫码，15秒倒计时返回 |

---

## 核心流程

### 扫码登记
1. 首页显示动态 QR 码（指向 `当前域名/register`）
2. 手机扫码 → 填写姓名/班级 → 提交到 SQLite
3. 自助机轮询（5秒）检测到登记 → 显示"欢迎 XXX"
4. 用户点"开始拍照" → 进入拍照页
5. 90秒超时自动清除 / 用户点"跳过"清除

### AI 合成
1. 拍照 → base64 JPEG
2. 选择风格 + 相框
3. 发送到 DashScope `wan2.7-image`（messages 格式）
4. AI 结果 + 相框 → Canvas 合成（镜像处理）
5. 自动保存到 `uploads/已完成照片/`

### 镜像处理
- 摄像头预览：CSS `scaleX(-1)`
- 拍照/合成页：CSS `scaleX(-1)`
- Canvas 合成：`ctx.scale(-1, 1)` 数据层镜像
- 结果页：不加 CSS 镜像

---

## 部署架构

```
用户浏览器
  ├── 页面 → swordawn.cloud（CF 隧道 → 服务器 3001）
  ├── 背景图/相框 → ai-photo-cdn.pages.dev（CF CDN）
  └── API → swordawn.cloud/api/*（CF 隧道 → 服务器）
```

**服务器：** 81.70.134.240 (Ubuntu, 2核2G4M)
**CDN：** Cloudflare Pages `ai-photo-cdn.pages.dev`
**隧道：** Cloudflare Named Tunnel `swordawn.cloud`

---

## 管理后台

**地址：** `https://swordawn.cloud/booth-admin`
**密码：** `710317`（.env 中 ADMIN_PASSWORD）

功能：
- 系统配置：Mock 模式、空闲超时、自助机暂停、API 保护锁
- 实时监控：当前页面、今日拍照、已完成照片数、运行时间、隧道 URL
- 内容管理：照片网格、单张下载/删除、批量清空
- 设备管理：在线设备列表、远程关机
- OTA 更新：检查更新、一键部署

---

## 环境变量 (.env)

```
VITE_DASHSCOPE_KEY=sk-xxx          # DashScope API Key（VITE_ 前缀嵌入前端）
ADMIN_PASSWORD=710317              # 管理后台密码
CLOUDFLARE_TUNNEL_TOKEN=eyJ...     # CF 命名隧道 Token
PUBLIC_HOST=swordawn.cloud         # 公网域名（二维码 URL 用）
```

---

## API 端点

### 用户端
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | 手机扫码登记 |
| GET | `/api/registration/latest` | 自助机轮询最新登记 |
| POST | `/api/registration/:id/use` | 标记登记已使用 |
| POST | `/api/upload` | 上传照片（base64） |
| GET | `/api/proxy-image?url=` | 代理远程图片（限 DashScope OSS） |
| POST | `/api/report-page` | 前端上报当前页面 |
| GET | `/api/machine-status` | 前端读取机器状态 |

### 设备管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/device/heartbeat` | 设备心跳（30秒） |
| POST | `/api/device/local-shutdown` | 本地关机（需本地IP或管理员密码） |

### 管理员（需 X-Admin-Password header）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/status` | 系统状态 |
| GET/POST | `/api/admin/config` | 配置读写 |
| GET | `/api/admin/photos` | 照片列表 |
| DELETE | `/api/admin/photos/:name` | 删除照片 |
| DELETE | `/api/admin/photos` | 清空所有 |
| GET | `/api/admin/devices` | 设备列表 |
| POST | `/api/admin/devices/:id/shutdown` | 关闭设备 |
| GET | `/api/admin/check-update` | 检查 OTA 更新 |
| POST | `/api/admin/do-update` | 执行 OTA 更新 |

### 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/register` | 手机登记页面（HTML） |
| GET | `/booth-admin` | 管理后台（HTML） |
| ALL | `/dashscope/*` | DashScope API 代理 |
| GET | `/api/health` | 健康检查 |

---

## 目录结构

```
ai-photo-booth/
├── src/
│   ├── components/
│   │   ├── HomePage.tsx        # 首页（QR码+轮播+欢迎）
│   │   ├── CameraPage.tsx      # 拍照页（摄像头+相框+倒计时）
│   │   ├── ComposePage.tsx     # 合成页（风格+相框选择）
│   │   ├── PrintPage.tsx       # 结果页（下载+打印+QR码）
│   │   ├── AppHeader.tsx       # 通用头部
│   │   └── FloatingCatkins.tsx # 装饰动画
│   ├── data/
│   │   ├── frames.ts           # 4款相框（CDN URL）
│   │   └── styles.ts           # 6种AI风格
│   ├── api/
│   │   ├── generate.ts         # DashScope wan2.7-image API
│   │   └── apiBase.ts          # API 请求封装
│   ├── state/
│   │   └── useAppState.ts      # 全局状态 + sessionStorage
│   ├── utils/
│   │   ├── compositeFrame.ts   # Canvas 合成 + 镜像
│   │   ├── autoSave.ts         # 自动保存
│   │   └── imageUpload.ts      # 第三方图床（备用）
│   └── App.tsx                 # 路由 + 登记轮询 + 合成逻辑
├── server.js                   # Express 后端（全部后端逻辑）
├── cloudflared.exe             # CF 隧道二进制（63MB）
├── start.bat                   # Windows 启动脚本（自动重启）
├── start.sh                    # Linux 启动脚本
├── .env                        # 环境变量
├── vite.config.ts              # Vite + 代理配置
├── uploads/                    # 上传照片目录
│   └── 已完成照片/              # 合成完成的照片
├── ota.json                    # OTA 版本文件
└── docs/superpowers/plans/     # 实现计划文档
```

---

## 安全措施

- CORS 限制为 `PUBLIC_HOST` 域名
- `/api/proxy-image` 限制为 DashScope OSS 域名白名单
- `/api/device/local-shutdown` 仅允许本地 IP 或管理员密码
- 管理员照片删除有路径穿越检查
- 注册接口有速率限制（5次/分）和输入长度限制
- 上传接口有图片格式验证（魔数检查）和大小限制（10MB）
- JSON body 限制 10MB
- 默认密码启动警告

---

## OTA 更新

**机制：** 每 30 分钟检查 Gitee 仓库，SHA 对比，增量下载变更文件

**发版流程：**
1. 修改代码
2. 更新 `ota.json` 和 `package.json` 的 version
3. `git push` 到 Gitee
4. 部署机器 30 分钟内自动更新 + 重启

**手动触发：** 管理后台点"检查更新"

---

## 已安装 Skills

- `ui-ux-pro-max` — UI/UX 设计指南
- `frontend-patterns` — React 前端模式
- `superpowers` — Agent Team 开发流程

---

## 待清理

以下组件文件为历史遗留，未被使用：
`AttractScreen.tsx`, `CameraCapture.tsx`, `CollegeBranding.tsx`, `ConfirmPage.tsx`, `Logo.tsx`, `ParticleBackground.tsx`, `ProcessingPage.tsx`, `QRCodePage.tsx`, `RegisterPage.tsx`, `ResultPage.tsx`, `StepIndicator.tsx`, `StyleSelect.tsx`
