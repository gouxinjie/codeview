# CodeView

CodeView 是一个面向个人开发者的 GitHub 项目数据看板，用来展示项目活跃度、提交趋势、技术栈画像和基础经营数据。

## 项目特性

- 个人 GitHub 项目概览与多维度运营看板
- 近 30 天活跃项目排行与项目详情卡片
- 提交热力图、提交趋势、项目活跃趋势分析
- 语言分布、技术栈标签、技术栈趋势投影
- Node.js + SQLite 持久化存储与定时同步能力
- React + Vite + TypeScript 前端，ECharts 可视化渲染

## 技术栈

- 前端：`React`、`Vite`、`TypeScript`、`SCSS`、`ECharts`
- 后端：`Node.js`、`Express`、`TypeScript`
- 数据库：`SQLite`
- 状态管理：`Zustand`

## 本地启动

```bash
npm install
copy .env.example .env
npm run dev
```

默认地址：

- 前端：`http://localhost:3100`
- 后端：`http://localhost:3101`

## 常用脚本

```bash
npm run dev
npm run dev:web
npm run dev:server
npm run build
npm run typecheck
```

## 环境变量

- `SERVER_PORT`：后端服务端口，默认 `3101`
- `WEB_ORIGIN`：前端开发地址，默认 `http://localhost:3100`
- `DATABASE_PATH`：SQLite 数据库文件路径
- `DEFAULT_USER_ID`：默认本地用户 ID
- `ENCRYPTION_SECRET`：用于加密 GitHub Token

## 目录结构

```text
apps/
  server/    Node.js + TypeScript 服务端
  web/       React + Vite 前端
design-ui/   设计稿与参考资源
```

## 当前能力

- GitHub 账号配置与基础鉴权
- 仓库、提交、语言、流量等数据同步
- Dashboard 首页、项目列表、项目详情页
- 活跃项目排行、技术栈画像、数据统计展示

## 开源协议

本项目采用 `MIT License` 开源，详见 [LICENSE](./LICENSE)。
