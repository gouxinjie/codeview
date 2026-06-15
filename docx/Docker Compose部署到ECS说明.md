# Docker Compose 部署到 ECS 说明

## 文档说明

本文档用于说明 CodeView 如何通过 GitHub Actions 部署到阿里云 ECS，并使用 Docker Compose 启动服务。

## 本次已落地的文件

- `compose.yaml`
- `apps/server/Dockerfile`
- `apps/web/Dockerfile`
- `deploy/nginx/default.conf`
- `deploy/codeview.env.example`
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
```

## 服务端环境文件

工作流会在 ECS 上通过下面的文件启动 Compose：

```text
/var/www/codeview/shared/codeview.env
```

可参考仓库内示例文件：

```text
deploy/codeview.env.example
```

示例内容：

```env
CODEVIEW_HTTP_PORT=80
CODEVIEW_DATA_DIR=/var/www/codeview/shared/data
SERVER_IMAGE=crpi-5ue84w8rjgqxg0s0.cn-shanghai.personal.cr.aliyuncs.com/codeview/server:latest
WEB_IMAGE=crpi-5ue84w8rjgqxg0s0.cn-shanghai.personal.cr.aliyuncs.com/codeview/web:latest
SERVER_PORT=3101
WEB_ORIGIN=http://你的域名或ECS公网IP
DATABASE_PATH=/app/data/asset-console.db
DEFAULT_USER_ID=local-user
ENCRYPTION_SECRET=替换成足够长的随机字符串
```

说明：

- `CODEVIEW_HTTP_PORT`：宿主机对外端口
- `CODEVIEW_DATA_DIR`：SQLite 数据库存放目录
- `SERVER_IMAGE`：服务端镜像地址
- `WEB_IMAGE`：前端镜像地址
- `WEB_ORIGIN`：前端实际访问地址
- `DATABASE_PATH`：容器内数据库路径
- `ENCRYPTION_SECRET`：GitHub Token 加密密钥

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

含义如下：

- `ECS_HOST`：ECS 公网 IP 或域名
- `ECS_PORT`：SSH 端口，默认一般为 `22`
- `ECS_USER`：登录 ECS 的用户名
- `ECS_SSH_KEY`：对应私钥内容
- `ACR_REGISTRY`：ACR 登录地址
- `ACR_NAMESPACE`：ACR 命名空间，例如 `codeview`
- `ACR_USERNAME`：ACR 登录用户名
- `ACR_PASSWORD`：ACR 登录密码

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
10. ECS 登录 ACR
11. 使用 `docker compose pull`
12. 使用 `docker compose up -d`

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

## 首次部署建议

首次上线前，建议在 ECS 手动执行一次：

```bash
docker compose --project-name codeview --file /var/www/codeview/releases/<commit_sha>/compose.yaml --env-file /var/www/codeview/shared/codeview.env config
```

用于确认环境变量和挂载路径是否正确。
