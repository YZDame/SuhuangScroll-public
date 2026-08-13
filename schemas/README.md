# Suhuang Scroll 公共契约

这里存放跨 Runtime、Chrome Extension、MCP 和未来接入方使用的稳定数据契约。

目录中的 JSON Schema 是协议版本的发布基线；`workspace/specs/` 仍然保存实际运行的
Markdown 题目 Spec，不能把运行数据或私人题目复制到这里。

当前版本：`v1`

| 契约 | 用途 | 运行时来源 |
| --- | --- | --- |
| `question-spec/v1.schema.json` | 题目与评分标准 | `core/python/core/contracts.py:QuestionSpec` |
| `grading-decision/v1.schema.json` | 单题/批次的结构化阅卷结果 | `GradeResult` / `GradeJobResult` |
| `run-events/v1.schema.json` | 运行状态和审计事件 | `RunState`、自动化服务事件 |
| `adapter-contract/v1.schema.json` | Chrome 站点 Adapter 描述 | `resources/site_adapters.json` |

兼容性规则：新增字段默认可选；删除或改变字段含义需要提升契约主版本，并在
`docs/protocol-version.md` 中记录迁移方式。Schema 不承担站点选择器、模型 Prompt 或
任何真实账号数据。
