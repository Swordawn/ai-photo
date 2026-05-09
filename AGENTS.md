# AI 智能写真自助机 — 项目文档

## 项目概述

面向河南应用技术职业学院的 AI 校园写真自助机。用户通过自助机拍照，选择相框和艺术风格，AI 生成写真，扫码下载。

**技术栈：** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Express 5 + Cloudflare Tunnel

**启动：** `npm start`（同时启动 Express 后端 + Vite 前端 + Cloudflare 隧道）

## 页面流程

```
首页 → 拍照（3秒倒计时） → 合成（选风格/相框） → 结果（下载/打印/扫码）
```

| 页面 | 组件 | 说明 |
|------|------|------|
| 首页 | `HomePage.tsx` | 深蓝主题，校园轮播背景，金色标题，三个按钮 |
| 拍照 | `CameraPage.tsx` | 420×630 容器（2:3），摄像头预览+相框叠加，3秒倒计时，左侧相框选择 |
| 合成 | `ComposePage.tsx` | 照片+相框预览，6种AI风格选择，相框更换 |
| 结果 | `PrintPage.tsx` | 大图展示，下载/打印/二维码扫码，15秒倒计时返回 |

## 关键尺寸

- 照片比例：**2:3**（对应 10.2cm × 15.2cm）
- 容器：`height: calc(100vh - 100px)`, `aspectRatio: 2/3`, `borderRadius: 16`
- 相框 PNG：1200×1800（2:3）
- Canvas 合成输出：1200×1800 JPEG 95%

## 相框系统

4 款相框定义在 `src/data/frames.ts`：
- `xiangkuang1.png` — 经典相框（2MB）
- `xiangkuang2.png` — 花边相框（947KB）
- `xiangkuang3` — 简约相框（SVG 内联）
- `xiangkuang4` — 复古相框（SVG 内联）

**预览原理：** CSS 叠加（非合成），相框 PNG `object-fit:fill` 覆盖在照片上方
**合成原理：** Canvas 先画照片（cover），再画相框（叠加），输出 base64

## AI 合成流程

1. `generateAIImage(capturedPhoto, styleId, mock)` → 调用 DashScope `wanx-style-repaint-v1`
2. DashScope 返回图片 URL（OSS）
3. `compositeFrame(aiResult, frameSrc)` → 通过 `/api/proxy-image` 代理获取图片，Canvas 合成+镜像
4. `autoSaveImage(finalImage)` → POST 到 `/api/upload`，保存到 `uploads/已完成照片/`
5. 返回合成后的 base64 + 服务器 URL（用于二维码）

## 镜像处理

- 摄像头预览：CSS `transform: scaleX(-1)`（镜像）
- 拍照/合成页照片显示：CSS `scaleX(-1)`（与预览一致）
- Canvas 合成：`ctx.scale(-1, 1)` 翻转照片数据
- 结果页：不加 CSS 镜像（数据已是镜像的）
- 下载的图片 = 镜像版（与用户看到的一致）

## 后端 (server.js)

### API 端点（13个）

| 路径 | 用途 |
|------|------|
| `POST /api/upload` | 上传照片（base64 → 文件） |
| `GET /api/proxy-image?url=` | 代理远程图片（解决 CORS） |
| `GET /api/machine-status` | 前端读取机器状态 |
| `POST /api/report-page` | 前端上报当前页面 |
| `GET /api/health` | 健康检查 |
| `GET /booth-admin` | 管理后台（内联 HTML） |
| `GET /api/admin/status` | 管理员：系统状态 |
| `GET/POST /api/admin/config` | 管理员：配置读写 |
| `GET /api/admin/photos` | 管理员：照片列表 |
| `DELETE /api/admin/photos/:name` | 管理员：删除照片 |
| `DELETE /api/admin/photos` | 管理员：清空所有 |

### 中间件

- `apiGateMiddleware`：`apiLocked` 时拦截上传/代理/上报
- `authMiddleware`：管理 API 需 `X-Admin-Password` header

### Cloudflare 隧道

- 二进制：项目根目录 `cloudflared.exe`（63MB）
- 启动：`cloudflared tunnel run --token <TOKEN>`（静默，不输出到终端）
- 固定域名：`booth.swordawn.cloud`
- Token 在 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN` 中

## 管理后台

访问 `https://booth.swordawn.cloud/booth-admin`，密码 `888888`

三个 Tab：
1. **系统配置**：Mock 模式、空闲超时、自助机暂停、API 保护锁
2. **实时监控**：当前页面、今日拍照、已完成照片数、运行时间、隧道 URL
3. **内容管理**：照片网格、单张下载/删除、批量清空

## 环境变量 (.env)

```
VITE_DASHSCOPE_KEY=sk-xxx          # DashScope API Key
ADMIN_PASSWORD=888888              # 管理后台密码
CLOUDFLARE_TUNNEL_TOKEN=eyJ...     # CF 命名隧道 Token
PUBLIC_HOST=booth.swordawn.cloud   # 公网域名（二维码用）
```

## 目录结构

```
ai-photo-booth/
├── src/
│   ├── components/        # 页面组件
│   │   ├── HomePage.tsx
│   │   ├── CameraPage.tsx
│   │   ├── ComposePage.tsx
│   │   ├── PrintPage.tsx
│   │   ├── AppHeader.tsx
│   │   └── FloatingCatkins.tsx
│   ├── data/
│   │   ├── frames.ts      # 4款相框定义
│   │   └── styles.ts      # 6种AI风格
│   ├── state/
│   │   └── useAppState.ts # 全局状态 + sessionStorage
│   ├── utils/
│   │   ├── compositeFrame.ts  # Canvas 合成
│   │   ├── autoSave.ts        # 上传保存
│   │   └── imageUpload.ts     # 第三方图床上传（备用）
│   ├── api/
│   │   └── generate.ts    # DashScope API 调用
│   └── App.tsx            # 路由 + 合成逻辑
├── server.js              # Express 后端（全部后端逻辑）
├── cloudflared.exe        # CF 隧道二进制
├── .env                   # 环境变量
├── vite.config.ts         # Vite + 代理配置
├── uploads/               # 上传照片目录
│   └── 已完成照片/        # 合成完成的照片
├── public/                # 静态资源
└── docs/superpowers/plans/  # 实现计划文档
```

## 已安装 Skills

- `ui-ux-pro-max` — UI/UX 设计指南（67种风格、96调色板）
- `frontend-patterns` — React 前端模式最佳实践
- `superpowers` — Agent Team 开发流程（brainstorming、writing-plans、executing-plans 等）

## 待清理的死代码

以下组件文件已不再使用（历史遗留）：
`AttractScreen.tsx`, `CameraCapture.tsx`, `CollegeBranding.tsx`, `ConfirmPage.tsx`, `Logo.tsx`, `ParticleBackground.tsx`, `ProcessingPage.tsx`, `QRCodePage.tsx`, `RegisterPage.tsx`, `ResultPage.tsx`, `StepIndicator.tsx`, `StyleSelect.tsx`
