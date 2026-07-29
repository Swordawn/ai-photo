# AI 校园写真自助机

中文 | [English summary](#english-summary)

面向校园现场演示的 AI 写真流程原型：将摄像头采集、风格/相框选择、异步生成、Canvas 合成、结果保存与下载入口组织为可观察的前后端流程。

> 当前状态：**可演示，持续完善**。项目保留浏览器打印入口和 4x6 打印样式，但当前代码与记录不足以证明打印机驱动、队列或完整投递链路已经验证；公开材料不作该承诺。

## 项目背景

现场交互不只是一次图像接口调用。摄像头权限、网络波动、异步任务、相框合成、下载与失败状态都可能中断体验。本项目将这些节点拆成可见状态，并为外部 AI 不可用时保留 Mock/降级路径，便于演示与排查。

## 流程与架构

```text
摄像头采集 -> 风格/相框选择 -> Express API -> AI 任务或 Mock
                                          -> Canvas 合成 -> 保存/下载/浏览器打印入口
```

- **前端**：React 19、TypeScript、Vite、Tailwind CSS、Framer Motion、`react-webcam`、`qrcode.react`。
- **服务端**：Express 5、`dotenv`、CORS；负责图片/任务相关 HTTP 接口和受控的本地输出。
- **图像流程**：摄像头采集、倒计时、风格和相框选择、任务轮询或 Mock、Canvas 2:3 合成、结果下载入口。
- **管理能力**：代码含设备/照片/配置及导出相关端点。它们用于受控现场运维，不是公开作品集入口。

## 功能模块

1. 摄像头权限和拍摄引导。
2. 风格与相框选择、预览与固定比例合成。
3. 异步生成状态、超时/失败提示与 Mock 降级。
4. 结果保存、二维码下载入口和浏览器打印入口。
5. 受控的后台状态、设备与导出接口。

## 工程难点与处理

- **外部服务波动**：把任务开始、等待、成功、失败和重试拆开呈现；Mock 用于受控演示，不将其混同为真实生成成功。
- **Canvas 可导出性**：远程素材必须经过受控路径，避免跨域污染导致预览正常但最终图片无法导出。
- **方向一致性**：单独处理摄像头预览镜像与最终输出方向，避免“所见”与保存图不一致。
- **现场排障**：按浏览器权限、服务端响应、外部任务、文件输出和终端显示逐段定位，不以单个页面可打开作为流程成功依据。

## 个人职责

AI 辅助生成后，负责前后端流程联调、图像合成与跨域/下载性能问题排查、现场部署整合。项目为协作与迭代成果，不表述为完全独立交付。

## 运行条件与本地验证

需要受支持的 Node.js 与 npm。仅在隔离环境使用测试图像与本地/受控配置：

```powershell
npm ci
npm run build
npm run lint
```

开发预览可使用 `npm run dev`，服务端入口为 `npm run server`。`npm run start` 会并行启动两者，适合受控的本地演示；生产部署方式不在本 README 中提供。

验证应覆盖：摄像头拒绝权限、生成成功、超时/失败、Mock 降级、Canvas 导出和下载入口。不能用构建通过或单个 200 响应代替整条流程验证。

## 安全、隐私与演示边界

- 不提交 `.env`、外部 AI 凭据、`uploads/`、SQLite 数据库、后台地址、设备配置或导出文件。
- 浏览器构建变量会进入客户端产物；外部 AI 凭据只能在本地/受控环境使用，公开或生产流程应迁移到服务端代理后再验证。
- 演示只使用假名、测试图和 Mock 结果；不得展示真人照片、学生信息、二维码目标、学校标志、后台入口或真实生成结果。
- 二维码下载是结果入口，不等同于对任何外部存储可用性或访问控制的承诺。

## 截图计划

下一轮在 localhost、Mock 和脱敏测试数据下制作：1366x768 或 1920x1080 的首页、空摄像头授权、风格/相框选择、生成中/失败状态和结果下载入口。二维码必须遮蔽或仅指向 localhost；不使用 `uploads/` 内文件或旧概念图作为当前功能证据。

## English summary

An AI photo-booth prototype for controlled campus demonstrations. React and Express coordinate camera capture, style/frame selection, asynchronous generation or Mock fallback, Canvas composition, and result download/print entry. The repository does not claim a verified printer-driver or queue integration. Public demos must use sanitized test media only and must not expose credentials, student data, uploads, admin routes, QR destinations, or production configuration.
