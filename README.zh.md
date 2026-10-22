# 🏴 @goodandready/dsh-gitea — 私有部署分支

**面向 DeepSeek Harness 的 Gitea/Forgejo 集成 —— 我们自用服务器上的分支版本。**

[上游项目](https://github.com/GooDAnDReaDY/dsh-gitea) · [LICENSE](LICENSE) · [AGENTS.md](AGENTS.md) · [English README](README.md)

---

本仓库是 [`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea)
（MIT）的**私有分支**，用于在我们自己的 DeepSeek Harness 服务器上运行该插件。
它不是对外分发版本：DSH 配置以 `link:` 依赖方式安装本目录，我们也从不以上游
名称向 npm 发布。

**本分支是我们的开发主线；上游只做跟踪，不在其上开发。** 上游 GitHub 仓库由
作者的私有源码生成（每个提交都是 `chore(publish): sanitized tree from <sha>`），
因此针对生成文件的 PR 可能在下一次发布时被覆盖。我们有意识地同步、保持补丁
精简，并给实际运行的版本打标签。完整的运行契约——DSH 插槽、设置契约、安装
流程、故障表——见 [AGENTS.md](AGENTS.md)。

- 分支版本：`0.7.40-dsh.1`
- 基线：上游 `abfd952`；已在 DSH `0.2.0-rc.2` 与 Forgejo
  `17.0.0+gitea-1.22.0` 上验证

## 功能

- **20+ 个代理工具**：议题、合并请求、分支、标签、发布、包、wiki、里程碑、
  标签、CI 与日志分析、worktree、仓库搜索。
- **设置页面**：**Settings → Gitea**，以及插件行的 Configure 页；涵盖连接、
  凭据、默认值、webhook、后台巡检和插件更新开关。
- **Git 状态芯片**：会话头部显示分支、ahead/behind、提交图和最近事件。
- **事件与 webhook**：`POST /dsh-gitea/webhook` 带 HMAC 校验，内存事件存储
  与 SSE 流。
- **Hub、CI 根因分析、发布助手、议题模板、worktree 隔离**，以及供其他 DSH
  插件使用的 `dshGitea` / `giteaEvents` 组合服务。

## 为什么需要这个分支

上游版本在 DSH 0.2.x 上设置页始终不显示：它注册的是已被移除的
`settings.plugin.item` 插槽，并把表单绑定到浏览器端 `configForms`——该服务在
非 loopback 页面上返回 `unavailable`。另外，HTTP guard 的缺陷会把已被允许的
Tailscale/LAN 请求变成 `403`。本分支包含这些修复，以及本地 `link:` 安装所需的
部署胶水。

相对上游 `abfd952` 的改动：

| 改动 | 原因 |
|:--|:--|
| 注册 `settings.section`（`Settings → Gitea`） | 0.2.x 上已移除的 `settings.plugin.item` 不渲染任何内容 |
| 设置表单改走宿主路由 `GET/POST /dsh-gitea/config`，带 `writable` 与重试 | `configForms` 在远程页面上只在内存中工作，曾隐藏所有字段 |
| `lib/http-guard.js`：已挂载的 DSH Connection 为权威判定 | 经反向代理/Tailscale 放行的请求落入仅 loopback 的回退分支，被误判为 `403` |
| `scripts/dev-link-dsh.mjs`（`npm run dev:link`） | pnpm 的 `link:` 安装不会解析插件的 DSH peer 依赖 |
| 配置项 `updates` 开关，本配置中关闭 | 内置 npm 更新器会用上游包替换本目录，回滚所有分支补丁 |
| `test/` 与 `scripts/leak-scan.mjs` | 上游公开树带测试脚本却没有测试本身；我们的测试可真实运行 |
| 本套 README、AGENTS.md、分支版本与标签 | 本分支是被维护的项目，不是匿名快照 |

## 要求

- DeepSeek Harness `0.1.7-rc.2` / `0.2.0-rc.x`（见 `peerDependencies`）
- Node.js 20+
- `pnpm`（Plugin Manager 安装到配置时使用）
- 可从 DSH 服务器通过 HTTPS 访问的 Gitea/Forgejo

## 安装到 DSH 配置

配置文件位于**本仓库之外**（`<profile>/package.json`、
`<profile>/cordis.patch.yml`）。优先使用 Harness 工具，而不是手工编辑。

### 1. 初始化 checkout（一次）

```bash
cd /path/to/dsh-gitea
node scripts/dev-link-dsh.mjs        # 别名：npm run dev:link
```

Plugin Manager 以 pnpm 的 `link:` 协议安装绝对路径，而 pnpm 不会从目标目录解析
被链接包的 peer 依赖。缺少这一步时插件行会显示 `failed to import`
（`Cannot find package '@deepseek-ai/schemastery'`）。该脚本只把运行中的 DSH
安装里的包软链到本目录被 gitignore 的 `node_modules/`，不会写入 DSH 安装。

### 2. 安装 bundle

```
plugin_manager action=install_bundle target=/path/to/dsh-gitea enabled=true
```

若出现 `spawn pnpm ENOENT`，说明 `pnpm` 不在 DSH 服务器的 `PATH` 中，请在配置
补丁中显式指定：

```yaml
- id: plugin-manager
  name: "@deepseek-ai/dsh-plugin-manager"
  config:
    pnpmCommand: /opt/node/bin/pnpm
```

### 3. 修改后的重载

切换 bundle 关闭再开启（`plugin_manager action=set_bundle ...`），或把本目录加入
HMR：

```yaml
- id: hmr
  config:
    root: ["/path/to/dsh-gitea"]
```

配置 HMR 后，宿主侧修改无需重启 `dsh web` 即可生效。客户端 bundle 每次请求
都会重新提供，修改 `lib/client.js` 后强制刷新页面（`Ctrl+F5`）。

### 4. 验证

```bash
plugin_manager action=list_bundles
curl -s http://127.0.0.1:3080/dsh-gitea/config | head   # 无会话返回 401 属正常
```

Web UI 中：**Settings → Gitea** 存在并显示字段，插件行有 **Configure**，git
工作目录的会话头部显示 Git 芯片。

## 配置

打开 **Settings → Gitea**（或 **Plugins → bundle 行 → Configure**）。

| 字段 | 默认值 | 含义 |
|:--|:--|:--|
| `baseUrl` | — | Gitea/Forgejo 地址，例如 `https://gitea.example.com`（DSH 为 HTTPS 时请用 HTTPS） |
| `tokenEnv` | `GITEA_TOKEN` | **DSH 凭据名称**，不是令牌本身 |
| `defaultOwner` / `defaultRepo` | — | 工具调用省略 owner/repo 时的回退值 |
| `updates` | `true`（**此处为 `false`**） | 是否显示内置 npm 更新器；本分支保持关闭 |
| `timeoutMs` | `30000` | REST 超时 |
| `forceHttpsUrls` | `false` | TLS 代理后把 `html_url` 中的 `http://` 改写为 https |
| `webhookSecretEnv` | — | 保存 webhook HMAC 密钥的凭据名称 |
| `notifyWebhook` | — | PR/CI 通知的外部 URL |
| `bgScheduler*` | 关闭 | 后台巡检/健康检查 |
| `instances` | `[]` | 额外 Gitea 实例（UI 中只读；在配置文档中设置） |
| `gitWrapper` | — | worktree 写操作使用的 git 包装器 |
| `dodReminder` | `false` | 非阻塞的 Definition-of-Done 提醒 |

### 凭据

先在 **Forgejo/Gitea**（Settings → Applications）创建 API 令牌，然后在
**DSH 凭据**中以 `tokenEnv` 指定的名称（默认 `GITEA_TOKEN`）保存。设置表单只
接受凭据*名称*；形似令牌的值会被拒绝。凭据不存在时，页面显示
“Token not configured”，工具也无法通过认证。

## 安全模型

- 仓库、聊天和表单中都不含令牌，只有凭据引用。
- 自定义路由经过 `lib/http-guard.js`：挂载了 DSH Connection 时以其为准（未认证
  401 / 安全围栏 403），否则回退为仅 loopback 且失败即拒绝。
- webhook 使用 `webhookSecretEnv` 中的密钥做 HMAC-SHA256 校验；缺少密钥时返回
  401 而不处理 payload。
- 插件更新器有**双重开关**：仅接受带 `x-dsh-plugin-update` 头的 loopback 请求，
  以及 `updates` 配置开关。本配置保持关闭，避免 npm 安装覆盖分支目录。
- `npm run test:leaks` 会在发现私有 home 路径、npm scope、令牌字面量或发布 JS
  中的西里尔字符时失败。

## 上游策略与同步

- `origin` —— 我们的私有 Forgejo，唯一的 push 目标。
- `upstream` —— `https://github.com/GooDAnDReaDY/dsh-gitea.git`，只 fetch。

在上游改动确实重要时才有意识地同步，而不是每次发布都跟：

```bash
git fetch upstream
git rebase upstream/main     # 生成的 bundle 冲突过多时也可用 merge
npm test && npm run test:leaks
```

冲突热点：`package.json`（版本行）、`CHANGELOG.md` 顶部、`lib/client.js`
（生成的 bundle，我们最大的 diff）。切勿把本树或其历史推送到 GitHub：其中包含
内部主机名。若将来要向上游提交，请使用最小分支或补丁文件；
`lib/http-guard.js` 是自包含的，最适合作为 PR。

## 版本与标签

- 格式：`<上游基线>-dsh.<n>` —— 当前为 `0.7.40-dsh.1`。
- 每个实际运行状态都打 `v<版本>` 标签。回滚：
  `git checkout v0.7.40-dsh.1`，然后切换 bundle 开关并强制刷新页面。
- 每次发布在 `CHANGELOG.md` 添加分支条目；上游条目保持不动。

## 开发与检查

```bash
npm test             # 回归测试：设置接线、guard、更新器开关
npm run test:leaks   # 发布树卫生检查
node --check lib/client.js
node --check lib/index.js
```

`lib/client.js` 是**生成的浏览器 bundle**（单一的
`window.__ModuleLoader__.load` 工厂）。其中的手改是有意的源码补丁，但上游作者会
从私有 TypeScript 重新生成该文件——同步时预期会冲突，需要重新应用我们的代码块。
此环境没有浏览器自动化，UI 改动需人工在 Web UI 中确认。

## 仓库结构

| 路径 | 作用 |
|:--|:--|
| `lib/index.js` | 宿主入口：Config 模式、设置集成、工具、路由、服务 |
| `lib/client.js` | 生成的 Web bundle：设置页、Git 芯片/抽屉、操作卡片、语言包 |
| `lib/routes.js`、`lib/routes-hub.js` | HTTP 路由（`/config`、`/events`、`/git-*`、`/sse`、`/hub`、webhook） |
| `lib/http-guard.js` | 路由认证/CSRF 围栏（优先 DSH Connection，回退 loopback） |
| `lib/plugin-updater.js` | 位于 `updates` 开关之后的 npm 更新器 |
| `lib/gitea-client.js` | Gitea REST 客户端（缓存、ETag、重试、超时） |
| `lib/handlers*`、`lib/tool-defs*` | 工具实现与模式 |
| `scripts/dev-link-dsh.mjs`、`scripts/leak-scan.mjs` | `link:` 初始化与卫生检查 |
| `test/*.test.mjs` | 针对分支修复的回归测试 |
| `AGENTS.md` | 给下一个代理的深入操作笔记：插槽、契约、runbook |

## 许可证

MIT —— 原始作品 © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)，详见
[LICENSE](LICENSE)。分支修改在本仓库中维护。
