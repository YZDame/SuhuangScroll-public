# TUI 产品职责与后端映射

本文记录 TUI 当前稳定能力、斜杠命令、运行状态和后端接口映射。评分规则、题目解析和任务状态转换由共享 Python 后端维护；TUI 只负责用户输入、展示和调用编排。

## 入口与职责

- 普通用户运行 `suhuang` 进入 TUI。
- TUI 提供配置摘要、Spec 选择与校验、任务启动/暂停/恢复/停止、状态、统计和暂停提醒。
- CLI 面向 Agent、开发者和自动化脚本，保留 doctor、adapter 调试、原始 payload、结构化统计和复杂诊断。
- Chrome 扩展负责页面抓取、页面状态、写分、提交和翻页观察。
- GUI 已冻结，不属于当前发布主线。

新功能先落到共享后端服务或契约，再由 TUI/CLI 调用。TUI 不定义评分判断、置信度状态转换或站点 DOM 规则。

## 斜杠命令

| 命令 | 用户能力 | 实现或后端映射 |
| --- | --- | --- |
| `/spec <file>` | 选择并校验 Markdown Spec | 本地调用 `cli.py validate-spec`，解析逻辑来自共享 `spec_service` |
| `/provider <id>` | 选择视觉模型提供方 | 读取共享 provider registry 与用户配置 |
| `/model <id>` | 选择模型 | 读取共享 provider registry 与用户配置 |
| `/adapter <id>` | 选择已启用站点适配器 | 读取 `resources/site_adapters.json` |
| `/alerts <channel>` | 选择 Feishu、Telegram 或 None | 将本机提醒配置加入启动请求 |
| `/start` | 启动任务 | `POST /api/automation/start`；冲突时先停止当前任务再重试 |
| `/pause`、`/p` | 暂停任务 | `POST /api/automation/pause` |
| `/resume` | 恢复任务 | `POST /api/automation/resume` |
| `/stop` | 停止并等待稳定状态 | `POST /api/automation/stop`，随后轮询 status |
| `/status` | 查看当前状态 | `GET /api/automation/status` |
| `/stats [session-id]` | 查看简洁统计快照 | 本地调用 `cli.py stats`，统计计算留在共享 Python 代码 |
| `/submit`、`/retry` | 对暂停中的兼容流程发送人工动作 | `POST /api/automation/manual-action`；不在主命令建议中展示 |
| `/?`、`/help` | 查看命令帮助 | TUI 本地展示 |
| `/clear` | 清空当前转录区 | TUI 本地状态 |
| `/quit`、`/exit` | 退出 TUI | TUI 本地状态；回收由 TUI 启动的后端子进程 |

## 后端连接与协议

TUI 启动时连接已有本地后端；若后端不可达，则启动内置或源码环境的 Python 后端。连接后读取 `GET /api/health`，要求 `protocol_version` 与 TUI 内置版本一致。缺少版本或版本不匹配时显示 `backend` 类错误，并阻止 `/start`。

TUI 只回收自己启动的子进程，不终止用户在 TUI 之外启动的后端。

## 运行状态

| 状态 | TUI 展示含义 |
| --- | --- |
| `idle` | 没有活动任务 |
| `starting` | 后端正在建立任务 |
| `capturing` | 等待或处理页面答案 |
| `awaiting_confirmation` | 等待人工确认；展示为运行中并结合原因说明 |
| `submitting` | 扩展正在写分或提交 |
| `waiting_next_page` | 等待页面切换 |
| `paused` | 已暂停，等待人工处理或恢复 |
| `stopped` | 已停止 |
| `completed` | 已完成 |
| `error` | 后端记录了运行错误 |

状态转换由 `core/python/services/automation_service.py` 决定。TUI 不复制这些转换条件。

## 错误分类

TUI 对操作错误使用五个稳定类别：

- `configuration`：Spec、许可、provider、model 或本机配置。
- `backend`：本地 API、HTTP 响应、协议版本或后端进程。
- `model`：视觉模型和模型请求。
- `extension`：Chrome 扩展连接或扩展人工动作。
- `site`：站点 adapter、抓取、写分或提交。

类别用于操作者定位责任边界；完整错误链仍保留在转录区。
