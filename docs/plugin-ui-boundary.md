# Plugin UI 边界

当前 Suhuang Scroll Plugin 的交互面由 Skills、MCP 工具、TUI 和 Chrome
Extension 组成。`plugin.json` 里的 `interface` 只描述 Plugin 在 Codex
列表、详情页和 Composer 中的展示信息：名称、图标、默认提示语和商店截图。
它不是一个可以放置业务控件的运行时面板。

## 当前版本

- Codex 通过 MCP 调用诊断、Spec 校验、适配器/Provider 列表、统计摘要和阅卷
  计划准备工具。
- 本地 TUI 负责真实阅卷的人工确认、启动、暂停、恢复和停止。
- Chrome Extension 的 Side Panel 负责网页侧适配器、页面采集和本地 Runtime
  的执行桥接。
- Hosted MCP relay 当前只传递工具调用，不提供 `ui/*` 资源、widget HTML
  或 `_meta.ui.*` 渲染协议。

因此 v0.6.0 不声明一个不存在的 Codex 内嵌面板，也不把 TUI 的控制逻辑复制
到 Plugin 中。

## 未来的面板路径

如果后续确实需要在支持的宿主中显示状态卡片或 Spec 预览，应单独采用 MCP
Apps/Apps SDK 的 widget 资源：

1. 先确定宿主、资源 URI、CSP、可信域名和认证边界。
2. 让 MCP 工具返回最小的 `structuredContent`，把仅供 widget 使用的数据放在
   `_meta`，不把学生记录或凭据注入 UI。
3. 面板只做状态展示、Spec 预览和下一步引导；真实阅卷控制仍沿用 TUI/CLI 的
   人工确认流程。
4. 使用 MCP Inspector 和合成数据验证 widget 生命周期、重复工具调用、断线
   和权限失败，再决定是否把 UI 资源纳入公开 Plugin 包。

在有实际 App manifest 和受支持的宿主之前，不要向 `plugin.json` 添加
`apps`/`.app.json` 占位字段；空占位不会产生可用面板，只会扩大发布面。
