# CodeView

个人 GitHub 项目资产看板，基于 `React + Vite + TypeScript + ECharts` 和 `Node.js + TypeScript + SQLite` 实现。

## 本地启动

```bash
npm install
copy .env.example .env
npm run dev
```

前端默认地址：`http://localhost:3100`

后端默认地址：`http://localhost:3101`

## 已实现能力

- GitHub 账号配置与 CSRF 校验
- 仓库、提交、语言、文件快照、流量同步
- 活跃度聚合、热力图、技术栈识别、项目评分
- Dashboard、项目列表、项目详情页
- SQLite 持久化、自动洞察、定时同步

## 环境变量

- `SERVER_PORT`：后端端口，默认 `3101`
- `WEB_ORIGIN`：前端开发源，默认 `http://localhost:3100`
- `DATABASE_PATH`：SQLite 文件路径
- `DEFAULT_USER_ID`：默认本地用户 ID
- `ENCRYPTION_SECRET`：用于加密 GitHub Token
