# 项目使用的 GitHub 接口整理

## 文档说明

本文档整理了 CodeView 项目当前实际调用的 GitHub REST API 接口。

- 接口封装位置：`apps/server/src/modules/sync/github.client.ts`
- 调用入口：`apps/server/src/modules/sync/sync.service.ts`
- 调用方式：全部由服务端发起，前端不直接请求 GitHub

## 统一请求方式

所有 GitHub 接口都通过统一方法 `requestGitHub` 发起，请求基础地址为：

```text
https://api.github.com
```

统一请求头如下：

```text
Accept: application/vnd.github+json
Authorization: Bearer {GitHub Token}
User-Agent: Asset-Console
```

相关官方文档：

- REST API 总览：<https://docs.github.com/en/rest>
- REST API 认证：<https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api>
- REST API 限流：<https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>

## 接口清单

### 1. 获取当前用户信息

- 方法：`GET`
- 路径：`/user`
- 代码位置：`fetchGitHubUser`
- 用途：获取当前 Token 对应的 GitHub 登录名，用于同步时做作者身份归一化
- 触发时机：执行全量同步、增量同步、单仓库同步时
- GitHub 官方文档：<https://docs.github.com/en/rest/users/users#get-the-authenticated-user>

### 2. 获取当前用户仓库列表

- 方法：`GET`
- 路径：`/user/repos`
- 实际请求示例：

```text
/user/repos?per_page=100&page=1&sort=updated&direction=desc&visibility=public
```

或

```text
/user/repos?per_page=100&page=1&sort=updated&direction=desc&visibility=all
```

- 代码位置：`fetchGitHubRepos`
- 用途：拉取用户仓库列表，作为同步入口数据
- 关键参数：
  - `per_page=100`：单页最大 100 条
  - `page`：分页拉取
  - `sort=updated`：按更新时间排序
  - `direction=desc`：降序
  - `visibility=public/all`：是否包含私有仓库
- 触发时机：全量同步、增量同步、单仓库同步前的仓库解析阶段
- GitHub 官方文档：<https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user>

### 3. 获取仓库语言分布

- 方法：`GET`
- 路径：`/repos/{owner}/{repo}/languages`
- 代码位置：`fetchRepoLanguages`
- 用途：获取仓库语言字节分布，用于技术栈画像和语言占比分析
- 触发时机：每个仓库同步时都会调用
- GitHub 官方文档：<https://docs.github.com/en/rest/repos/repos#list-repository-languages>

### 4. 获取仓库提交记录

- 方法：`GET`
- 路径：`/repos/{owner}/{repo}/commits`
- 实际请求示例：

```text
/repos/{owner}/{repo}/commits?per_page=100&page=1
```

增量同步时可能追加：

```text
/repos/{owner}/{repo}/commits?per_page=100&page=1&since=2026-06-01T00%3A00%3A00.000Z
```

- 代码位置：`fetchRepoCommits`
- 用途：拉取提交记录，构建活跃度、趋势、热力图、最近提交等核心数据
- 关键参数：
  - `per_page=100`：单页最大 100 条
  - `page`：分页拉取
  - `since`：增量同步起始时间
- 触发时机：每个仓库同步时调用
- GitHub 官方文档：<https://docs.github.com/en/rest/commits/commits#list-commits>

### 5. 获取仓库访问量数据

- 方法：`GET`
- 路径：`/repos/{owner}/{repo}/traffic/views`
- 代码位置：`fetchRepoTraffic`
- 用途：获取近 14 天访问量数据，用于流量趋势和评分计算
- 触发时机：每个仓库同步时调用
- 备注：如果权限不足或接口失败，项目会降级为空数据，不中断整体同步
- GitHub 官方文档：<https://docs.github.com/en/rest/metrics/traffic#get-page-views>

### 6. 获取仓库克隆量数据

- 方法：`GET`
- 路径：`/repos/{owner}/{repo}/traffic/clones`
- 代码位置：`fetchRepoTraffic`
- 用途：获取近 14 天克隆量数据，用于流量统计和评分计算
- 触发时机：每个仓库同步时调用
- 备注：和访问量接口一起并发请求；失败时同样降级为空数据
- GitHub 官方文档：<https://docs.github.com/en/rest/metrics/traffic#get-repository-clones>

### 7. 获取仓库关键文件内容

- 方法：`GET`
- 路径：`/repos/{owner}/{repo}/contents/{filePath}`
- 代码位置：`fetchRepoFiles`
- 用途：读取关键配置文件内容，用于识别技术栈标签
- 触发时机：每个仓库同步时按文件逐个尝试调用

当前会尝试读取的文件包括：

- `package.json`
- `requirements.txt`
- `pyproject.toml`
- `go.mod`
- `pom.xml`
- `Cargo.toml`
- `Dockerfile`

请求示例：

```text
/repos/{owner}/{repo}/contents/package.json
```

备注：

- 如果某个文件不存在，会直接跳过，不影响同步流程
- 返回内容为 Base64 时，项目会先解码再入库
- GitHub 官方文档：<https://docs.github.com/en/rest/repos/contents#get-repository-content>

## 接口使用总结

当前项目实际用到的 GitHub REST API 主要分为四类：

1. 用户信息接口：`/user`
2. 仓库列表接口：`/user/repos`
3. 仓库明细接口：`/repos/{owner}/{repo}/languages`、`/commits`、`/traffic/views`、`/traffic/clones`
4. 仓库文件接口：`/repos/{owner}/{repo}/contents/{filePath}`

## 当前结论

- 项目当前只使用 GitHub REST API
- 所有 GitHub 请求都由后端统一发起
- 前端只调用本项目自己的 `/api/...` 接口，不直接访问 GitHub
- 当前未使用 GitHub GraphQL API
- 当前未使用 GitHub Webhook

## 补充说明

- 大部分接口都可以在 GitHub Free 下使用，但会受到认证和限流规则约束
- `traffic/views` 和 `traffic/clones` 需要仓库写入或 push 访问权限
- 流量接口的产品能力说明可参考：<https://docs.github.com/en/rest/metrics/traffic>
