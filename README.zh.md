<div align="center">

# 🏴 dsh-gitea <img src="assets/logos/gitea.svg" alt="Gitea" width="36"> <img src="assets/logos/forgejo.svg" alt="Forgejo" width="36">

🇬🇧 [English](README.md) | 🇨🇳 **中文** | 🇷🇺 [Русский](README.ru.md)

**Gitea/Forgejo，在你的 DeepSeek Harness 会话中驱动。**

主仓库：[pvlb.dev/dsh-plugins/dsh-gitea](https://git.pvlb.dev/dsh-plugins/dsh-gitea/)

96 个一等工具 · 可按预设切换的工具面 · 设置页 · 实时 Git 状态徽标

[安装](#安装) · [配置](#配置) · [工具集](#工具集) · [安全](#默认即安全) · [开发](#开发) · [npm](https://www.npmjs.com/package/dsh-gitea)

<img src="assets/illustrations/whale-forge.jpg" alt="一头鲸鱼铁匠在锻炉边歇息，一手端着茶——一个打理得当的仓库该有的样子" width="860">

</div>

---

## 这是什么

`dsh-gitea` 把 DeepSeek Harness 会话连接到你自己托管的 Gitea 或 Forgejo
实例：agent 获得 96 个 schema 显式声明的一等工具，覆盖 issue、pull request、
评审、CI、release 和仓库（默认通过 2 个 `dispatcher` 元工具按需提供每个操作
的 schema）；你则在会话头部获得一个 **设置 → Gitea** 页面和一个
**Git 状态徽标**。
它不从网页抓取任何内容 —— 每次调用都是通过 REST API 的 typed 工具，token 在
调用时从 DSH 凭据中解析。读 PR、评审、rebase、盯 CI、打 tag、顺手提交后续
issue，全程都不用离开对话。

*这是 [GooDAnDReaDY/dsh-gitea](https://github.com/GooDAnDReaDY/dsh-gitea)
（MIT）的 fork —— 本 fork 新增了什么见 [基于上游](#基于上游)。*

## 你能用它做什么

- **规划工作。** 一次调用提交一个或五十个 issue，带标签（按名称*或*数字
  id）、assignee 和里程碑；先查重、先跑 Definition of Done 检查；回答前按
  时间线走一遍；从你批准过的试运行批量重打标签。
- **带上下文读代码、改代码。** 浏览分支、tag、文件、提交和 diff；forge API
  搜不了代码时在本地搜索；合并前比较两个 ref。
- **像维护者一样评审。** 带一键建议的行内评论，批准或要求修改，拿到基于规则
  的风险摘要 —— 涉及区域、测试、迁移、合并状态 —— 外加评审收件箱和来自
  `CODEOWNERS` 与提交历史的评审人建议。
- **安全合并。** 合并门禁会检查描述、冲突、批准、测试和迁移；只有门禁全绿才
  自动合并；堆叠 PR 链配有 rebase 助手；冲突分析会标出每个 hunk 的类别并可
  应用解决方案。破坏性步骤需要 `confirm: true`，其余先试运行。
- **发布。** Conventional Commits 发布规划、semver 校验、changelog 草稿、
  tag、release、带日志根因分析的 CI 运行检查，以及包注册表（npm、PyPI、
  OCI、generic）和可直接粘贴的客户端配置。
- **运营项目。** 健康报告、每日分诊摘要、值班快照、定时只读检查、分支保护、
  deploy key、安全审计，以及可离线重放的 webhook。
- **在仓库所在处工作。** 用于隔离分支的 Git 工作树、UI 中的提交图，以及让
  issue 和代码保持同步的 issue → 分支 → 工作树 → PR 流程。

<div align="center">

<img src="assets/screenshots/git-sidebar-drawer.jpg" alt="Git 侧栏：仓库链接、分支、同步状态、变更与最近提交" width="420">

*Git 侧栏 —— 仓库链接、分支、同步状态、变更与最近提交。*

</div>

## 环境要求

- DeepSeek Harness `0.2.x` —— `0.2.0` 和 `0.2.1` 两条预发布线都在包的 peer
  范围内。
- Node.js 20 或更新版本。
- DSH 能执行的 `pnpm` —— Plugin Manager 会调用它来安装 profile。
- DSH 主机上有 `git`（用 tarball 兜底安装则不需要）。
- 一个可从 DSH 主机通过 HTTPS 访问的 Gitea 或 Forgejo 实例，以及对应的
  API token。

## 安装

在 DSH 主机上执行一条命令，整个安装就完成了：

```bash
dsh plugin --profile web add dsh-gitea
```

`web` 是 profile 名；如果你用 `--profile <name>` 启动 DSH，换成自己的即可。
包已发布到公共 npm registry：
[`dsh-gitea`](https://www.npmjs.com/package/dsh-gitea)。

该命令会把 `dsh-gitea` 加入 profile 并选中它的 bundle —— 包声明了
`dsh.bundle`，所以插件行无需单独的 Plugin Manager 步骤就会启用。没有需要
bootstrap 的 checkout，也**不需要** `npm run dev:link`：那个脚本只用于工作
副本的 `link:` 安装。

DSH 会自行应用新的 profile —— 在 web profile 中 HMR 会监听 bundle 列表；
没有 HMR 的 profile 需要重启 DSH 服务。之后刷新浏览器标签页。

### 直接从仓库安装

滚动 `master`：

```bash
dsh plugin --profile web add https://git.pvlb.dev/dsh-plugins/dsh-gitea.git
```

固定到某个 release tag：

```bash
dsh plugin --profile web add https://git.pvlb.dev/dsh-plugins/dsh-gitea.git#v0.8.4
```

`.git` 后缀才会让 pnpm 把这个 URL 当作 git 仓库。没有它，URL 会被当作
tarball 拉取，安装会以 `ERR_PNPM_TARBALL_HTTP_STATUS … 404` 失败。

### 兜底方案 —— Forgejo registry tarball

当 DSH 主机既够不到 npmjs、也够不到 git 远端时，用这个：

```bash
dsh plugin --profile web add https://git.pvlb.dev/api/packages/dsh-plugins/npm/dsh-gitea/-/0.8.4/dsh-gitea-0.8.4.tgz
```

无论哪种方式，包都是自包含的 —— `lib/index.js` 加 `cordis.patch.yml` ——
其 DSH peer 来自 profile。

## 配置

只有两项设置重要，其余保持默认即可。

1. **实例 URL。** 打开 **设置 → Gitea** —— 或 **Plugins → dsh-gitea →
   Configure** —— 设置 `baseUrl`，例如 `https://git.example.com`。
2. **Token。** 在 Forgejo/Gitea 中打开 **Settings → Applications → Generate
   token**，勾选 repository、issue 和 pull-request 范围（`read:user` 覆盖
   `gitea_whoami`）。然后把密钥存进 DSH 凭据，名称用表单期望的名字 ——
   默认是 `GITEA_TOKEN`，除非你改过 `tokenEnv`。

   凭据存储是隐藏文件 `~/.dsh/.credentials.yaml`；顶层是 `version: 1`，
   然后是 `records:` 和 `refs:`。在 `refs:` 下加入名称：

   ```yaml
   refs:
     GITEA_TOKEN: <刚生成的 token>
   ```

   如果文件已存在，把这一行合并进它的 `refs:` 块，其余不要动。新文件需要
   `version: 1` 后接上面的块。其他 DSH 密钥编辑器写的是同一个存储，所以
   这个文件只是“没有别的工具管理这个名字”时的直接路径。

设置表单只接受凭据**名称**，绝不接受 token —— 形似 token 的值会被拒绝。
DSH 的凭据存储会在文件变化时重新加载，并在每次调用时解析密钥，因此新增或
轮换 token 会在下一次工具调用时生效，无需重启。

可选：设置 `defaultOwner` 和 `defaultRepo`，让省略 `owner`/`repo` 的工具
回退到你常用的仓库。

### 工具面 —— 减小请求载荷

每个已注册工具的 schema 都会绑定进每一次请求，所以插件提供了预设开关。
**默认是 `dispatcher`**（自 0.8.9 起）：两个元工具让全部 96 个操作保持可达，
而常驻载荷约 9 KB 而非约 64 KB。想把这 96 个工具当作一等函数调用时，在配置
或设置下拉框里选 `preset: full`；如果某个工作区只提 issue 或只评审 PR，可以
再收窄。

```yaml
- id: dsh-gitea
  config:
    preset: dispatcher  # dispatcher（默认）| core | issues | prs | repos | ops | full | none | custom
    tools: []           # glob 允许列表；非空时取代预设
    excludeTools: []    # 在预设/允许列表之后移除的模式
    legacyAliases: false
```

| 预设 | 工具数 | 载荷字节 | ≈ Token 数 |
|:--|--:|--:|--:|
| `dispatcher`（默认） | 2 | 9,253 | ~2.5k |
| `full` | 96 | 65,722 | ~17.7k |
| `core` | 15 | 12,087 | ~3.3k |
| `issues` | 22 | 16,041 | ~4.3k |
| `prs` | 27 | 17,480 | ~4.7k |
| `repos` | 17 | 12,134 | ~3.3k |
| `ops` | 30 | 20,067 | ~5.4k |
| `none` | 0 | 0 | 0 |
| `full` + `legacyAliases` | 133 | 107,936 | ~29k |

- `core` 是 15 个高频工具；领域预设互不重叠，并集即 `full`。`*` 是唯一的
  通配符，匹配不到任何工具的模式会在设置表单和日志中报告，而不是被静默忽略。
- `legacyAliases`（自 0.8.5 起默认**关闭**）会重新公开 37 个 0.8 之前的别名。
  它们重复了对应的规范 schema，因此要付出约 42 KB 的载荷；即使没有被公开，
  调用别名仍然可用。
- 保存不同的工具面会立即重新注册工具（无需重启）。`preset: none` 用于不应
  让 agent 看到 Gitea 工具的工作区。
- `dispatcher` 在 0.8.6–0.8.8 是可选预设，**自 0.8.9 起成为默认**。两个元
  工具，`gitea { operation, args }` 和 `gitea_help { operation }`（以工具结果
  返回某个操作的 JSON Schema）。注册表是**稳定**的 —— 不做动态注册 —— 因此
  请求前缀可缓存，同时每个操作仍然可达；`preset: full` 一行即可换回类型化
  工具面。目录里的名字是**操作，不是工具**：描述里写明了这一点并给出调用
  形态，因为直接调用 `gitea_issue_list` 只会在 harness 层失败（#67）。已经
  保存过预设的配置会保留自己的值，所以这个默认值只影响从未选择过预设的安装。
  代价是实测的，不是理论值：在五个真实分诊任务上（2026-10），每一步花费
  41.1k token 而非 58.2k（−29%），但 agent 需要多 30% 的步骤（help 往返和
  参数名重试），所以**总**量只低约 8%，按成本加权（缓存命中 ≈ 0.26× 新请求）
  大致持平。短任务上预计打平，超过约 10 步才有小幅收益；它**不是**魔法省
  token 工具（#51）。未知参数会以清晰错误返回并列出可接受的参数，所以重试
  很便宜。

## 验证

- **设置 → Gitea** 存在并列出字段；**Plugins** 里 `dsh-gitea` 带一个
  **Configure** 页面。`plugin_manager action=list_bundles` 会显示该行以及是否
  启用。
- 让 agent 运行 **`gitea_whoami`**。它返回 token 背后的 Forgejo 用户，一次
  调用就证明了 `baseUrl`、凭据和 token 范围都正确。
- 在 git 工作区打开一个会话：会话头部会出现 **Git 徽标**。

## 故障排查

| 现象 | 原因 | 修复 |
|:--|:--|:--|
| 添加时报 `ERR_PNPM_TARBALL_HTTP_STATUS … 404` 或 JSON 解析错误 | URL 没有 `.git`，pnpm 把它当 tarball 拉取了 | 补上 `.git`，或改用上面的 tarball URL |
| 报 `spawn pnpm ENOENT` 或 `dsh: pnpm was not found` | DSH 服务的 `PATH` 里没有 `pnpm` | 在 profile 补丁里指定 —— `plugin-manager.pnpmCommand: /opt/node/bin/pnpm`（换成你的绝对路径）—— 然后重试 |
| 该行报 `failed to import` 或 `Cannot find package '@deepseek-ai/schemastery'` | 工作副本的 `link:` 安装没有解析 peer；git 或 tarball 安装不会这样 | 在该 checkout 里运行 `npm run dev:link`，然后把 bundle 关掉再打开 |
| 设置里没有 **Gitea** 条目 | bundle 没被选中，或浏览器还在跑旧的客户端 bundle | 检查 `plugin_manager action=list_bundles`，硬刷新（`Ctrl+F5`），profile 没有 HMR 时重启 DSH |
| 表单显示了凭据名称，工具却返回 `401`/`403` | 该凭据不存在，或 token 缺少范围 | 用与 `tokenEnv` 完全相同的名称在 `refs:` 下创建；用 repository、issue、pull-request 范围重新生成 token |
| 通过 LAN/Tailscale 主机名访问 Gitea 页面返回 `403` | 0.8 之前的构建，请求守卫回退到仅回环 | 升级到 0.8.1 或更新版本，然后重载 Host 端 |

## 工具集

**96 个一等工具**（`full` 预设全部公开；默认的 `dispatcher` 预设通过两个元工具
也能触达全部 96 个）外加自 0.8.5 起需显式开启的 **37 个兼容别名**。仓库级工具
接受可选的 `owner`/`repo`（回退顺序：
`defaultOwner`/`defaultRepo`，然后是会话的 git origin），每个工具还接受
`instance` 选择器以支持多实例。破坏性工具需要 `confirm: true`，风险较高的
助手先试运行，因此 agent 在写入前可以先预览：不会误合并、误删或误推送。
37 个别名是旧的单动作名称（`gitea_ci_status`、`gitea_label_list`、
`gitea_release_create` 等）；每个都映射到一个规范工具加一个默认动作，所以
现有 prompt 和脚本继续可用。

| 领域 | 工具数 | 覆盖内容 |
|:--|--:|:--|
| 规划：issue、标签、里程碑 | 22 | 提交、分诊、模板、查重、批量操作、issue → PR |
| 评审与合并 | 27 | PR、带建议的行内评审、合并门禁、rebase、堆叠、冲突 |
| 仓库与历史 | 11 | 分支、tag、文件正文、提交、比较、搜索、镜像状态 |
| 运维与治理 | 17 | 健康度、分诊摘要、定时检查、分支保护、webhook、组织、wiki、用户 |
| 本地 git 与工作树 | 7 | 工作树、提交图、操作卡片 |
| 发布 | 12 | release、semver 与 changelog、CI 运行与日志分析、包、同步、事故 |

### 计划：issue、标签与里程碑 —— 22 个工具

*完整的规划工具面：提交、分诊，让 backlog 保持诚实。*

- **`gitea_issue_list`** —— 按状态列 issue，分页显式，并支持该端点的 `sort`
  枚举（默认 `latest`，还有 `recentupdate`、`mostcomment`、`nearduedate` 等）；
  没有静默的行数上限。
- **`gitea_issue_get`** —— 单个 issue，可选带评论。
- **`gitea_issue_create`** —— 一次调用设置标题、正文、标签（名称或数字 id）、
  assignee 和里程碑。
- **`gitea_issue_update`** —— 修改标题、正文或状态。
- **`gitea_issue_close`** —— 一步关闭 issue。
- **`gitea_issue_comment`** —— 添加评论。
- **`gitea_issue_comments`** —— 列出评论，每条标记 `mine: true/false`。
- **`gitea_issue_comment_delete`** —— 删除自己的评论；除非
  `confirm: true`，否则试运行。
- **`gitea_issue_search`** —— 实例级搜索，可按仓库、状态、类型或标签过滤。
- **`gitea_issue_set_assignee`** —— 把 issue 交给某个 login。
- **`gitea_issue_timeline`** —— 按时间顺序列出评论、事件和状态变更。
- **`gitea_issue_lint`** —— 预检 problem、impact、priority、DoD、boundaries、
  dependencies 和 verification 段落；仅作建议。
- **`gitea_issue_duplicates`** —— 提交前按标题/正文相似度排序可能的重复项。
- **`gitea_batch_issue_ops`** —— 批量设置多个 issue 的标签、assignee 或
  里程碑；除非确认，否则试运行。
- **`gitea_issue_templates`** —— 列出并校验 Gitea YAML issue 表单（插件自带
  一套；也可以指向其他目录）。
- **`gitea_issue_flow`** —— 为一个 issue 规划分支名和工作树路径，或从 head
  分支打开 PR。
- **`gitea_issue_to_pr`** —— 执行 issue → 分支 → 工作树 → PR 周期，工作树
  创建和 PR 创建由 flag 控制。
- **`gitea_labels`** —— 列出、创建、删除、在 issue 上设置或添加；列表会显示
  其他操作需要的数字 id。
- **`gitea_label_bootstrap`** —— 幂等同步 pvlb.dev 内部标签集（或旧的
  “upstream” 分类）；除非应用，否则试运行，且从不删除外部标签。
- **`gitea_label_auto`** —— 预览 issue 标签所隐含的工作流动作；只读。
- **`gitea_milestones`** —— 列出、创建、更新和删除里程碑，包括截止日期；
  创建/更新以文字回答（`Milestone #4 "0.9.0" created (open)`），列表每个
  里程碑一行。
- **`gitea_reactions`** —— 列出、添加或删除 issue 与评论上的 emoji reaction。

### 评审与合并：Pull Request、评审与门禁 —— 27 个工具

*从“这个 PR 做了什么”到合并、rebase 后的分支 —— 带着自主 agent 所需的安全
护栏。*

- **`gitea_pr_list`** —— open、closed 或全部 PR。
- **`gitea_pr_get`** —— 按编号取一个 PR，包含合并状态。
- **`gitea_pr_create`** —— 从 head 到 base 打开 PR。
- **`gitea_pr_comment`** —— 在 PR 上发会话评论。
- **`gitea_pr_diff`** —— unified diff，或文件级 `+/-` 统计。
- **`gitea_pr_files`** —— 变更文件列表，支持分页。
- **`gitea_pr_line_comment`** —— 行内 diff 评论，可选建议块，一键提交。
- **`gitea_pr_reviews`** —— PR 的评审历史。
- **`gitea_pr_submit_review`** —— 提交 `APPROVED`、`REQUEST_CHANGES` 或
  `COMMENT`。
- **`gitea_pr_review`** —— 混合规则评审：区域、测试、迁移、合并状态、结论和
  待解决问题；只读。
- **`gitea_ai_review`** —— 对 diff 的自动检查（密钥、路径穿越、
  conventional commits），给出结构化发现，可选发到 PR。
- **`gitea_review_inbox`** —— 分诊：待我评审、我的待评审、可合并。
- **`gitea_review_escalate`** —— 找出等待超过 N 天无人评审的高优先级 PR，
  可选催评审人；默认试运行。
- **`gitea_suggest_reviewers`** —— 基于 `CODEOWNERS` 和 git 贡献者历史推荐
  评审人。
- **`gitea_pr_merge_status`** —— 这个 PR 现在可合并吗？
- **`gitea_merge_readiness`** —— 清单门禁：描述、冲突、批准、测试、迁移；
  它从不合并。
- **`gitea_pr_summary`** —— 单个 PR 的变更与风险摘要。
- **`gitea_pr_impact`** —— 影响地图：文件、区域、正确溯源的 issue 引用、
  作者、状态。
- **`gitea_auto_merge`** —— 只有整个门禁全绿才合并；需要
  `confirm: true`。
- **`gitea_pr_merge`** —— merge、rebase 或 squash；需要 `confirm: true`。
- **`gitea_pr_rebase`** —— 把 PR 分支 rebase 到最新的 `main`；默认试运行。
- **`gitea_pr_stack_status`** —— 堆叠 PR 依赖链和 rebase 就绪状态。
- **`gitea_pr_stack_rebase`** —— 父 PR 合并后，把堆叠子 PR rebase 到更新后的
  基线。
- **`gitea_conflict_analyze`** —— 三方冲突分析，对每个 hunk 分类（imports、
  依赖、格式化、注释、语义）并建议解决方案。
- **`gitea_pr_conflict_resolve`** —— 应用逐文件解决方案并提交；默认试运行
  预览。
- **`gitea_pr_template_check`** —— 对照模板段落检查 PR 正文，以及风险清单
  是否适用。
- **`gitea_pr_policy`** —— 读取并校验 `.gitea/pr-policy.yml`，可选对照变更
  文件列表。

### 仓库与历史：分支、tag、文件、搜索 —— 11 个工具

*agent 在改代码之前需要看代码的一切。*

- **`gitea_branches`** —— 列出、创建和删除分支。
- **`gitea_tags`** —— 列出、创建和删除 tag。
- **`gitea_repo_contents`** —— 解码后的文件正文（上限 20 KB，附下载链接）或
  目录列表；空路径列出根目录。
- **`gitea_repo_commits`** —— 分支或 SHA 的提交，支持分页。
- **`gitea_repo_compare`** —— 比较 `base...head`。
- **`gitea_repo_search`** —— 在实例上搜索仓库。
- **`gitea_code_search`** —— 在工作区执行真正的 `git grep`，因为 Gitea REST
  API 没有服务端代码搜索。
- **`gitea_repo_bootstrap`** —— 从安全模板搭建仓库（README、gitignore、CI、
  issue/PR 模板）；默认试运行。
- **`gitea_repo_analytics`** —— open/closed issue 数、PR 指标和平均周期时间；
  只读。
- **`gitea_mirror_public`** —— 公开镜像计划（清理历史、推送步骤）；只读，
  从不推送。
- **`gitea_mirror_sync_status`** —— 镜像延迟和同步状态，或用 `confirm: true`
  触发同步。

### 运维与治理 —— 17 个工具

*让项目保持健康，而不只是当前分支。*

- **`gitea_project_health`** —— open PR、open 与停滞 issue、停滞分支、API
  错误。
- **`gitea_triage_digest`** —— 每日摘要，附一个优先动作。
- **`gitea_duty_report`** —— 值班快照，包括自 `lastCheckAt` 以来新增的 PR。
- **`gitea_scheduled_checks`** —— 注册、列出并运行周期性只读检查（健康、
  分诊、收件箱），附最近运行历史。
- **`gitea_branch_protection_get`** —— 当前生效的保护规则。
- **`gitea_branch_protection_set`** —— 要求评审/批准、阻止 force push、要求
  状态检查；需要 `confirm: true`。
- **`gitea_security_audit`** —— 一份只读报告汇总保护状态、force-push 策略和
  评审要求。
- **`gitea_deploy_keys`** —— 列出、添加和删除仓库 deploy key；需要
  `confirm: true`。
- **`gitea_webhooks`** —— 列出、创建和删除仓库 webhook（JSON、form 或
  multipart 载荷，可选事件）。
- **`gitea_webhook_sandbox`** —— 检查缓冲的入站 webhook、重放事件，或清空
  缓冲而不触碰 forge。
- **`gitea_org`** —— 组织仓库、成员和团队，以及创建私有仓库。
- **`gitea_wiki`** —— 列出、读取、创建、更新和删除 wiki 页面。`get` 返回
  元数据**和 markdown 正文**（Forgejo 以 base64 放在 `content_base64` 中，
  handler 会解码并把正文限制在 2 万字符以内），所以读取不再需要 clone 仓库。
- **`gitea_notifications`** —— 已认证用户的通知列表。
- **`gitea_notifications_mark_read`** —— 标记已读；需要 `confirm: true`。
- **`gitea_user_search`** —— 在实例上查找用户。
- **`gitea_whoami`** —— 配置的凭据属于哪个用户。
- **`gitea_flavor`** —— Gitea 还是 Forgejo，从 `/version` 检测，并报告关键
  功能差异。

### 本地 git 与工作树 —— 7 个工具

*连接对话工作目录与 forge 的桥梁。*

- **`gitea_worktree_list`** —— 工作副本的工作树。
- **`gitea_worktree_add`** —— 为已有或新分支创建工作树（写操作使用配置的
  git wrapper）。
- **`gitea_worktree_use`** —— 把会话的 git 头部固定到某个工作树。
- **`gitea_worktree_remove`** —— 删除工作树；需要 `confirm: true`。
- **`gitea_worktree_gc`** —— 找出已合并或废弃的工作树并清理已确认的；在你
  传入 `prune` 并确认前只试运行。
- **`gitea_git_graph`** —— 带泳道、分支/tag ref 和每提交可选 CI 状态的拓扑
  提交图。
- **`gitea_action_card`** —— 为 issue、PR 或分支生成 Generative-UI 操作
  卡片，按钮通过插件的 Hub 端点分发。

### 发布：release、CI 与包 —— 12 个工具

*切出发布，然后证明它干净地发出去了。*

- **`gitea_releases`** —— 列出、创建、更新和删除 release，外加 release-plan
  和 release-notes 动作。
- **`gitea_release_plan`** —— Conventional Commits 历史 → SemVer bump 和
  结构化 changelog 草稿。
- **`gitea_release_assistant`** —— 校验 semver、预览 notes，或运行发布前
  检查。
- **`gitea_ci`** —— CI 运行、单次运行、其 job、job 日志、重跑，以及
  explain 动作；重跑需要 `confirm: true`。
- **`gitea_ci_logs_analyze`** —— 从失败运行、job 或原始日志文本中提取根因行
  和修复建议。
- **`gitea_packages_list`** —— 已发布包（npm、PyPI、OCI/Docker、generic），
  可按 owner、仓库或搜索词过滤。
- **`gitea_package_get`** —— 单个包的版本和元数据。
- **`gitea_package_delete`** —— 删除版本；需要 `confirm: true`。
- **`gitea_package_config`** —— 可直接粘贴的客户端片段（`.npmrc`、
  `pip.conf`、`docker login`）。
- **`gitea_task_tracker_sync`** —— 与 DSH Task-Tracker 看板
  （`dsh-drives.task-provision.v1`）导出、转换和同步 issue 卡片。
- **`gitea_memory_brain_sync`** —— 把 release、已合并 PR 和决策索引为
  Memory Brain fact。
- **`gitea_incident_report`** —— 把崩溃日志或告警转成基于 `incident.yaml`
  的、已清理的事故 issue；可试运行预览。

## 工具之外

**真正会持久化的设置页。** **设置 → Gitea** 是一等页面，同一个表单也能从
**Plugins → bundle 行 → Configure** 打开。它覆盖连接、凭据*名称*、默认值、
超时、代理 URL 重写、webhook 密钥、推送通知、后台调度、DoD 提醒、额外实例
和更新开关。表单由 `GET`/`POST /dsh-gitea/config` 支撑，会报告自己是否可写
（而不是在远程页面上直接消失），并且只接受凭据引用 —— 绝不接受 token。

**就在你眼前工作的 Git 徽标。** 会话头部显示分支、脏标记、ahead/behind 计数、
打开的 PR 编号、检查失败时的 `CI✗`，以及镜像延迟警告。一键打开一个带四个
标签页的抽屉：**Status**、**Graph & CI**（带每提交 CI 状态的提交图）、
**Events & PRs**（实时事件流和 PR 上下文）和 **Hub**。抽屉头部以
**Gitea 或 Forgejo 图标加仓库名组成的一个链接**开头，指向仓库网页 —— URL 来自
checkout 的 `origin` remote，图标（Forgejo、Gitea 或隐藏）是一个设置项。

**Webhook 进来，事件出去。** 把 Gitea/Forgejo webhook 指向
`POST /dsh-gitea/webhook`，载荷会用 `webhookSecretEnv` 指定的凭据做
HMAC-SHA256 校验 —— 没有密钥就返回 401，而不是处理载荷。被接受的事件进入
最近 50 条的内存环形缓冲，可在 `GET /dsh-gitea/events` 读取，并通过
`GET /dsh-gitea/sse` 以 SSE 流式送到浏览器。可选的 `notifyWebhook` 会把
新 PR 和 CI 失败告警转发到外部渠道。

**给 UI 按钮用的 Hub。** `GET /dsh-gitea/hub` 为抽屉聚合 issue、PR、CI runner
和工作树；`POST /dsh-gitea/hub` 分发 UI 和操作卡片使用的动作：批准、合并、
关闭、打开/切换工作树、清理工作树、CI 日志分析、堆叠 PR 检查和冲突解决。
它的每个分支都和其他路由一样位于 Host/Origin/Connection 围栏之后。

**随包发布的 issue 模板。** 开箱自带七个 Gitea YAML issue 表单（bug、
feature、tech-debt、security、incident、research、config-change），模板工具会
在你发布前校验表单仍具备 Gitea 需要的字段。仓库 bootstrap 工具会把同一套
模板种进新仓库。

**评审与交接流程。** 一个 issue 可以被规划成分支和工作树，变成 PR 草稿，再
交回评审收件箱。PR 评审是基于规则且只读的，除非你要求评论；AI 评审只在被
要求时才发帖。

**后台分诊，默认关闭。** 启用调度器后，它会按间隔运行分诊摘要、发到可选的
webhook，并做一次试运行的工作树垃圾回收检查 —— 不会删除任何东西。DoD 提醒
（同样默认关闭）会在某次工具运行修改了 git 文件却没有引用 issue 或 PR 时，
追加一条不阻塞操作的提示。

**其他插件可以组合的服务。** `dshGitea` 实现
`dsh-drives.task-provision.v1` 契约（`isConfigured()`、`createIssue()`、按
`externalRef` 幂等、过程中解析标签名），因此任务看板可以创建 Gitea issue。
`giteaEvents` 是 webhook 事件的分发器（`subscribe`、`on('event')`、`emit`、
`subscriberCount`），第二个插件无需轮询就能对 forge 活动做出反应。

## 默认即安全

- **token 从不存放在插件里。** 表单和配置只保存凭据*名称*；DSH 在调用时
  解析密钥。形似 token 的值会被拒绝，任何机密都不会写进仓库或日志。
- **每条自定义路由都有围栏。** `lib/http-guard.js` 在挂载了 DSH Connection
  时委托给它（未认证的远程客户端 401，被拒绝的 origin 403），否则回退到
  仅回环、默认拒绝。
- **Webhook 是认证过的。** `POST /dsh-gitea/webhook` 校验 HMAC-SHA256 签名；
  缺少密钥时返回 401，而不是处理载荷。
- **有风险的写操作有门禁。** 破坏性工具需要 `confirm: true`（风险较高的助手
  先试运行），一键更新器需要同时满足带 `x-dsh-plugin-update` 的回环请求和
  `updates` 开关。
- **可发布树会被扫描。** `npm run test:leaks` 会在交付的 JS 中出现私有路径、
  私有 scope、token 字面量或西里尔字母时让构建失败。

## 基于上游

`dsh-gitea` 是
[`GooDAnDReaDY/dsh-gitea`](https://github.com/GooDAnDReaDY/dsh-gitea)（MIT）的
fork，从上游 `abfd952` 分叉，在 pvlb.dev forge 上维护。我们把它跑在自己的
DeepSeek Harness 部署上，并带上它需要的修复和部署粘合代码。

**上游是观察对象，不是开发目标。** 它的公开 GitHub 树由作者的私有源码仓库
生成 —— 每个提交都是 `chore(publish): sanitized tree from <sha>` —— 所以针对
生成文件（比如 `lib/client.js`）的 PR 可能在下次 publish 时被丢弃。我们只在
上游改动确实重要时有意同步，保持补丁集尽量小，并在合适时把改进以最小、可
移植的补丁发回上游（`lib/http-guard.js` 是最干净的候选）。

本 fork 在上游之上新增的内容：

| 变更 | 原因 |
|:--|:--|
| `settings.section` 注册（**设置 → Gitea**） | 上游的 `settings.plugin.item` 座位在 DSH 0.2.x 中被移除，无法渲染 |
| 由路由支撑的设置表单（`GET`/`POST /dsh-gitea/config`），带 `writable` 和 Retry | 浏览器的 `configForms` 镜像在非回环页面上只有内存状态，会隐藏所有字段 |
| `lib/http-guard.js`：挂载的 DSH Connection 围栏对读和写都具权威性 | 被放行的 Tailscale/LAN 请求会落到仅回环的兜底逻辑，变成 `403` |
| `scripts/dev-link-dsh.mjs`（`npm run dev:link`） | pnpm 的 `link:` 安装不会解析插件的 DSH peer |
| `updates` Config 开关 + 指向 Forgejo npm registry 的更新器 | 更新器安装的是**我们**发布的包，不是上游的；开关保护 `link:` 开发 checkout |
| `test/` 回归套件 + `scripts/leak-scan.mjs` | 上游公开树带了 `npm test` 脚本却没有测试文件 |
| `.forgejo/workflows/ci.yml` + `publish.yml` | 每次 push 到 `master` 都检查；打 tag 的发布进我们自己的 npm registry |
| 无 scope 的 `dsh-gitea` 包名、版本 tag、本 README + `AGENTS.md` | 这个 fork 是维护中的项目，不是匿名快照 |

fork 中携带的工具修复：输出格式化（行截断、裸 `OK`、标签 id）、wiki CRUD 与
repo-contents 解码、PR/合并语义、覆盖工具面的 #19–#38 QA 清扫，以及 #44 的
更新器符号链接修复（`0.8.1`）。

## 开发

```bash
npm run dev:link    # node scripts/dev-link-dsh.mjs
```

`plugin_manager` 会把本地 checkout 安装成 pnpm 的 `link:` 依赖，而 pnpm 不会
从目标目录解析被链接包的 peer。脚本会定位正在运行的 DSH 安装（参数、
`$DSH_PACKAGE_DIR` 或 `dsh` 可执行文件），并把本插件 import 的包符号链接进
gitignore 的 `node_modules/`；它从不写入 DSH 安装。registry 或 git 安装完全
不需要这一步。

改动之后，重载你动过的那一端：

- **Host 端**（`lib/index.js`、路由、handler）：把 bundle 关掉再打开
  （`plugin_manager action=set_bundle`），或者在 **profile** 补丁里让
  checkout 启用 HMR（`<profile>/cordis.patch.yml`，在本仓库之外）：

  ```yaml
  - id: hmr
    config:
      root: ["/path/to/dsh-gitea"]
  ```

  有了这个 root，Host 端的修改无需重启 `dsh web` 就会重载。
- **客户端**（`lib/client.js`）：bundle 按请求提供，所以硬刷新
  （`Ctrl+F5`）即可。

检查 —— `npm run check` 是 CI 门禁，也是每次 push 前要跑的东西：

```bash
npm run check        # npm test && test:leaks && node --check lib/client.js + lib/index.js
npm test             # node --test test/*.test.mjs
npm run test:leaks   # 可发布树卫生：私有路径/scope/token 字面量/西里尔字母
```

两个注意事项：

- `lib/client.js` 是生成产物 —— 一个单独的
  `window.__ModuleLoader__.load({ id, factory })` 浏览器 bundle，不是源码。
  对它的修改是有意的源码补丁；上游会用私有 TypeScript 重新生成该文件，所以
  同步时预计那里会有合并冲突（它是我们最大的 diff），并重新应用我们的代码块。
- 这里没有浏览器自动化。绿色的 `npm run check` 只证明语法和注册，不证明
  人类看到的效果；UI 改动仍需要在 Web UI 里人工检查（设置条目、字段、保存
  持久化、Git 徽标）。

## CI、发布与版本管理

`.forgejo/workflows/` 里有四个 Forgejo Actions 工作流：

| 工作流 | 触发 | 作用 |
|:--|:--|:--|
| `ci.yml` | push 到 `master`、手动触发 | Node 22.6 → `npm run check`，然后 `npm pack --dry-run` |
| `publish.yml` | tag `v*`（手动 = 试运行） | 重跑检查，要求 tag 等于 `v<package.json version>`，发布到 Forgejo registry，跳过已发布的版本 |
| `publish-npmjs.yml` | tag `v*`（手动 = 仅检查） | 同样的检查和 tag 守卫，然后 `npm stage publish` 到公共 npm registry；`NPMJS_TOKEN` 密钥缺失时跳过 |
| `release.yml` | tag `v*`（手动 = notes 预览） | 为 tag 创建 Forgejo release 页面：名称和 notes 来自 `CHANGELOG.md`，外加 npm tarball 作为可下载资产；从不重写已有 release |

- release 页面是生成的，不是手写的：`scripts/release-notes.mjs` 把
  `## [<version>]` changelog 段落变成标题
  （`v0.8.4 — Publish to npmjs through staged publishing`）和正文，并追加
  该确切版本的安装命令。工作流使用自动的 Actions token（`RELEASE_TOKEN`
  密钥可覆盖它），并保持已有 release 不动，所以在 UI 里编辑过的 notes 在
  之后重跑时仍然保留。同一页面带着 tarball：
  `.../releases/download/v<version>/dsh-gitea-<version>.tgz`。

- 注册表：Forgejo 的是
  `https://git.pvlb.dev/api/packages/dsh-plugins/npm/`（密钥 `NPM_TOKEN`，
  带 `write:package` scope 的 Forgejo token）；npmjs 是默认 registry
  （密钥 `NPMJS_TOKEN`，带 *read and write (stage only)* 的 granular
  token）。空的 `NPM_TOKEN` 会让 Forgejo 任务失败；空的 `NPMJS_TOKEN` 只会
  跳过公共发布。
- `package.json` 是公开的（`publishConfig.access: public`），所以两个任务
  发布同一个 tarball；`files` 把包限制为 `lib/`、`assets/`、
  `cordis.patch.yml`、`README.md`、`README.zh.md`、`README.ru.md` 和
  `LICENSE`。
- 有意没有 `pull_request` 触发：共享 runner 会把宿主机的 rootless Docker
  socket 给 job 容器，所以只有维护者可控的事件才能执行工作流。
- 只有 push tag 才会发布，而同一个 tag 会发布到两个 registry —— Forgejo
  直接发布，npmjs 以暂存版本的形式发布，由维护者用 2FA 批准
  （`npm stage approve <stage-id>`，或 npmjs.com 上的包页面）。
  `npm publish` 会被 stage-only token 拒绝。

发布仪式：

```bash
# 更新 package.json + CHANGELOG.md，提交
git push origin master
git tag -a v0.8.4 -m "dsh-gitea 0.8.4"
git push origin v0.8.4        # 触发 publish.yml、publish-npmjs.yml 和 release.yml

# npmjs 走暂存发布：用 2FA 批准暂存版本
# （或在 npmjs.com 的包页面点击 Approve）
npm stage approve <stage-id>
```

版本管理：

- 当前 fork 版本 `0.8.9`，tag `v0.8.9`；更早的构建使用
  `<upstream base>-dsh.<n>`（例如 `0.7.40-dsh.7`），hotfix 可以使用
  `0.8.9-dsh.<n>`。服务器上每个生效状态都要打 tag。
- 回滚：`git checkout v0.8.9`，把 bundle 关掉再打开，硬刷新。
- `CHANGELOG.md` 每个 release 加一条 fork 条目；上游条目保持不动。
- 让 `peerDependencies` 中的 DSH 范围跟上 Harness 预发布线（当前包含
  `>=0.1.7-rc.2 <0.2.0-0`、`>=0.2.0-rc.1 <0.3.0-0` 和
  `>=0.2.1-0 <0.3.0-0`）—— 范围没有命中的线会让插件在 Harness 升级后
  静默不加载。

更新器：

- UI 内更新器从 Forgejo registry 读取 `dist-tags.latest`（Forgejo 17 没有
  npmjs 风格的 `/latest`），通过一个临时 `.npmrc` 安装确切版本的 tarball
  （不改默认 registry），并且是双重门禁：带 `x-dsh-plugin-update` 头的
  仅回环请求，加上 `updates` Config 开关。本 profile 对 `link:` checkout 保持
  `updates: false`；启用它会让下一次更新用已发布的包替换那个 checkout。
- **绝不要把 Forgejo registry 设为默认 npm registry。** 否则 pnpm 会去那里
  查找 profile 的其他包（`dsh-cost-meter` 等）并 404。保持 npmjs 为默认，
  并用显式 tarball URL 安装本包。

## 仓库结构

| 路径 | 作用 |
|:--|:--|
| `lib/index.js` | Host 入口：Config schema、设置集成、工具注册、服务、路由接线 |
| `lib/client.js` | 生成的 web bundle：设置页、Git 徽标/抽屉、操作卡片、事件面板、locale |
| `lib/routes.js`、`lib/routes-hub.js` | HTTP 端点（`/config`、`/events`、`/git-*`、`/sse`、`/hub`、`/release-assistant`、webhook）和 Hub 分发器 |
| `lib/http-guard.js` | 路由认证/CSRF 围栏：优先 DSH Connection，兜底仅回环 |
| `lib/gitea-client.js` | Gitea REST 客户端（缓存、ETag、重试、超时） |
| `lib/plugin-updater.js` | 一键更新器：Forgejo packument、无 scope tarball 安装、`updates` 开关 |
| `lib/handlers*`、`lib/tool-defs*` | 工具实现、面向模型的 schema、格式化器 |
| `.forgejo/workflows/` | `ci.yml`（push 检查）、`publish.yml`（tag → Forgejo registry）和 `publish-npmjs.yml`（tag → npmjs） |
| `scripts/` | `dev-link-dsh.mjs`（`link:` bootstrap）和 `leak-scan.mjs`（卫生门禁） |
| `test/*.test.mjs` | 本 fork 的回归套件（`npm test`） |
| `assets/illustrations/` | README 头图（`whale-forge.jpg`）；出处见其 README |
| `assets/screenshots/` | README 里的 Git 侧栏截图（#63） |
| `README.zh.md` | 本 README 的中文翻译，三个语言版本的头部互相链接 |
| `README.ru.md` | 本 README 的俄语翻译，三个语言版本的头部互相链接 |
| `AGENTS.md` | 深度运维笔记：DSH 座位矩阵、设置契约、安装/重载 runbook、故障表 |

## 许可证

MIT —— 原始作品 © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)；见
[LICENSE](LICENSE)。Fork 修改在本仓库中维护。

*本文件是 [README.md](README.md) 的中文翻译；如有出入，以英文版为准。*
