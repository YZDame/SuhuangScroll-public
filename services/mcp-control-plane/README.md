# Suhuang Scroll MCP control plane

这是公开 Codex Plugin 所需的 HTTPS MCP 部署目标。它只做两件事：

1. 在 `/mcp` 提供 MCP JSON-RPC 工具发现和调用；
2. 把工具调用通过短期内存队列转给用户本机主动发起连接的 Runtime Agent。

控制平面不读取用户 `workspace/`，不保存阅卷记录，不接收模型 API Key。它可以把
经过认证且带有 `confirm=true` 的启动、暂停、恢复、重试、停止和当前待确认决策
提交请求转发给用户本地的 Python Runtime；真正的模型调用、浏览器写分和网站提交
仍发生在用户机器上的 Runtime 与 Chrome Extension 中，自动提交模式不会通过该
接口启用。

## 本地运行

Node.js 20 或更新版本即可，不需要安装 npm 依赖：

```bash
export SUHUANG_MCP_TOKEN="$(openssl rand -hex 32)"
export SUHUANG_AGENT_TOKEN="$(openssl rand -hex 32)"
npm start
```

生产环境可以从 [`deploy/mcp.env.example`](deploy/mcp.env.example) 复制一份不含
secret 的配置模板。复制后的文件必须放在受保护的主机路径并设为 `600`；模板中的
OIDC issuer、JWKS、audience、agent token 和可选审核 token 都必须替换，不能直接把
示例值用于公网服务。

健康检查：

```bash
curl http://127.0.0.1:8080/healthz
```

`/healthz` 同时返回不含 token、tenant、参数、结果或学生内容的运行计数器：HTTP/MCP
请求数、认证失败、Origin 拒绝、协议错误、Runtime 离线和队列超时。异常事件默认以
结构化 JSON 写入 stdout，同样只包含事件名、状态码和工具名等低敏元数据；如需由平台
统一采集指标，可以设置 `SUHUANG_LOG_EVENTS=0` 关闭这些事件日志并继续保留健康检查
计数器。生产环境应把 stdout 接入平台日志，并为 `/healthz` 配置探针。

生产环境必须通过 HTTPS 反向代理或平台托管，并设置独立的 MCP bearer token
和 Runtime Agent bearer token。多租户可以使用 JSON token map：

```bash
export SUHUANG_MCP_TOKENS_JSON='{"mcp-token-for-demo":"demo"}'
export SUHUANG_AGENT_TOKENS_JSON='{"agent-token-for-demo":"demo"}'
```

`tenant` 只用于把 Codex 请求与对应的出站 Agent 隔离；token 本身不会写入日志。

Hosted `/mcp` 使用 Streamable HTTP 的 JSON 响应模式。当前实现支持现代的
`2026-07-28`（每次请求自带 `_meta`、`MCP-Protocol-Version`、`Mcp-Method`，工具
调用还要带 `Mcp-Name`，并提供 `server/discover`），同时保留旧版握手协议
`2025-11-25`、`2025-06-18`、`2025-03-26`、`2024-11-05`。现代请求必须在
`Accept` 中同时声明 `application/json` 和 `text/event-stream`；服务会拒绝版本、
body metadata 与标准请求头不一致的请求。当前 relay 不需要服务器推送，因此
`GET /mcp` 返回 `405` 是有意的；`POST /mcp` 是唯一的 MCP 入口。

浏览器环境还应设置精确的 Origin allowlist。未设置时，不带 `Origin` 的服务端
请求仍可工作，但带有任意 `Origin` 的请求都会被拒绝；不要在生产环境使用 `*`：

```bash
export SUHUANG_ALLOWED_ORIGINS="https://<the-browser-origin-used-by-your-deployment>"
```

多项 Origin 可以用空格或逗号分隔。这个设置只控制浏览器跨域边界，不替代 MCP
bearer/OAuth 身份认证。

如果使用外部 OAuth 2.1 授权服务器，可以设置 `SUHUANG_MCP_RESOURCE` 和
`SUHUANG_OAUTH_ISSUER`。服务会公开
`/.well-known/oauth-protected-resource` 和带 `resource_metadata` 的 401 challenge，
方便接入符合 MCP Authorization 规范的资源服务器。再设置
`SUHUANG_OAUTH_JWKS_URL`、`SUHUANG_OAUTH_AUDIENCE` 后，服务会校验 RS256 access
token 的 issuer、audience、scope、过期时间和 JWKS 签名，并把
`SUHUANG_OAUTH_TENANT_CLAIM`（默认 `tenant_id`，缺失时回退 `sub`）映射到 tenant。
静态 bearer token map 仍保留给本地和审核 demo。

