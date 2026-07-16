# Docker Compose 部署到 ECS 说明

## 文档说明

本文档用于说明 CodeView 如何通过 GitHub Actions 部署到阿里云 ECS，并使用 Docker Compose 启动服务。

## 本次已落地的文件

- `compose.yaml`
- `apps/server/Dockerfile`
- `apps/web/Dockerfile`
- `deploy/nginx/default.conf`
- `deploy/.env.example`
- `.github/workflows/deploy-ecs-compose.yml`

## 部署结构

当前部署形态为两个容器：

- `server`：Node.js 服务端，负责 API、SQLite 读写和定时同步
- `web`：Nginx + 前端静态资源，负责页面访问和 `/api` 反向代理

当前镜像来源：

- GitHub Actions 构建镜像
- 推送到阿里云 ACR
- ECS 使用 Docker Compose 从 ACR 拉取镜像并启动

## ECS 需要提前准备的环境

服务器需要提前安装：

- Docker
- Docker Compose

建议提前创建目录：

```bash
sudo mkdir -p /var/www/codeview/releases
sudo mkdir -p /var/www/codeview/shared/data
sudo mkdir -p /var/www/codeview/shared
```

## 服务端环境文件

工作流会在 ECS 上通过下面的文件启动 Compose：

```text
/var/www/codeview/shared/.env
```

可参考仓库内示例文件：

```text
deploy/.env.example
```

示例内容：

```env
CODEVIEW_HTTP_PORT=81
CODEVIEW_DATA_DIR=/var/www/codeview/shared/data
SERVER_IMAGE=crpi-********.cn-shanghai.personal.cr.aliyuncs.com/codeview/server:latest
WEB_IMAGE=crpi-********.cn-shanghai.personal.cr.aliyuncs.com/codeview/web:latest
SERVER_PORT=3101
WEB_ORIGIN=http://你的域名或ECS公网IP:81
DATABASE_PATH=/app/data/asset-console.db
DEFAULT_USER_ID=local-user
ENCRYPTION_SECRET=替换成足够长的随机字符串
ADMIN_USERNAME=xinjie
ADMIN_PASSWORD=替换为高强度密码
GITHUB_TOKEN=替换为新的 GitHub PAT
GITHUB_INCLUDE_PRIVATE_REPOS=false
```

如果你准备把这个 Token 存到 GitHub Actions Secrets 中，请不要直接把 Secret 命名为 `GITHUB_TOKEN`。  
GitHub Secrets 名称不能以 `GITHUB_` 开头，建议改为：

```text
CODEVIEW_GITHUB_TOKEN
```

然后在写入 ECS 的 `shared/.env` 时，再映射回项目实际使用的环境变量名：

```env
GITHUB_TOKEN=从 CODEVIEW_GITHUB_TOKEN 注入的值
```

当前默认使用 `81` 端口；如果你仍然希望改成其他端口，可以这样配置：

```env
CODEVIEW_HTTP_PORT=81
WEB_ORIGIN=http://你的域名或公网IP:81
```

说明：

- `CODEVIEW_HTTP_PORT`：宿主机对外端口
- `CODEVIEW_DATA_DIR`：SQLite 数据库存放目录
- `SERVER_IMAGE`：服务端镜像地址
- `WEB_IMAGE`：前端镜像地址
- `WEB_ORIGIN`：前端实际访问地址
- `DATABASE_PATH`：容器内数据库路径
- `ENCRYPTION_SECRET`：GitHub Token 加密密钥
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：配置中心管理员登录账号
- `GITHUB_TOKEN`：服务端访问 GitHub API 的 Token
- `GITHUB_INCLUDE_PRIVATE_REPOS`：是否同步私有仓库

重点：

- `WEB_ORIGIN` 必须与实际访问地址完全一致
- 如果你把 `CODEVIEW_HTTP_PORT` 改成了 `81`，`WEB_ORIGIN` 也要同步改成 `http://域名或IP:81`

