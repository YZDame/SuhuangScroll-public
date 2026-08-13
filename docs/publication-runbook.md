# Suhuang Scroll public publication runbook

这份 runbook 把仓库内的可重复检查和公开分发渠道串成一条发布路径。
它不把本地归档校验当成已经通过第三方商店审核。

## 当前正式分发决策

当前 release gate 只要求以下四条线可用：

1. **GitHub-backed Plugin Marketplace**：公开仓库的
   `.agents/plugins/marketplace.json` 暴露 `plugins/suhuang-scroll`，用户运行
   `codex plugin marketplace add YZDame/SuhuangScroll-public --ref main` 后，从 Plugins
   Directory 安装。
2. **GitHub Releases**：同一个 Runtime 版本发布 native Runtime、Chrome Bridge、
   Plugin、Hosted MCP control-plane（可选部署包）及各自的 SHA256 文件。
3. **Chrome Web Store**：扩展独立提交和安装；在 listing 生效前，Release 中的
   `SuhuangScroll-Bridge-ChromeStore` 归档只用于受控测试和审核准备。
4. **Hosted MCP**：OAuth 保护的高级连接，配对用户自己的 Runtime Agent；不阻塞
   本地 marketplace 安装，也不接管本地评分语义。

OpenAI universal Plugin Directory 暂不作为当前 release gate。未来若提交官方目录，
复用现有 Plugin manifest、Skills、MCP 工具和检查资料即可。

## 当前候选版本

| Artifact | Version | Purpose |
| --- | --- | --- |
| Runtime / Chrome Bridge | `0.6.4` | 本地 Python、TUI、Chrome MV3 包 |
| Codex Plugin | `0.1.0` | Skills、本地 stdio bridge、Hosted Runtime Agent |
| Hosted MCP control plane | `0.1.0` | 公开 `POST /mcp` 部署包 |

Plugin 的公开 MCP 工具覆盖诊断、Spec 校验、统计摘要、阅卷准备，以及需要
`confirm=true` 的人工确认式阅卷控制。真实浏览器执行、写分和提交仍由本地
Runtime/Chrome Extension 完成，自动提交模式不通过 MCP 暴露。


## 必须先具备的外部条件

以下项目不可能由仓库脚本代替完成：

1. 一个可从公网访问的 HTTPS 站点，至少提供 `/`、`/docs/`、`/privacy/`、
   `/terms/`、`/support/`。
2. 一个可从公网访问的 `https://<host>/mcp` Hosted MCP endpoint。生产配置需要
   OAuth authorization-server discovery、PKCE S256、JWKS、audience、scope 和
   tenant 映射；静态 bearer token 只用于审核 fixture 或单租户演示。
3. 已验证的公开仓库归属，以及可监控的 support channel。
4. Chrome Web Store 开发者账号、隐私实践声明确认和可上传的截图。
5. 如果启用 Hosted MCP，还需要 OAuth authorization-server、JWKS、audience、scope
   和 tenant 映射；这条线是可选的高级连接。

当前已验证的公开站点 origin 是
`https://yzdame.github.io/SuhuangScroll-public/`；公开 Plugin、Chrome Bridge
候选包和 listing worksheet 均应使用这个 origin，除非另一个自定义域名先通过
同样的 HTTPS preflight。`https://suhuangscroll.com` 当前不作为发布 origin。

仓库中的 `site/` 是这五个发布页面的可验证参考实现。若使用另一个营销站点
（例如单独维护的前端仓库）承载同一域名，必须先确认它实际提供上述路径，并把
隐私、条款、支持文案与本仓库的发布行为同步；不要让两个站点同时争用同一个
自定义域名。

不要把真实模型 key、OAuth secret、review token、Cookie、学生数据或浏览器 profile
写入仓库、归档或 worksheet。

## 部署与 preflight

先部署 `site/` 与 `services/mcp-control-plane/`，再设置实际地址：

```bash
export SUHUANG_PUBLIC_BASE_URL="https://<public-site-origin>"
export SUHUANG_MCP_URL="https://<mcp-origin>/mcp"
```

在把环境变量交给部署平台前，先用不提交的 env 文件检查 OAuth/JWKS、audience、
scope、Origin 和 review tenant 隔离：

```bash
python scripts/release/check_mcp_deployment_config.py \
  --env-file /path/to/mcp-production.env
```

先验证公共 Runtime 仓库本身可匿名读取安装器和目标版本的四个平台 Release：

```bash
python scripts/release/check_public_runtime_release.py \
  --release-repo "$SUHUANG_RELEASE_REPO" \
  --version 0.6.4
```

运行只读公网检查：

```bash
python scripts/release/check_public_endpoints.py \
  --site-url "$SUHUANG_PUBLIC_BASE_URL" \
  --mcp-url "$SUHUANG_MCP_URL"
```

### 同步公开 Runtime 仓库

私有开发仓库负责构建和验证 native packages；公开 Runtime 仓库只接收白名单源树和
已经发布、经过 smoke test 的 Runtime、Plugin、Chrome Bridge 资产。创建一个非空的公开仓库后，在私有仓库
的 Actions secrets 中配置一个只对该仓库有写权限的 `SUHUANG_PUBLIC_REPO_TOKEN`，
不要把 token 写入仓库或对话。

私有 `vX.Y.Z` Release 发布完成后，手动运行 **Publish public Runtime mirror** workflow，
填写同一个版本、公开站点 origin、源 tag/ref 和 `YZDame/SuhuangScroll-public`。该 workflow 会：

