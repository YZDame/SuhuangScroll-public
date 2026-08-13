# 协议契约版本（Protocol Version）

本地客户端（TUI / CLI / Chrome 扩展）与 Python 后端之间通过本地 HTTP API 通信。
为在版本错配时给出明确提示、而非难以诊断的静默失败，后端在 `/api/health` 上报一个
**协议契约版本** `protocol_version`，客户端各自保存一份期望值并在连接时比对。

## 与主程序版本的区别

| 维度 | 主程序版本（`version`） | 协议契约版本（`protocol_version`） |
| --- | --- | --- |
| 形态 | SemVer 字符串，如 `0.4.1` | 单调递增整数，如 `1` |
| 来源 | `core/python/pyproject.toml`（见 `utils/version.py`） | `core/python/core/protocol.py` 的 `PROTOCOL_VERSION` 常量 |
| 递增时机 | 每次发布（补丁/小版本/大版本） | 仅当 `/api` 的请求或响应形态发生**不兼容**变化时 |

主程序版本每个 release 都会变；协议契约版本只在真正破坏前后端兼容性时才 +1。
两者解耦，便于"主程序打补丁但协议不变"的常见情形下，旧扩展仍能与新后端协作。

## 当前值

- 后端：`core/python/core/protocol.py` → `PROTOCOL_VERSION = 1`
- 扩展：`extension/src/background/index.ts` → `EXPECTED_PROTOCOL_VERSION = 1`
- TUI：`core/tui/src/app/backend.rs` → `EXPECTED_PROTOCOL_VERSION = 1`
- Web GUI：`core/gui/lib/backend-client.ts` → `EXPECTED_PROTOCOL_VERSION = 1`

四者必须保持相等。修改其一时，必须同步其他客户端（见下方递增规则）。
`python scripts/release/check_versions.py` 会同时检查主程序版本和后端、TUI、扩展三处
协议常量；冻结 GUI 不进入普通功能分支的必跑检查。

## 何时递增

当且仅当发生以下任一**不兼容**变化时，将 `PROTOCOL_VERSION` 加 1：

- 删除或重命名客户端依赖的 `/api` 端点。
- 修改已有端点的请求/响应字段语义，使旧客户端按旧理解解析会出错。
- 删除客户端依赖的响应字段，或把可选字段改为必填。

**不需要**递增的兼容变化：

- 新增端点。
- 在响应中新增可选字段。
- 后端内部实现、性能、日志、错误文案的调整。

递增步骤：

1. 修改后端 `PROTOCOL_VERSION`。
2. 同步修改 TUI、扩展和冻结 GUI 的 `EXPECTED_PROTOCOL_VERSION`。
3. 在本文件「当前值」与变更说明中记录这次递增的原因。

## HTTP 契约来源

HTTP 请求与响应以 FastAPI 路由上的 Pydantic model 和生成的 OpenAPI schema 为准。
扩展消费的稳定子集记录在 `extension/src/generated/backend-contracts.ts`；运行
`python scripts/release/check_api_contracts.py` 校验扩展/TUI 使用的端点和字段仍存在。
兼容新增字段无需提升协议版本；删除、重命名或改变既有字段语义时必须提升。

## Agent 接入契约

Codex Plugin 的 MCP 工具不复制评分逻辑；它调用同一个 Runtime CLI，并返回
`schemas/` 中的公共契约。当前公开契约版本是 `v1`：

- `schemas/question-spec/v1.schema.json`
- `schemas/grading-decision/v1.schema.json`
- `schemas/run-events/v1.schema.json`
- `schemas/adapter-contract/v1.schema.json`

这些 JSON Schema 的版本与本地 HTTP `PROTOCOL_VERSION` 独立。增加可选字段时保持
向后兼容；删除字段或改变含义时同时更新 Schema、Runtime、MCP 工具说明和迁移文档。

## 客户端校验行为

Chrome 扩展在两处校验：

- **service worker 启动时**主动调用一次，结果写入控制台日志（后端未启动时记为 unreachable，仅日志）。
- **`CHECK_BACKEND` 消息**：Side Panel 可主动触发校验，拿到结构化结果用于界面提示。

校验逻辑见 `extension/src/background/index.ts` 的 `checkBackendProtocol()`。当后端
`protocol_version` 与扩展期望值不一致、或后端为不上报该字段的旧版本时，返回
`reason: 'protocol_mismatch'` 与一句可读提示，引导用户把主程序与扩展升级到同一 release。

Web GUI（`core/gui`）在 `lib/backend-client.ts` 的 `checkBackendProtocol()` 中执行相同校验：
`protocol_version` 不匹配时拒绝连接，并在界面顶部提示版本错配，引导用户升级到同一 release。

TUI（Rust）启动本地后端或连接已有后端时读取 `/api/health` 的 `protocol_version`。
缺少版本或版本不匹配时，TUI 显示 `backend` 类错误并阻止任务启动。