公开 OAuth 配置示例：

```bash
export SUHUANG_MCP_RESOURCE="https://mcp.example.com"
export SUHUANG_RESOURCE_DOCUMENTATION="https://docs.example.com/suhuang-scroll/mcp"
export SUHUANG_OAUTH_ISSUER="https://login.example.com"
export SUHUANG_OAUTH_JWKS_URL="https://login.example.com/.well-known/jwks.json"
export SUHUANG_OAUTH_AUDIENCE="suhuang-mcp"
export SUHUANG_OAUTH_SCOPE="suhuang:runtime"
```

## 审核用合成 tenant

官方 Scan Tools 和人工审核通常不会配对一台真实的本地 Runtime。可以为一个独立的
静态 token tenant 开启确定性的合成结果，让审核者验证工具调用、结果形状和安全边界：

```bash
export SUHUANG_MCP_REVIEW_MODE="fixture"
export SUHUANG_MCP_REVIEW_TENANTS="codex-review"
export SUHUANG_MCP_TOKENS_JSON='{"<review-token>":"codex-review"}'
```

fixture 只对列出的 tenant 生效，返回仓库内的公开 synthetic spec 和空的运行统计；它
不会读取 workspace、启动 Runtime、调用模型、接收学生/OCR 数据或生成真实 pairing code。
其他 tenant 仍走正常的本地 Agent relay。生产用户不应复用审核 token，也不应把真实用户
tenant 加入 `SUHUANG_MCP_REVIEW_TENANTS`；如果没有设置 `SUHUANG_MCP_REVIEW_MODE=fixture`，
该路径默认关闭。`/healthz` 会报告当前 `reviewMode`，便于部署前检查。

## Docker

```bash
docker build -t suhuang-scroll-mcp services/mcp-control-plane
docker run --rm -p 8080:8080 \
  -e SUHUANG_MCP_TOKEN="$SUHUANG_MCP_TOKEN" \
  -e SUHUANG_AGENT_TOKEN="$SUHUANG_AGENT_TOKEN" \
  suhuang-scroll-mcp
```

镜像内置 Docker healthcheck，会请求 `http://127.0.0.1:8080/healthz`；反向代理或托管
平台仍应配置自己的 HTTPS、告警和访问日志策略。

## 启动本地 Agent

在 Codex 中调用 `suhuang_runtime_pair`，把返回的一次性 code 交给安装了
Runtime 的用户机器：

```bash
SUHUANG_CONTROL_PLANE_URL="https://mcp.example.com" \
SUHUANG_PAIRING_CODE="<one-time-code>" \
SUHUANG_ROOT="/path/to/agentic-grading" \
node /path/to/plugins/suhuang-scroll/mcp/agent.mjs
```

Agent 会用 pairing code 换取短期 token，只向外发起 HTTPS 请求，不监听本地端口。远程命令的路径默认只能是
Runtime 根目录下的相对路径，并且 `suhuang_get_stats` 不允许返回逐条学生/OCR
记录。Agent 调用的仍是同一个 `mcp/server.mjs` stdio bridge，因此评分语义不
会在控制平面复制一份。

## 发布前的硬性检查

部署前先把实际 OAuth/JWKS、resource、audience 和隔离的 reviewer fixture
配置写入一个不提交到 Git 的 env 文件，并运行：

```bash
python scripts/release/check_mcp_deployment_config.py --env-file /path/to/mcp-production.env
```

这个检查不会打印任何 token 或 key。它只验证配置形状；服务部署后仍必须使用
真实 HTTPS 地址运行 `scripts/release/check_public_endpoints.py`，以验证 OAuth
discovery、PKCE、JWKS、401 challenge 和 MCP transport。

- MCP URL 应为 `https://<host>/mcp`，不能使用 localhost 或 stdio。
- 生产 preflight 应用现代 `server/discover` 请求验证
  `MCP-Protocol-Version: 2026-07-28`、`Mcp-Method` 和 `_meta`；浏览器部署还应
  检查 Origin allowlist。旧版客户端仍可用 initialize 握手回退。
- 如果提交门户给出域名校验 token，把它设置到
  `SUHUANG_OPENAI_APPS_CHALLENGE`；服务会原样响应
  `/.well-known/openai-apps-challenge`。
- 公开部署需要身份验证、租户隔离、隐私政策、支持页和服务条款。pairing code
  把每个 MCP tenant 绑定到一台本地 Agent；面向公众的多租户版本仍应接入 OAuth
  access-token 校验，并使用共享队列替换单实例内存队列。

验证与打包：

```bash
npm test --prefix services/mcp-control-plane
python scripts/release/package_mcp_control_plane.py
```