1. 从私有 Release 下载四个平台 Runtime 资产，并构建公开 Plugin、Chrome Bridge 和 Chrome Store 候选包；
2. 重新执行公开树内容扫描并同步到公开仓库的 `main`；
3. 在公开仓库创建或更新同名 Release，并上传 Runtime、Plugin、Chrome Bridge、Chrome Store 候选包及各自 SHA256；
4. 用匿名 HTTP 请求验证安装脚本、Release 和全部分发资产。

导出步骤会把同一次 workflow 输入的 `public_base_url` 写入公开 Chrome Bridge
源码；这样用户从公开仓库自行构建时，也不会回退到尚未通过 HTTPS preflight 的旧站点地址。

公开树会保留 `public-site.yml`，因此可以在公开仓库的 Pages 设置中选择
**GitHub Actions**，让同一个仓库部署 `/`、`/privacy/`、`/terms/` 和 `/support/`。

公开仓库创建以前，不要把 Plugin 安装器指向私有开发仓库；公开候选包的
`release_repo` 必须与该 workflow 的目标仓库一致。

如果启用了隔离的 synthetic reviewer tenant，再用短期 token 检查审核工具调用：

```bash
export SUHUANG_MCP_REVIEW_TOKEN="<short-lived-review-token>"
python scripts/release/check_public_endpoints.py \
  --site-url "$SUHUANG_PUBLIC_BASE_URL" \
  --mcp-url "$SUHUANG_MCP_URL" \
  --check-review-fixture
```

preflight 必须确认站点页面、`/healthz`、OAuth protected-resource metadata、授权
服务器 discovery、PKCE、token endpoint 认证、MCP 401 challenge 和现代 MCP discovery。

## 生成候选包

候选包通过 GitHub Actions 的 `Build public store candidates` workflow 生成。输入：

- `public_base_url`：站点 origin；
- `mcp_url`：Hosted MCP 的 `/mcp` URL；
- `countries`：实际可用地区，不要让脚本猜测；
- `repository_url`：确认公开后再填写；
- `release_repo`：公开 Runtime 二进制和安装脚本所在的 `YZDame/SuhuangScroll-public`，必填；
- `plugin_app_id`：可选，只填开发者模式中真实注册的 connection ID；
- `review_fixture`：只有审核 token 已配置且与生产 tenant 隔离时才启用。

workflow 会重新构建并校验：

- Chrome MV3 上传 zip、SHA256 和 listing worksheet；
- Codex Plugin public zip、SHA256 和 submission worksheet；
- Hosted MCP control-plane deployment zip、SHA256；
- Chrome 数据同意/撤回安全边界；
- public site、schemas、Plugin manifest、marketplace 和仓库边界。

本地等价检查：

```bash
python scripts/release/check_chrome_store_privacy.py
python scripts/release/check_chrome_store_fixture.py
python scripts/release/check_plugin_package.py
python scripts/release/check_plugin_marketplace.py
python scripts/release/check_public_site.py
python scripts/release/check_chrome_store_assets.py
```

## GitHub-backed Plugin Marketplace 发布顺序

1. 确认公开仓库的 `main` 包含 `.agents/plugins/marketplace.json`、
   `plugins/suhuang-scroll/.codex-plugin/plugin.json` 和 `.mcp.json`。
2. 在干净环境运行：

   ```bash
   codex plugin marketplace add YZDame/SuhuangScroll-public --ref main
   codex plugin list --available --marketplace suhuang-scroll
   ```

3. 打开 Plugins Directory，选择 `Suhuang Scroll` marketplace，安装并启用插件。
4. 刷新版本时运行 `codex plugin marketplace upgrade suhuang-scroll`，再从
   Plugins Directory 更新或执行 `codex plugin add suhuang-scroll@suhuang-scroll`。
5. 安装完成后运行 `suhuang doctor --format json`，只在 doctor 通过后准备真实阅卷。

插件归档仍上传到 GitHub Release，便于审阅、回滚和没有 marketplace UI 的环境使用；
它不代表已经进入 OpenAI universal Plugin Directory。

公共候选包里的 Runtime 安装 Skill 会把安装脚本重写为 `release_repo` 的 raw URL，
并在执行时显式传入同一个 `--repo` / `-Repository`。这个仓库必须可以让普通用户读取
并下载对应 GitHub Release；不要填当前私有开发仓库，也不要把私有仓库地址写入 Plugin
或 worksheet。

## Chrome Web Store 提交顺序

1. 上传 `SuhuangScroll-Bridge-ChromeStore-v0.6.4.zip`。
2. 上传 128x128 icon、1280x800 screenshot、440x280 promo tile。
3. 填写 `SuhuangScroll-ChromeStore-listing-v0.6.4.json` 对应的名称、描述、
   权限用途、host permissions、privacy practices、privacy policy、terms 和 support URL。
4. 在干净 Chrome profile 中安装候选包：先确认未同意时不读页面、不发 heartbeat；
   勾选同意后做 adapter healthcheck 和 synthetic dry-run；撤回同意后确认观察器停止、
   自动 run 被请求停止且后续动作被阻断。
5. 测试卸载/重装：扩展偏好可以重置，但本地 Runtime 的 Spec、run records 和配置
   不应被扩展静默上传或删除。
6. 仅使用合成数据完成审核测试，真实写分和提交需要受控账号及额外确认。

## 发布判定

只有同时满足以下条件，才可以对外说“已提交/已发布”：

- 公网 preflight 通过并记录当时的 URL、版本和 checksum；
- GitHub-backed marketplace 在干净环境中能够添加、列出并安装 Plugin；
- Chrome Web Store dashboard 已接受上传并产生可追踪的状态；
- 隐私、terms、support 页面与上传包中的 URL 和行为一致。

本地测试通过只能说明“候选包可生成且结构正确”，不能替代上述外部状态。
OpenAI universal Plugin Directory 的提交状态单独记录，不作为本阶段完成条件。