## 当前生产模式说明

当前线上实现采用的是：

- **公开访客模式**：访客直接查看已经同步完成的项目数据；
- **单管理员模式**：管理员登录配置中心后，才允许改配置和手动触发同步。

配置中心登录账号来自：

```env
ADMIN_USERNAME
ADMIN_PASSWORD
```

GitHub Token 不会通过前端回显给用户，前端仅展示“是否已连接”状态。

## 首次部署时的自动导入行为

当前服务端支持在启动时自动导入 GitHub 配置。

若满足以下条件：

1. `shared/.env` 中已经配置 `GITHUB_TOKEN`
2. 当前数据库尚未保存 GitHub Token

服务启动时会自动：

- 使用 `GITHUB_TOKEN` 请求 GitHub 用户信息；
- 自动解析 GitHub 用户名；
- 把用户名、Token、私有仓库同步开关写入数据库；
- 若数据库还没有成功同步记录，则自动触发首轮同步。

因此在一台新的 ECS 上，管理员不需要先进入页面手工粘贴 Token，也能完成首次接入。

## GitHub Actions Secrets

工作流依赖以下 GitHub Secrets：

- `ECS_HOST`
- `ECS_PORT`
- `ECS_USER`
- `ECS_SSH_KEY`
- `ACR_REGISTRY`
- `ACR_NAMESPACE`
- `ACR_USERNAME`
- `ACR_PASSWORD`
- `CODEVIEW_GITHUB_TOKEN`（如需通过 GitHub Secrets 管理站点默认 GitHub Token）

含义如下：

- `ECS_HOST`：ECS 公网 IP 或域名
- `ECS_PORT`：SSH 端口，默认一般为 `22`
- `ECS_USER`：登录 ECS 的用户名
- `ECS_SSH_KEY`：对应私钥内容
- `ACR_REGISTRY`：ACR 登录地址
- `ACR_NAMESPACE`：ACR 命名空间，例如 `codeview`
- `ACR_USERNAME`：ACR 登录用户名
- `ACR_PASSWORD`：ACR 登录密码
- `CODEVIEW_GITHUB_TOKEN`：GitHub Actions 中保存的站点默认 GitHub Token，后续需映射到服务端 `.env` 的 `GITHUB_TOKEN`

工作流还会读取以下 GitHub Actions Variables（建议配置在 `production` Environment 下）：

- `WEB_ORIGIN`（必填）
- `CODEVIEW_HTTP_PORT`（可选，默认 `81`）
- `CODEVIEW_DATA_DIR`（可选，默认 `/var/www/codeview/shared/data`）
- `SERVER_PORT`（可选，默认 `3101`）
- `DATABASE_PATH`（可选，默认 `/app/data/asset-console.db`）
- `DEFAULT_USER_ID`（可选，默认 `local-user`）
- `GITHUB_INCLUDE_PRIVATE_REPOS`（可选，默认 `false`）

## 部署流程

当前工作流触发方式：

- 推送到 `main`
- 手动执行 `workflow_dispatch`

部署流程如下：

1. GitHub Actions 拉取仓库代码
2. 执行 `npm ci`
3. 执行 `npm run typecheck`
4. GitHub Actions 构建 `server` 和 `web` 镜像
5. 将镜像推送到阿里云 ACR
6. 使用 `git archive` 打包当前提交
7. 通过 SSH 上传压缩包到 ECS
8. 在 ECS 创建发布目录 `/var/www/codeview/releases/<commit_sha>`
9. 解压代码
10. 更新软链接 `/var/www/codeview/current`
11. ECS 登录 ACR
12. 使用 `docker compose pull`
13. 使用 `docker compose up -d`
14. 自动清理旧版本目录，仅保留最新 2 个 release

## current 软链接说明

工作流会在每次部署后自动维护一个固定软链接：

```text
/var/www/codeview/current
```

它始终指向当前最新成功部署的发布目录。

这样做的好处是：

- 手动排查和重启时不需要再手动找最新 commit 目录
- `docker compose` 手动命令可以固定写法
- 发布目录保留历史版本，便于回滚

## release 保留策略

当前 workflow 会在部署成功后自动清理旧版本目录：

- `releases/` 下只保留最新 2 个版本目录
- `current` 始终指向当前最新成功部署的版本

这样设计的目的：

- 保留当前运行版本
- 保留上一个版本，便于快速回滚
- 避免 `releases/` 目录长期无限增长

## 容器运行说明

### 前端容器

- 镜像由 GitHub Actions 构建并推送到 ACR
- 最终由 Nginx 提供静态页面
- `/api` 请求会代理到 `server:3101`

### 后端容器

- 镜像由 GitHub Actions 构建并推送到 ACR
- 运行命令为：

```text
node apps/server/dist/index.js
```

- SQLite 数据通过宿主机目录挂载持久化

## 数据持久化

数据库目录通过 Compose 挂载：

```text
${CODEVIEW_DATA_DIR} -> /app/data
```

因此即使容器重建，SQLite 数据仍然保留在 ECS 宿主机中。

## Nginx 配置是否需要手动处理

当前这套方案里，`deploy/nginx/default.conf` 是**容器内的 Nginx 配置**：

- 它会在构建 `web` 镜像时被复制进容器
- 容器启动后由容器内的 Nginx 直接生效
- 因此你**不需要**再去 ECS 宿主机手动拷贝或编辑这份文件

只有在下面两种场景下，你才需要额外手动配置：

- 你想在 ECS 宿主机上再跑一层独立的 Nginx
- 你要在宿主机层面处理 HTTPS 证书、301 跳转或多站点网关

如果你当前只是让 Docker Compose 直接对外提供 `80` 端口，那么这份 `default.conf` 不需要手工处理。

## 注意事项

- 当前项目使用 `SQLite`，生产上应只保留一个 `server` 实例
- 当前项目包含定时同步逻辑，不适合直接横向扩容多个服务端副本
- `WEB_ORIGIN` 必须与实际访问地址一致，否则服务端 CORS 校验可能失败
- 生产环境建议只暴露 `80/443` 和必要的 `22`

## 端口冲突处理

如果部署时遇到下面这类错误：

```text
bind: address already in use
```

通常表示宿主机上已经有其他服务占用了 `80` 端口，例如宿主机 Nginx。

处理方式有两种：

1. 停掉宿主机占用 `80` 端口的服务，让容器继续使用 `80`
2. 保留宿主机服务，把 `CODEVIEW_HTTP_PORT` 改成其他端口，例如 `81`

例如：

```bash
sudo sed -i 's/^CODEVIEW_HTTP_PORT=.*/CODEVIEW_HTTP_PORT=81/' /var/www/codeview/shared/.env
sudo sed -i 's|^WEB_ORIGIN=.*|WEB_ORIGIN=http://你的域名或公网IP:81|' /var/www/codeview/shared/.env
```

然后重新执行：

```bash
docker compose --project-name codeview --file /var/www/codeview/current/compose.yaml --env-file /var/www/codeview/shared/.env up -d
```

## 首次部署建议

首次上线前，建议在 ECS 手动执行一次：

```bash
docker compose --project-name codeview --file /var/www/codeview/current/compose.yaml --env-file /var/www/codeview/shared/.env config
```

用于确认环境变量和挂载路径是否正确。

## 常用手动命令

查看状态：

```bash
docker compose --project-name codeview --file /var/www/codeview/current/compose.yaml --env-file /var/www/codeview/shared/.env ps
```

手动重启：

```bash
docker compose --project-name codeview --file /var/www/codeview/current/compose.yaml --env-file /var/www/codeview/shared/.env up -d
```

查看最近日志：

```bash
docker compose --project-name codeview --file /var/www/codeview/current/compose.yaml --env-file /var/www/codeview/shared/.env logs --tail=100
```
