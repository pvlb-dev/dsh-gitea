window.__ModuleLoader__.load({
  id: '@goodandready/dsh-gitea',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const NS = 'dsh-gitea'
    // Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>',
    // row id as cordis.patch.yml declares it.
    const PKG = '@goodandready/dsh-gitea'
    const ROW_ID = 'dsh-gitea'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID
    const css =
      '.dgt-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}' +
      '.dgt-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}' +
      '.dgt-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.dgt-sub{color:var(--dsw-alias-label-secondary);font-size:13px}' +
      '.dgt-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}' +
      '.dgt-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}' +
      '.dgt-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;box-sizing:border-box;width:100%}' +
      '.dgt-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}' +
      '.dgt-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}' +
      '.dgt-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
      '.dgt-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
      '.dgt-chevron{color:var(--dsw-alias-label-secondary);flex:none;transition:transform .16s}' +
      '.dgt-chevronOpen{transform:rotate(180deg)}' +
      '.dgt-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}' +
      '.dgt-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}' +
      '.dgt-discard{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 14px;font-size:13px;color:var(--dsw-alias-label-secondary);background:transparent}' +
      '.dgt-discard:disabled,.dgt-save:disabled{opacity:.4;cursor:default}' +
      '.dgt-fieldHead{align-items:center;gap:8px;display:flex}' +
      '.dgt-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}' +
      '.dgt-hint{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.5}' +
      '.dgt-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}' +
      '.dgt-badgeOn{color:var(--dsw-alias-state-success-primary)}' +
      '.dgt-git-wrap{position:relative;display:flex;align-items:center}' +
      '.dgt-git-chip{font-size:11px;line-height:1;padding:4px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dgt-git-dirty{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary)}' +
      '.dgt-git-muted{color:var(--dsw-alias-label-secondary)}' +
      '.dgt-git-panel{position:absolute;top:calc(100% + 8px);right:0;z-index:40;width:min(360px,78vw);max-height:min(420px,60vh);overflow:auto;padding:12px 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-bg-mask, black) 18%, transparent)}' +
      '.dgt-git-kicker{margin:0 0 8px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary)}' +
      '.dgt-git-empty{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary)}' +
      '.dgt-git-repo{font-size:13px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}' +
      '.dgt-git-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:4px 0 10px}' +
      '.dgt-git-branch{min-width:0;font-size:12px;color:var(--dsw-alias-label-primary)}' +
      '.dgt-git-state{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}' +
      '.dgt-git-stateDirty{color:var(--dsw-alias-state-warning-primary)}' +
      '.dgt-git-h{font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary);margin:10px 0 4px}' +
      '.dgt-git-pre{font-size:11px;line-height:1.4;white-space:pre-wrap;word-break:break-word;margin:0;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}' +
      '.dgt-git-badge{font-size:10px;line-height:1;padding:1px 5px;border-radius:4px;font-weight:600;margin-left:4px;display:inline-block}' +
      '.dgt-git-ahead{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent);color:var(--dsw-alias-state-success-primary)}' +
      '.dgt-git-behind{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 15%, transparent);color:var(--dsw-alias-state-warning-primary)}' +
      '.dgt-btn-graph{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 12px;font-size:12px;font-weight:500;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;width:100%;justify-content:center}' +
      '.dgt-btn-graph:hover{background:var(--dsw-alias-bg-layer-3)}' +
      '.dgt-backdrop{position:fixed;inset:0;z-index:999;background:var(--dsw-alias-mask, color-mix(in srgb, var(--dsw-alias-bg-mask, black) 50%, transparent));backdrop-filter:blur(2px)}' +
      '.dgt-graph-dialog{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;width:min(780px,92vw);max-height:85vh;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 12px 36px color-mix(in srgb, var(--dsw-alias-bg-mask, black) 30%, transparent);overflow:hidden}' +
      '.dgt-graph-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}' +
      '.dgt-graph-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0}' +
      '.dgt-graph-close{appearance:none;background:0 0;border:0;cursor:pointer;font-size:16px;color:var(--dsw-alias-label-secondary);padding:4px 8px;border-radius:6px}' +
      '.dgt-graph-close:hover{color:var(--dsw-alias-label-primary)}' +
      '.dgt-graph-body{overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:4px}' +
      '.dgt-graph-row{display:flex;align-items:baseline;gap:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.4;padding:3px 0}' +
      '.dgt-graph-lanes{flex:none;white-space:pre;letter-spacing:1px;font-size:13px}' +
      '.dgt-graph-node{color:var(--dsw-alias-state-success-primary);font-weight:700}' +
      '.dgt-graph-merge{color:var(--dsw-alias-state-processing-primary, var(--dsw-alias-state-info-primary));font-weight:700}' +
      '.dgt-graph-pass{color:var(--dsw-alias-border-l1)}' +
      '.dgt-graph-gap{color:transparent}' +
      '.dgt-graph-oid{flex:none;color:var(--dsw-alias-label-secondary);text-decoration:none;font-weight:600;font-size:11px}' +
      '.dgt-graph-oid:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}' +
      '.dgt-graph-main{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.dgt-graph-subject{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dgt-graph-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}' +
      '.dgt-graph-ref{padding:0 5px;border-radius:4px;font-size:10px;font-weight:600;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}' +
      '.dgt-graph-refCurrent{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}' +
      '.dgt-graph-ci{font-size:10px;padding:0 4px;border-radius:4px;font-weight:600}' +
      '.dgt-graph-ci-success{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent);color:var(--dsw-alias-state-success-primary)}' +
      '.dgt-graph-ci-failure{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 15%, transparent);color:var(--dsw-alias-state-error-primary)}' +
      '.dgt-graph-ci-pending{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 15%, transparent);color:var(--dsw-alias-state-warning-primary)}' +
      '.dgt-graph-more{appearance:none;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 12px;font-size:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);margin:8px auto;display:block}' +
      '.dgt-sectionTitle{margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:4px}' +
      '.dgt-checkRow{display:flex;align-items:flex-start;gap:10px;padding:8px 0;cursor:pointer}' +
      '.dgt-checkbox{width:16px;height:16px;margin-top:2px;accent-color:var(--dsw-alias-label-primary);cursor:pointer;flex:none}' +
      '.dgt-checkLabelWrap{display:flex;flex-direction:column;gap:2px}' +
      '.dgt-advancedToggle{appearance:none;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:6px;margin:12px 0 4px}' +
      '.dgt-advancedToggle:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}' +
      '.dgt-advancedPanel{border-top:1px dashed var(--dsw-alias-border-l2);margin-top:10px;padding-top:6px}' +
      '.dgt-instanceRow{padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-bottom:6px;font-size:12px;background:var(--dsw-alias-bg-layer-2);display:flex;justify-content:space-between;align-items:center}' +
      '.dgt-graph-more:hover{background:var(--dsw-alias-bg-layer-2)}' +
      '.dgt-badgeOk{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent)}' +
      '.dgt-badgeWarn{border-color:var(--dsw-alias-state-warning-primary);color:var(--dsw-alias-state-warning-primary);background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 8%, transparent)}' +
      '.dgt-badgeBad{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}' +
      '.dgt-badgesRow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px}' +
      '.dgt-drawer-backdrop{position:fixed;inset:0;z-index:998;background:var(--dsw-alias-mask, color-mix(in srgb, var(--dsw-alias-bg-mask, black) 35%, transparent));backdrop-filter:blur(2px);transition:opacity .2s ease}' +
      '.dgt-drawer{position:fixed;top:0;right:0;bottom:0;width:min(440px,94vw);z-index:999;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-8px 0 32px color-mix(in srgb, var(--dsw-alias-bg-mask, black) 22%, transparent);display:flex;flex-direction:column;animation:dgtSlideIn .2s cubic-bezier(0.16,1,0.3,1);box-sizing:border-box}' +
      '@keyframes dgtSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}' +
      '.dgt-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}' +
      '.dgt-drawer-title-wrap{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.dgt-drawer-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.dgt-drawer-branch-badge{font-size:11px;padding:2px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,monospace;display:inline-flex;align-items:center;gap:4px}' +
      '.dgt-drawer-actions{display:flex;align-items:center;gap:6px;flex:none}' +
      '.dgt-drawer-btn{appearance:none;background:transparent;border:1px solid transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:4px 8px;font-size:14px;display:inline-flex;align-items:center;justify-content:center;transition:all .15s}' +
      '.dgt-drawer-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}' +
      '.dgt-drawer-btn-spin{animation:dgtSpin .8s linear infinite}' +
      '@keyframes dgtSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
      '.dgt-drawer-btn-close{font-size:18px;line-height:1;padding:2px 8px}' +
      '.dgt-drawer-tabs{display:flex;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);padding:0 8px}' +
      '.dgt-drawer-tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;cursor:pointer;padding:10px 14px;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:6px;transition:all .15s}' +
      '.dgt-drawer-tab:hover{color:var(--dsw-alias-label-primary)}' +
      '.dgt-drawer-tabActive{color:var(--dsw-alias-state-success-primary);border-bottom-color:var(--dsw-alias-state-success-primary);font-weight:600}' +
      '.dgt-drawer-tab-badge{font-size:10px;padding:1px 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}' +
      '.dgt-drawer-tab-badgeAlert{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary) 18%, transparent);color:var(--dsw-alias-state-warning-primary);font-weight:700}' +
      '.dgt-drawer-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}' +
      '.dgt-drawer-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}' +
      '.dgt-drawer-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}' +
      '.dgt-drawer-dim{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dgt-drawer-val{font-size:12px;color:var(--dsw-alias-label-primary);font-weight:500}' +
      '.dgt-drawer-sec-h{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--dsw-alias-label-tertiary)}' +
      '.dgt-drawer-clean-box{display:flex;align-items:center;gap:8px;padding:10px 0}' +
      '.dgt-drawer-empty{padding:32px 0;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}'

    const cssId = 'dsh-gitea/PluginCard.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-dsh-plugin="' + NS + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = css
      tag.setAttribute('data-plugin', 'dsh-gitea')
      tag.dataset.dshPlugin = NS
      tag.dataset.pluginCss = cssId
      document.head.appendChild(tag)
    }

    function getService(c, name) {
      if (!c) return undefined
      if (typeof c.get === 'function') {
        try { return c.get(name) } catch { /* ignore */ }
      }
      return c[name]
    }

    // Issue 316: Resilient fetch helper with default 15s timeout for all UI calls
    function clientFetch(url, options = {}, timeoutMs = 15000) {
      if (typeof AbortController === 'undefined') {
        return fetch(url, options)
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs)
      const callerSignal = options.signal
      if (callerSignal) {
        if (callerSignal.aborted) {
          clearTimeout(timer)
          return Promise.reject(callerSignal.reason || new Error('Aborted'))
        }
        callerSignal.addEventListener('abort', () => {
          clearTimeout(timer)
          controller.abort(callerSignal.reason)
        }, { once: true })
      }
      return fetch(url, { ...options, signal: controller.signal }).finally(() => {
        clearTimeout(timer)
      })
    }

    const en = {
      title: 'Gitea',
      description: 'Gitea or Forgejo tools and credentials.',
      intro: 'Create a DSH credential, paste the API token there, then type only the credential name below (for example GITEA_TOKEN). Never paste the token into this form.',
      baseUrl: 'Instance URL',
      baseUrlHint: 'e.g. https://gitea.example.com',
      tokenEnv: 'Credential name',
      tokenEnvHint: 'Name of the DSH credential, not the token itself. Default GITEA_TOKEN.',
      tokenOn: 'Token configured',
      tokenOff: 'Token not configured',
      save: 'Save',
      saving: 'Saving\u2026',
      discard: 'Discard',
      unsaved: 'Unsaved',
      saveFailed: 'Save failed',
      loading: 'Loading\u2026',
      settingsUnavailable: 'Could not load the Gitea plugin settings.',
      settingsReadOnly: 'The Host Settings service is not available, so these values cannot be saved.',
      retry: 'Retry',
      expand: 'Expand',
      collapse: 'Collapse',
      sectionInstance: 'Connection & Core Settings',
      sectionDefaults: 'Defaults & Git Worktrees',
      sectionWebhooks: 'Webhooks & Notifications',
      sectionScheduler: 'Background Triage Scheduler',
      sectionInstances: 'Additional Instances',
      toggleAdvanced: 'Advanced settings',
      defaultOwner: 'Default organization or user',
      defaultOwnerHint: 'Fallback repository owner when tool calls omit owner/repo.',
      defaultRepo: 'Default repository',
      defaultRepoHint: 'Fallback repository name when tool calls omit owner/repo.',
      gitWrapper: 'Git wrapper binary',
      gitWrapperHint: 'Command wrapper for git write ops (e.g. git-deepseek-harness). Empty disables worktrees.',
      dodReminder: 'Definition of Done reminder',
      dodReminderHint: 'Remind if a tool changed git files without referencing an issue or PR. Never blocks.',
      forceHttpsUrls: 'Force HTTPS URLs in links',
      forceHttpsUrlsHint: 'Rewrite html_url from http:// to https:// behind reverse proxy.',
      timeoutMs: 'HTTP timeout (ms)',
      timeoutMsHint: 'Request timeout for Gitea API calls in milliseconds (default 30000).',
      webhookSecretEnv: 'Webhook secret credential',
      webhookSecretEnvHint: 'DSH credential holding secret to verify X-Gitea-Signature on POST /dsh-gitea/webhook.',
      notifyWebhook: 'Push notification webhook URL',
      notifyWebhookHint: 'External webhook URL for PR and CI failure alerts. Empty disables push.',
      bgSchedulerEnabled: 'Enable background scheduler',
      bgSchedulerEnabledHint: 'Periodically run triage/health checks and compile digest events.',
      bgSchedulerIntervalMin: 'Scheduler interval (minutes)',
      bgSchedulerIntervalMinHint: 'Interval between background triage checks (default 60).',
      bgSchedulerOwner: 'Scheduler target owner',
      bgSchedulerOwnerHint: 'Owner for background triage (defaults to default owner if empty).',
      bgSchedulerRepo: 'Scheduler target repo',
      bgSchedulerRepoHint: 'Repository for background triage (defaults to default repo if empty).',
      bgSchedulerWebhook: 'Scheduler digest webhook URL',
      bgSchedulerWebhookHint: 'Optional webhook URL to deliver triage digests to external channel.',
      noInstances: 'No additional instances configured. Add them in profile YAML if needed.',
      gitHint: 'Git status for this chat: branch and uncommitted changes.',
      drawerTitle: 'Git Inspector',
      drawerClose: 'Close (Esc)',
      drawerRefresh: 'Refresh',
      tabStatus: 'Status',
      tabGraph: 'Graph & CI',
      tabEvents: 'Events & PRs',
      branch: 'Branch',
      upstream: 'Upstream',
      statusClean: 'Working tree is clean',
      statusDirty: 'Uncommitted changes',
      noChangesDesc: 'No modified or untracked files in the working directory.',
      activePr: 'Active Pull Request',
      viewInGitea: 'View in Gitea',
      recentEvents: 'Recent Events',
      noEvents: 'No webhook events recorded yet.',
      gitEmpty: 'Appears after the agent opens a git folder.',
      gitClean: 'Clean',
      gitDirty: 'Uncommitted changes',
      gitCommits: 'Recent commits',
      gitChanges: 'Changes',
      gitNoCommits: 'No commits yet',
      gitNoChanges: 'No uncommitted changes',
      gitAhead: 'Ahead',
      gitBehind: 'Behind',
      gitSync: 'Sync',
      gitUpToDate: 'Up to date with remote',
      openGraph: 'Commit graph',
      graphTitle: 'Git Commit Graph',
      graphLoading: 'Loading commit graph\u2026',
      graphEmpty: 'No commits found in repository',
      graphLoadMore: 'Load more commits',
      graphClose: 'Close graph',
      justNow: 'just now',
      minutesAgo: 'm ago',
      hoursAgo: 'h ago',
      daysAgo: 'd ago',
      ciPass: 'CI passed',
      ciFail: 'CI failed',
      ciPending: 'CI running',
      prActive: 'Active',
      dirtyChanged: '{count} changed',
      updaterTitle: 'Plugin Auto-Updater',
      updaterDesc: 'Check the pvlb.dev npm registry and install plugin updates in-place.',
      updaterBtnCheck: 'Check for updates',
      updaterChecking: 'Checking...',
      updaterBtnUpdate: 'Update to v{version}',
      updaterUpdating: 'Updating...',
      updaterCurrent: 'Current version: v{version}',
      updaterAvailable: 'Update available: v{version}',
      updaterUpToDate: 'Up to date',
      updaterSuccess: 'Successfully updated to v{version}. Please restart DSH or reload profile.',
      updaterCheckFailed: 'Registry check failed',
      sectionUpdates: 'Plugin Updates',
      updatesEnabled: 'Check for plugin updates',
      updatesEnabledHint: 'One-click updater installs @goodandready/dsh-gitea from the pvlb.dev Forgejo npm registry. Disable it on a link: dev checkout if you do not want the published package to replace it.',
      updaterDisabled: 'Updater disabled (updates: false).',
      tabHub: 'Hub',
      hubAssignedIssues: 'Assigned Issues',
      hubOpenPulls: 'Open Pull Requests',
      hubEmpty: 'No items found in repository',
      hubRefresh: 'Refresh Hub',
      worktreeTitle: 'Worktrees',
      worktreeSwitch: 'Switch',
      worktreeGc: 'Clean Merged',
      actionApprove: 'Approve',
      actionMerge: 'Merge',
      actionClose: 'Close',
      actionOpenWorktree: 'Open Worktree',
      actionAssignMe: 'Assign to Me',
      actionCommit: 'Quick Commit',
      actionPush: 'Push',
      actionStatusDone: 'Done',
      actionStatusError: 'Failed',
      actionViewGitea: 'View in Gitea',
      releaseAssistantTitle: 'Release Assistant',
      releasePreflight: 'Preflight Checks',
      actionExplainCi: 'Explain CI',
      actionRebaseStack: 'Rebase Stack',
      ciExplaining: 'Analyzing CI...',
      ciAnalysisTitle: 'CI Failure Analysis',
      actionResolveConflicts: 'Analyze Conflicts',
      actionAnalyzeConflict: 'Analyze Conflicts',
      badgeConflict: 'Conflict',
      conflictAnalysisTitle: 'Conflict Analysis',
    }
    const zh = {
      title: 'Gitea',
      description: 'Gitea 或 Forgejo 工具与凭据设置。',
      intro: '请在 DSH 凭据中创建并填入 API Token，然后在下方输入凭据名称（例如 GITEA_TOKEN）。切勿将 Token 直接粘贴到此表单中。',
      baseUrl: '实例 URL',
      baseUrlHint: '例如 https://gitea.example.com',
      tokenEnv: '凭据名称',
      tokenEnvHint: 'DSH 凭据名称，而非 Token 本身。默认为 GITEA_TOKEN。',
      tokenOn: '凭据已配置',
      tokenOff: '凭据未配置',
      save: '保存',
      saving: '正在保存\u2026',
      discard: '放弃',
      unsaved: '未保存更改',
      saveFailed: '保存失败',
      loading: '正在加载\u2026',
      settingsUnavailable: '无法加载 Gitea 插件设置。',
      settingsReadOnly: '宿主 Settings 服务不可用，当前值无法保存。',
      retry: '重试',
      expand: '展开',
      collapse: '折叠',
      sectionInstance: '连接与核心设置',
      sectionDefaults: '默认配置与 Git 工作树',
      sectionWebhooks: 'Webhooks 与通知',
      sectionScheduler: '后台分类巡检计划',
      sectionInstances: '附加实例',
      toggleAdvanced: '高级设置',
      defaultOwner: '默认组织或用户',
      defaultOwnerHint: '当工具调用省略 owner/repo 时的后备仓库所有者。',
      defaultRepo: '默认仓库',
      defaultRepoHint: '当工具调用省略 owner/repo 时的后备仓库名称。',
      gitWrapper: 'Git 包装器二进制文件',
      gitWrapperHint: '用于 Git 写入操作的包装脚本（例如 git-deepseek-harness）。留空将禁用工作树管理。',
      dodReminder: '完成定义 (DoD) 提醒',
      dodReminderHint: '如果工具修改了 Git 文件但未引用 Issue 或 PR，则给出提示。不阻塞操作。',
      forceHttpsUrls: '链接强制使用 HTTPS',
      forceHttpsUrlsHint: '在 HTTPS 反向代理背后运行时，将 html_url 中的 http:// 改写为 https://。',
      timeoutMs: 'HTTP 超时时间 (毫秒)',
      timeoutMsHint: '请求 Gitea API 的超时时间（毫秒，默认 30000）。',
      webhookSecretEnv: 'Webhook 密钥凭据',
      webhookSecretEnvHint: '存放用于验证 POST /dsh-gitea/webhook 上 X-Gitea-Signature 的密钥的 DSH 凭据名称。',
      notifyWebhook: '推送通知 Webhook URL',
      notifyWebhookHint: '接收新 PR 及 CI 失败告警的外部 Webhook URL。留空则禁用推送。',
      bgSchedulerEnabled: '启用后台计划任务',
      bgSchedulerEnabledHint: '定期运行健康度/分类检查并汇总事件。',
      bgSchedulerIntervalMin: '巡检时间间隔 (分钟)',
      bgSchedulerIntervalMinHint: '后台分类检查的间隔时间（默认 60 分钟）。',
      bgSchedulerOwner: '巡检目标所有者',
      bgSchedulerOwnerHint: '后台分类的目标所有者（留空则默认使用 defaultOwner）。',
      bgSchedulerRepo: '巡检目标仓库',
      bgSchedulerRepoHint: '后台分类的目标仓库（留空则默认使用 defaultRepo）。',
      bgSchedulerWebhook: '巡检报告 Webhook URL',
      bgSchedulerWebhookHint: '将分类汇总发送至外部频道的 Webhook URL（可选）。',
      noInstances: '未配置其他附加实例。如需要，可在 profile YAML 中添加。',
      gitHint: '当前会话的 Git 状态：分支和未提交更改。',
      drawerTitle: 'Git 检查器',
      drawerClose: '关闭 (Esc)',
      drawerRefresh: '刷新',
      tabStatus: '状态',
      tabGraph: '提交图 & CI',
      tabEvents: '事件 & PR',
      branch: '分支',
      upstream: '上游分支',
      statusClean: '工作区干净',
      statusDirty: '存在未提交更改',
      noChangesDesc: '工作目录中没有修改或未跟踪的文件。',
      activePr: '当前 Pull Request',
      viewInGitea: '在 Gitea 中查看',
      recentEvents: '最近事件',
      noEvents: '暂无 Webhook 事件记录。',
      gitEmpty: 'Agent 打开 Git 文件夹后将在此显示。',
      gitClean: '干净',
      gitDirty: '未提交更改',
      gitCommits: '最近提交',
      gitChanges: '更改',
      gitNoCommits: '暂无提交',
      gitNoChanges: '无未提交更改',
      gitAhead: '领先',
      gitBehind: '落后',
      gitSync: '同步',
      gitUpToDate: '已与远端保持最新',
      openGraph: '提交图',
      graphTitle: 'Git 提交图',
      graphLoading: '正在加载提交图\u2026',
      graphEmpty: '仓库中未找到任何提交',
      graphLoadMore: '加载更多提交',
      graphClose: '关闭提交图',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前',
      ciPass: 'CI 通过',
      ciFail: 'CI 失败',
      ciPending: 'CI 运行中',
      prActive: '进行中',
      dirtyChanged: '{count} 项更改',
      updaterTitle: '插件自动更新',
      updaterDesc: '通过 pvlb.dev npm 仓库在线检查并就地升级插件，无需 SSH 终端操作。',
      updaterBtnCheck: '检查更新',
      updaterChecking: '正在检查...',
      updaterBtnUpdate: '升级至 v{version}',
      updaterUpdating: '正在更新...',
      updaterCurrent: '当前版本: v{version}',
      updaterAvailable: '发现新版本: v{version}',
      updaterUpToDate: '已是最新版本',
      updaterSuccess: '已成功升级至 v{version}。请重启 DSH 或重载配置以应用更新。',
      updaterCheckFailed: '检查更新失败',
      sectionUpdates: '插件更新',
      updatesEnabled: '检查插件更新',
      updatesEnabledHint: '一键更新会从 pvlb.dev Forgejo npm 仓库安装 @goodandready/dsh-gitea；在 link: 开发检出中请关闭，以免被发布包替换。',
      updaterDisabled: '更新器已禁用（updates: false）。',
      tabHub: '中心',
      hubAssignedIssues: '指派的议题',
      hubOpenPulls: '开放的合并请求',
      hubEmpty: '仓库中未找到任何项目',
      hubRefresh: '刷新中心',
      worktreeTitle: '工作树',
      worktreeSwitch: '切换',
      worktreeGc: '清理已合并',
      actionApprove: '批准',
      actionMerge: '合并',
      actionClose: '关闭',
      actionOpenWorktree: '创建工作区',
      actionAssignMe: '指派给我',
      actionCommit: '快速提交',
      actionPush: '推送',
      actionStatusDone: '完成',
      actionStatusError: '失败',
      actionViewGitea: '在 Gitea 中查看',
      releaseAssistantTitle: '发布助手',
      releasePreflight: '预发布检查',
      actionExplainCi: '分析 CI 失败',
      actionRebaseStack: '级联变基',
      ciExplaining: '正在分析 CI...',
      ciAnalysisTitle: 'CI 故障分析',
      actionResolveConflicts: '分析冲突',
      actionAnalyzeConflict: '分析冲突',
      badgeConflict: '冲突',
      conflictAnalysisTitle: '冲突分析',
    }

    function useActiveLocale(ctx) {
      const localeSvc = getService(ctx, 'locale')
      return React.useSyncExternalStore(
        React.useMemo(() => (cb) => (localeSvc && typeof localeSvc.subscribe === 'function' ? localeSvc.subscribe(cb) : () => {}), [localeSvc]),
        React.useCallback(() => {
          if (localeSvc && typeof localeSvc.getSnapshot === 'function') {
            const snap = localeSvc.getSnapshot()
            const active = snap && snap.active
            if (typeof active === 'string' && active) return active
          }
          return typeof navigator !== 'undefined' ? String(navigator.language || '').slice(0, 2) : 'en'
        }, [localeSvc]),
      )
    }

    function makeT(locale) {
      const dict = String(locale || '').startsWith('zh') ? zh : en
      return (key) => dict[key] || en[key] || key
    }

    function sameDraft(a, b) {
      if (!a && !b) return true
      if (!a || !b) return false
      const keys = [
        'baseUrl', 'tokenEnv', 'defaultOwner', 'defaultRepo', 'gitWrapper',
        'dodReminder', 'forceHttpsUrls', 'timeoutMs', 'webhookSecretEnv',
        'notifyWebhook', 'bgSchedulerEnabled', 'bgSchedulerIntervalMin',
        'bgSchedulerOwner', 'bgSchedulerRepo', 'bgSchedulerWebhook', 'updates'
      ]
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (a[k] !== b[k]) return false
      }
      return JSON.stringify(a.instances || []) === JSON.stringify(b.instances || [])
    }

    


    function FallbackChevron() {
      return React.createElement(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': true },
        React.createElement('path', {
          d: 'M3.5 5.25L7 8.75L10.5 5.25',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        })
      )
    }

    let ChevronIcon = null
    try {
      const primitives = typeof require === 'function' ? require('@deepseek-ai/dsh-client-ui-primitives') : null
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch {
      ChevronIcon = null
    }
    const Chevron = ChevronIcon || FallbackChevron

    function createErrorBoundary() {
      if (!React || typeof React.Component !== 'function') {
        return function NoopBoundary(props) { return props?.children || null }
      }
      return class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props)
          this.state = { hasError: false, error: null }
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error }
        }
        componentDidCatch(error, errorInfo) {
          console.error('[dsh-gitea] React Error:', error, errorInfo)
        }
        render() {
          if (this.state.hasError) {
            return React.createElement(
              'div',
              {
                className: 'dgt-failed',
                style: { margin: '12px 0', padding: '12px', border: '1px solid var(--dsw-alias-state-error-primary)', borderRadius: '8px' },
              },
              React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, 'Gitea UI Error:'),
              React.createElement('div', { style: { fontSize: '12px', wordBreak: 'break-all' } }, String(this.state.error?.message || this.state.error)),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'dgt-discard',
                  style: { marginTop: '10px', fontSize: '12px', padding: '4px 10px' },
                  onClick: () => this.setState({ hasError: false, error: null }),
                },
                'Retry'
              )
            )
          }
          return this.props?.children || null
        }
      }
    }
    const ErrorBoundary = createErrorBoundary()

    function valueField(id, label, hint, value, onEdit) {
      return React.createElement('div', { className: 'dgt-field' },
        React.createElement('div', { className: 'dgt-fieldHead' },
          React.createElement('label', { className: 'dgt-label', htmlFor: id }, label),
        ),
        React.createElement('input', {
          id,
          className: 'dgt-input',
          type: 'text',
          value: value == null ? '' : value,
          onChange: (e) => onEdit(e.target.value),
        }),
        hint ? React.createElement('p', { className: 'dgt-hint' }, hint) : null,
      )
    }

    function checkboxField(id, label, hint, checked, onToggle) {
      return React.createElement('label', { className: 'dgt-checkRow', htmlFor: id },
        React.createElement('input', {
          id,
          className: 'dgt-checkbox',
          type: 'checkbox',
          checked: !!checked,
          onChange: (e) => onToggle(e.target.checked),
        }),
        React.createElement('span', { className: 'dgt-checkLabelWrap' },
          React.createElement('span', { className: 'dgt-label' }, label),
          hint ? React.createElement('span', { className: 'dgt-hint' }, hint) : null,
        ),
      )
    }

    function numberField(id, label, hint, value, onEdit, min, max) {
      return React.createElement('div', { className: 'dgt-field' },
        React.createElement('div', { className: 'dgt-fieldHead' },
          React.createElement('label', { className: 'dgt-label', htmlFor: id }, label),
        ),
        React.createElement('input', {
          id,
          className: 'dgt-input',
          type: 'number',
          min,
          max,
          value: value == null ? '' : value,
          onChange: (e) => {
            const val = e.target.value === '' ? '' : Number(e.target.value)
            onEdit(val)
          },
        }),
        hint ? React.createElement('p', { className: 'dgt-hint' }, hint) : null,
      )
    }

    // The settings form owns its transport: it reads and writes the Host route
    // /dsh-gitea/config (which persists through the Settings service). It must
    // not gate on the browser `configForms` mirror: that mirror reports
    // `unavailable` on non-loopback pages (remote DSH sessions keep preferences
    // process-local), which used to replace every field with one unavailable
    // message on a LAN/Tailscale URL.
    function GiteaSettingsForm(props) {
      const t = props.t
      const onDirty = props.onDirty
      const ctx = props.ctx
      const [saved, setSaved] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [tokenConfigured, setTokenConfigured] = React.useState(false)
      const [tokenEnvError, setTokenEnvError] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [showAdvanced, setShowAdvanced] = React.useState(false)
      const [status, setStatus] = React.useState('loading')
      const [writable, setWritable] = React.useState(true)
      const [loadKey, setLoadKey] = React.useState(0)
      const [updateState, setUpdateState] = React.useState({
        checking: false,
        updating: false,
        currentVersion: '',
        latestVersion: undefined,
        updateAvailable: false,
        notice: null,
        error: null,
      })

      const checkUpdates = async () => {
        setUpdateState((prev) => ({ ...prev, checking: true, error: null, notice: null }))
        try {
          const res = await clientFetch('/api/dsh-gitea/update', { cache: 'no-store' })
          const data = await res.json()
          if (data && data.currentVersion) {
            setUpdateState((prev) => ({
              ...prev,
              checking: false,
              currentVersion: data.currentVersion,
              latestVersion: data.latestVersion,
              updateAvailable: Boolean(data.updateAvailable),
              error: data.latestCheckFailed ? (t('updaterCheckFailed') || 'Registry check failed') : null,
            }))
          } else {
            setUpdateState((prev) => ({ ...prev, checking: false, error: data.error || 'Check failed' }))
          }
        } catch (err) {
          setUpdateState((prev) => ({ ...prev, checking: false, error: String(err?.message || err) }))
        }
      }

      const runUpdate = async () => {
        setUpdateState((prev) => ({ ...prev, updating: true, error: null, notice: null }))
        try {
          const res = await clientFetch('/api/dsh-gitea/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-dsh-plugin-update': '1' },
          })
          const data = await res.json()
          if (data && data.updated) {
            setUpdateState((prev) => ({
              ...prev,
              updating: false,
              updateAvailable: false,
              currentVersion: data.updatedVersion || data.latestVersion,
              notice: (t('updaterSuccess') || 'Successfully updated to v{version}. Restart DSH to apply.').replace('{version}', data.updatedVersion || data.latestVersion),
            }))
          } else {
            setUpdateState((prev) => ({
              ...prev,
              updating: false,
              error: data.error || data.message || 'Update failed',
            }))
          }
        } catch (err) {
          setUpdateState((prev) => ({ ...prev, updating: false, error: String(err?.message || err) }))
        }
      }

      // The registry check runs after the config load, and only when the
      // off-switch allows it: a disabled updater must never be contacted.
      const maybeCheckUpdates = (cfg) => {
        if (cfg && cfg.updates !== false) checkUpdates()
      }

      const applyPayload = (data) => {
        const cfg = (data && data.config) || {}
        const next = {
          baseUrl: cfg.baseUrl || '',
          tokenEnv: cfg.tokenEnv || '',
          defaultOwner: cfg.defaultOwner || '',
          defaultRepo: cfg.defaultRepo || '',
          gitWrapper: cfg.gitWrapper || '',
          dodReminder: !!cfg.dodReminder,
          forceHttpsUrls: !!cfg.forceHttpsUrls,
          timeoutMs: typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : 30000,
          webhookSecretEnv: cfg.webhookSecretEnv || '',
          notifyWebhook: cfg.notifyWebhook || '',
          bgSchedulerEnabled: !!cfg.bgSchedulerEnabled,
          bgSchedulerIntervalMin: typeof cfg.bgSchedulerIntervalMin === 'number' ? cfg.bgSchedulerIntervalMin : 60,
          bgSchedulerOwner: cfg.bgSchedulerOwner || '',
          bgSchedulerRepo: cfg.bgSchedulerRepo || '',
          bgSchedulerWebhook: cfg.bgSchedulerWebhook || '',
          updates: cfg.updates !== false,
          instances: Array.isArray(cfg.instances) ? cfg.instances : [],
        }
        setSaved(next)
        setDraft(next)
        setTokenConfigured(!!(data && data.tokenConfigured))
        setTokenEnvError((data && data.tokenEnvError) || '')
        // The Host answers `writable: false` when its Settings service cannot
        // persist; the form still renders read-only values instead of vanishing.
        setWritable(!data || data.writable !== false)
      }

      React.useEffect(() => {
        let alive = true
        setStatus('loading')
        clientFetch('/dsh-gitea/config', { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status)
            return res.json()
          })
          .then((data) => {
            if (!alive) return
            applyPayload(data)
            setErr('')
            setStatus('ready')
            maybeCheckUpdates(data && data.config)
          })
          .catch((e) => {
            if (!alive) return
            setErr(String(e && e.message ? e.message : e))
            setStatus('unavailable')
          })
        return () => { alive = false }
      }, [loadKey])

      const setField = (key, value) => setDraft((d) => Object.assign({}, d || {}, { [key]: value }))
      const dirty = !!(draft && saved && !sameDraft(draft, saved))
      React.useEffect(() => { if (typeof onDirty === 'function') onDirty(dirty) }, [dirty, onDirty])
      const blocked = !dirty || saving || !draft || !writable || status !== 'ready'

      const save = async () => {
        if (!draft || blocked) return
        setErr('')
        setSaving(true)
        try {
          const payload = Object.assign({}, draft)
          if (payload.timeoutMs === '' || isNaN(Number(payload.timeoutMs))) payload.timeoutMs = 30000
          else payload.timeoutMs = Number(payload.timeoutMs)
          if (payload.bgSchedulerIntervalMin === '' || isNaN(Number(payload.bgSchedulerIntervalMin))) payload.bgSchedulerIntervalMin = 60
          else payload.bgSchedulerIntervalMin = Number(payload.bgSchedulerIntervalMin)

          // One transactional write: the Host merges and validates the whole
          // section, persists it through its Settings service, and answers the
          // saved values. Per-field configForms writes here would duplicate it.
          const res = await clientFetch('/dsh-gitea/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status))
          applyPayload(data)
          // Only start the registry check when this save turned updates on.
          if (saved && saved.updates === false && data && data.config && data.config.updates !== false) {
            checkUpdates()
          }
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        } finally {
          setSaving(false)
        }
      }

      if (status === 'loading') {
        return React.createElement('p', { className: 'dgt-hint' }, t('loading'))
      }

      if (status === 'unavailable') {
        return React.createElement('div', null,
          React.createElement('p', { className: 'dgt-failed' }, t('settingsUnavailable')),
          err ? React.createElement('p', { className: 'dgt-hint' }, err) : null,
          React.createElement('button', {
            type: 'button',
            className: 'dgt-discard',
            style: { marginTop: '10px' },
            onClick: () => setLoadKey((value) => value + 1),
          }, t('retry')),
        )
      }

      return React.createElement(React.Fragment, null,
        !writable ? React.createElement('p', { className: 'dgt-failed' }, t('settingsReadOnly')) : null,
        React.createElement('p', { className: 'dgt-hint' }, t('intro')),

        // Core Connection
        valueField('plugin-config-dsh-gitea-url', t('baseUrl'), t('baseUrlHint'), draft.baseUrl, (v) => setField('baseUrl', v)),
        valueField('plugin-config-dsh-gitea-token-env', t('tokenEnv'), t('tokenEnvHint'), draft.tokenEnv, (v) => setField('tokenEnv', v)),
        React.createElement('div', { className: 'dgt-badgesRow' },
          React.createElement('span', { className: 'dgt-badge ' + (tokenConfigured ? 'dgt-badgeOk' : 'dgt-badgeBad') },
            tokenConfigured ? t('tokenOn') : t('tokenOff')),
          draft.baseUrl
            ? React.createElement('span', { className: 'dgt-badge dgt-badgeOk' }, t('badgeOnline'))
            : React.createElement('span', { className: 'dgt-badge dgt-badgeWarn' }, t('badgeOffline')),
        ),
        tokenEnvError ? React.createElement('p', { className: 'dgt-failed' }, tokenEnvError) : null,
        typeof location !== 'undefined' && location.protocol === 'https:' && /^http:\/\//i.test(draft.baseUrl || '')
          ? React.createElement('p', { className: 'dgt-failed' }, 'Gitea endpoint is HTTP, but DSH is HTTPS — embedded Gitea pages will be blocked (mixed content). Use an HTTPS Gitea endpoint / reverse proxy.')
          : null,

        // Core Defaults
        valueField('plugin-config-dsh-gitea-default-owner', t('defaultOwner'), t('defaultOwnerHint'), draft.defaultOwner, (v) => setField('defaultOwner', v)),
        valueField('plugin-config-dsh-gitea-default-repo', t('defaultRepo'), t('defaultRepoHint'), draft.defaultRepo, (v) => setField('defaultRepo', v)),

        // Plugin maintenance: fork off-switch for the npm auto-updater. The
        // updater installs the upstream tarball and would replace a link:ed
        // checkout, so a fork must be able to hide and disable it.
        React.createElement('div', { className: 'dgt-sectionTitle' }, t('sectionUpdates')),
        checkboxField('plugin-config-dsh-gitea-updates', t('updatesEnabled'), t('updatesEnabledHint'), draft.updates !== false, (v) => setField('updates', v)),
        draft.updates === false ? React.createElement('p', { className: 'dgt-hint' }, t('updaterDisabled')) : null,

        // Advanced toggle
        React.createElement('div', null,
          React.createElement('button', {
            type: 'button',
            className: 'dgt-advancedToggle',
            onClick: () => setShowAdvanced((v) => !v),
          },
            React.createElement('span', null, showAdvanced ? '▾ ' : '▸ '),
            t('toggleAdvanced'),
          ),
        ),

        // Advanced panel
        showAdvanced ? React.createElement('div', { className: 'dgt-advancedPanel' },
          // Defaults & Git
          React.createElement('div', { className: 'dgt-sectionTitle' }, t('sectionDefaults')),
          valueField('plugin-config-dsh-gitea-git-wrapper', t('gitWrapper'), t('gitWrapperHint'), draft.gitWrapper, (v) => setField('gitWrapper', v)),
          checkboxField('plugin-config-dsh-gitea-dod-reminder', t('dodReminder'), t('dodReminderHint'), draft.dodReminder, (v) => setField('dodReminder', v)),
          checkboxField('plugin-config-dsh-gitea-force-https', t('forceHttpsUrls'), t('forceHttpsUrlsHint'), draft.forceHttpsUrls, (v) => setField('forceHttpsUrls', v)),
          numberField('plugin-config-dsh-gitea-timeout', t('timeoutMs'), t('timeoutMsHint'), draft.timeoutMs, (v) => setField('timeoutMs', v), 1000, 300000),

          // Webhooks & Notifications
          React.createElement('div', { className: 'dgt-sectionTitle' }, t('sectionWebhooks')),
          valueField('plugin-config-dsh-gitea-webhook-secret-env', t('webhookSecretEnv'), t('webhookSecretEnvHint'), draft.webhookSecretEnv, (v) => setField('webhookSecretEnv', v)),
          valueField('plugin-config-dsh-gitea-notify-webhook', t('notifyWebhook'), t('notifyWebhookHint'), draft.notifyWebhook, (v) => setField('notifyWebhook', v)),

          // Background Scheduler
          React.createElement('div', { className: 'dgt-sectionTitle' }, t('sectionScheduler')),
          checkboxField('plugin-config-dsh-gitea-bg-scheduler', t('bgSchedulerEnabled'), t('bgSchedulerEnabledHint'), draft.bgSchedulerEnabled, (v) => setField('bgSchedulerEnabled', v)),
          draft.bgSchedulerEnabled ? React.createElement(React.Fragment, null,
            numberField('plugin-config-dsh-gitea-bg-interval', t('bgSchedulerIntervalMin'), t('bgSchedulerIntervalMinHint'), draft.bgSchedulerIntervalMin, (v) => setField('bgSchedulerIntervalMin', v), 1, 1440),
            valueField('plugin-config-dsh-gitea-bg-owner', t('bgSchedulerOwner'), t('bgSchedulerOwnerHint'), draft.bgSchedulerOwner, (v) => setField('bgSchedulerOwner', v)),
            valueField('plugin-config-dsh-gitea-bg-repo', t('bgSchedulerRepo'), t('bgSchedulerRepoHint'), draft.bgSchedulerRepo, (v) => setField('bgSchedulerRepo', v)),
            valueField('plugin-config-dsh-gitea-bg-webhook', t('bgSchedulerWebhook'), t('bgSchedulerWebhookHint'), draft.bgSchedulerWebhook, (v) => setField('bgSchedulerWebhook', v)),
          ) : null,

          // Instances
          React.createElement('div', { className: 'dgt-sectionTitle' }, t('sectionInstances')),
          Array.isArray(draft.instances) && draft.instances.length > 0
            ? React.createElement('div', null,
                draft.instances.map((inst, idx) =>
                  React.createElement('div', { key: idx, className: 'dgt-instanceRow' },
                    React.createElement('strong', null, inst.name || 'Unnamed'),
                    React.createElement('span', null, String(inst.baseUrl || '') + ' (' + String(inst.tokenEnv || 'no token') + ')'),
                  ),
                ),
              )
            : React.createElement('p', { className: 'dgt-hint' }, t('noInstances')),
        ) : null,

        // Auto-Updater section (hidden when the off-switch is off)
        draft.updates !== false ? React.createElement('div', {
          className: 'dgt-field',
          style: {
            background: 'var(--dsw-alias-bg-layer-2, color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent))',
            border: '1px solid var(--dsw-alias-border-l2, color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent))',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '14px',
          },
        },
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
          },
            React.createElement('span', { style: { fontWeight: '600', fontSize: '13px' } }, '✨ ' + t('updaterTitle')),
            React.createElement('div', { style: { display: 'flex', gap: '8px' } },
              React.createElement('button', {
                type: 'button',
                className: 'dgt-discard',
                style: { padding: '3px 8px', fontSize: '11px', height: 'auto', minHeight: 'unset' },
                disabled: updateState.checking || updateState.updating,
                onClick: checkUpdates,
              }, updateState.checking ? t('updaterChecking') : t('updaterBtnCheck')),
              updateState.updateAvailable ? React.createElement('button', {
                type: 'button',
                className: 'dgt-save',
                style: { padding: '3px 10px', fontSize: '11px', height: 'auto', minHeight: 'unset' },
                disabled: updateState.updating,
                onClick: runUpdate,
              }, updateState.updating ? t('updaterUpdating') : (t('updaterBtnUpdate') || 'Update to v{version}').replace('{version}', updateState.latestVersion)) : null,
            ),
          ),
          React.createElement('div', {
            style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '6px' },
          }, t('updaterDesc')),
          React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' },
          },
            updateState.currentVersion ? React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)' } },
              (t('updaterCurrent') || 'Current version: v{version}').replace('{version}', updateState.currentVersion),
            ) : null,
            updateState.checking ? React.createElement('span', { className: 'dgt-pending' }, t('updaterChecking')) :
            updateState.updateAvailable ? React.createElement('span', { className: 'dgt-failed' }, (t('updaterAvailable') || 'Update available: v{version}').replace('{version}', updateState.latestVersion)) :
            updateState.currentVersion && !updateState.error ? React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, '✓ ' + t('updaterUpToDate')) : null,
          ),
          updateState.notice ? React.createElement('div', {
            style: { marginTop: '6px', color: 'var(--dsw-alias-state-success-primary)', fontSize: '12px' },
          }, updateState.notice) : null,
          updateState.error ? React.createElement('div', {
            style: { marginTop: '6px', color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px' },
          }, updateState.error) : null,
        ) : null,

        // Footer
        React.createElement('div', { className: 'dgt-foot' },
          err ? React.createElement('p', { className: 'dgt-failed', role: 'status' }, err || t('saveFailed')) : null,
          React.createElement('button', {
            type: 'button',
            className: 'dgt-discard',
            disabled: !dirty || saving,
            onClick: () => { setDraft(saved); setErr('') },
          }, t('discard')),
          React.createElement('button', {
            type: 'button',
            className: 'dgt-save',
            disabled: blocked,
            onClick: save,
          }, t(saving ? 'saving' : 'save')),
        ),
        React.createElement(EventsPanel, { t }),
      )
    }

    function EventsPanel(props) {
      const t = typeof props.t === 'function' ? props.t : makeT(props.locale)
      const [events, setEvents] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        let id = null
        const load = () => {
          if (typeof document !== 'undefined' && document.hidden) return
          clientFetch('/dsh-gitea/events', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => { if (alive) setEvents(data && data.data ? data.data : []) })
            .catch(() => { if (alive) setEvents([]) })
        }
        load()
        id = setInterval(load, 5000)

        const onVisibilityChange = () => {
          if (typeof document !== 'undefined' && !document.hidden && alive) {
            load()
          }
        }
        // Issue-255 & Issue-324: SSE streaming with clean connection lifecycle
        let es = null
        if (typeof EventSource !== 'undefined') {
          try {
            es = new EventSource('/dsh-gitea/sse')
            es.addEventListener('gitea-event', (ev) => {
              if (!alive) return
              try {
                const data = JSON.parse(ev.data)
                if (data) {
                  setEvents((prev) => [data, ...(Array.isArray(prev) ? prev : [])].slice(0, 50))
                }
              } catch { /* ignore parse error */ }
            })
            es.onerror = () => {
              if (es) { es.close(); es = null }
            }
          } catch { /* ignore EventSource failure */ }
        }

        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', onVisibilityChange)
        }
        return () => {
          alive = false
          if (id) clearInterval(id)
          if (es) { es.close(); es = null }
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('visibilitychange', onVisibilityChange)
          }
        }
      }, [])
      const rows = Array.isArray(events) ? events : []
      const locOrigin = typeof location !== 'undefined' ? location.origin : ''
      return React.createElement('div', { className: 'dgt-field' },
        React.createElement('div', { className: 'dgt-fieldHead' },
          React.createElement('span', { className: 'dgt-label' }, t('eventsTitle')),
        ),
        rows.length === 0
          ? React.createElement('p', { className: 'dgt-hint' }, t('eventsEmptyHint', { url: locOrigin }))
          : React.createElement('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
              rows.slice(0, 10).map((ev, i) =>
                React.createElement('li', { key: i, style: { fontSize: 12, lineHeight: 1.6, padding: '4px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' } },
                  (ev.type === 'pull_request' ? 'PR ' : (ev.type || '') + ' ') + (ev.number != null ? '#' + ev.number : '') + ' ' + (ev.title || '') + ' — ' + (ev.action || ev.conclusion || '') + ' (' + String(ev.at || '').slice(0, 16).replace('T', ' ') + ')',
                ),
              ),
            ),
      )
    }

    function GiteaPluginCard(props) {
      const page = !!(props && props.view === 'page')
      const [open, setOpen] = React.useState(!!page)
      const [dirty, setDirty] = React.useState(false)
      const t = typeof props.t === 'function' ? props.t : makeT(props.locale)
      const title = t('title')
      // Row seat (plugins.row.config): the host page draws the title, icon, crumb and
      // padding itself, so the summary is a one-liner and the page renders the form
      // without our card chrome.
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dgt-sub' }, t('description'))
      }
      return React.createElement(page ? 'div' : 'li', { className: page ? 'dgt-page' : 'dgt-card' + (open ? ' dgt-cardOpen' : '') },
        React.createElement('button', {
          type: 'button',
          className: 'dgt-head',
          style: page ? { display: 'none' } : undefined,
          'aria-expanded': open,
          'aria-label': (open ? t('collapse') : t('expand')) + ': ' + title,
          onClick: () => setOpen((value) => !value),
        },
          React.createElement('span', { className: 'dgt-headText' },
            React.createElement('span', { className: 'dgt-title' }, title),
            React.createElement('span', { className: 'dgt-sub' }, t('description')),
          ),
          dirty ? React.createElement('span', { className: 'dgt-pending' }, t('unsaved')) : null,
          React.createElement('span', { className: 'dgt-chevron' + (open ? ' dgt-chevronOpen' : '') }, '\u25be'),
        ),
        React.createElement('div', {
          className: 'dgt-body',
          hidden: !open,
          style: open ? undefined : { display: 'none' },
        }, React.createElement(GiteaSettingsForm, { t, ctx: props.ctx, onDirty: setDirty })),
      )
    }

    // `settings.section` (DSH 0.2.x): renders as a first-class page inside the
    // Settings panel. The shell draws the nav label, so this only contributes the
    // page body.
    function GiteaSettingsSection(props) {
      const t = typeof props.t === 'function' ? props.t : makeT(props.locale)
      return React.createElement(ErrorBoundary, null,
        React.createElement('div', { className: 'dgt-page' },
          React.createElement(GiteaSettingsForm, { t, ctx: props.ctx }),
        ),
      )
    }

    function workspaceCwdFrom(session, workspaces) {
      const items = (workspaces && workspaces.items) || []
      const sessionId = session && (session.sessionId || session.id)
      const workspaceId = session && session.workspaceId
      let ws = null
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (workspaceId && (item.workspaceId === workspaceId || item.id === workspaceId)) { ws = item; break }
        if (sessionId && item.sessionIds && item.sessionIds.indexOf(sessionId) >= 0) { ws = item; break }
      }
      return (ws && (ws.path || ws.cwd)) || ''
    }

    function chipSessionId(props, session) {
      return String((props && props.sessionId) || (session && (session.sessionId || session.id)) || '').trim()
    }

    function glyphChar(glyph) {
      switch (glyph) {
        case 'node': return '\u25cf'
        case 'merge': return '\u25c6'
        case 'pass': return '\u2502'
        case 'gap': return ' '
        default: return ' '
      }
    }

    function formatRelativeTime(epochSeconds, t) {
      if (!epochSeconds || typeof epochSeconds !== 'number' || Number.isNaN(epochSeconds)) return ''
      const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - epochSeconds)
      if (elapsed < 60) return t('justNow')
      if (elapsed < 3600) return Math.floor(elapsed / 60) + ' ' + t('minutesAgo')
      if (elapsed < 86400) return Math.floor(elapsed / 3600) + ' ' + t('hoursAgo')
      if (elapsed < 30 * 86400) return Math.floor(elapsed / 86400) + ' ' + t('daysAgo')
      const date = new Date(epochSeconds * 1000)
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function resolveEventEpochSeconds(ev) {
      const raw = ev?.at != null ? ev.at : (ev?.timestamp != null ? ev.timestamp : null)
      if (raw == null) return Math.floor(Date.now() / 1000)
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) return Math.floor(Date.now() / 1000)
        return raw > 1e11 ? Math.floor(raw / 1000) : Math.floor(raw)
      }
      const parsed = new Date(raw).getTime()
      if (!Number.isFinite(parsed) || parsed <= 0) return Math.floor(Date.now() / 1000)
      return Math.floor(parsed / 1000)
    }

    function GiteaActionCard(props) {
      const {
        type = 'issue',
        number,
        title,
        state = 'open',
        labels = [],
        assignee,
        ci_status,
        ciStatus,
        ciFailed,
        ci_step,
        reviews,
        dirty,
        dirtyFiles,
        branch,
        ahead,
        behind,
        onAction,
        t = (k) => k,
        cwd,
        sessionId,
        owner,
        repo,
      } = props

      const [curState, setCurState] = React.useState(state)
      const [loadingAct, setLoadingAct] = React.useState(null)
      const [feedback, setFeedback] = React.useState(null)
      const [assignedUser, setAssignedUser] = React.useState(assignee)

      const isPR = type === 'pr' || type === 'pull'
      const isBranch = type === 'branch' || type === 'git'
      const isIssue = type === 'issue'

      const postAction = (act, extra = {}) => {
        if (typeof onAction === 'function') {
          onAction(act, Object.assign({}, props, extra))
          return
        }
        setLoadingAct(act)
        setFeedback(null)
        const payload = Object.assign({
          action: act,
          number,
          type: isPR ? 'pr' : (isBranch ? 'branch' : 'issue'),
          owner,
          repo,
          cwd,
          sessionId,
          branch,
        }, extra)

        clientFetch('/dsh-gitea/hub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((r) => r.json())
          .then((res) => {
            setLoadingAct(null)
            if (res?.ok) {
              setFeedback({ ok: true, text: t('actionStatusDone') || 'Done' })
              if (act === 'close') setCurState('closed')
              if (act === 'merge') setCurState('merged')
              if (act === 'assign-me' && res.data?.assignee) setAssignedUser(res.data.assignee)
            } else {
              setFeedback({ ok: false, text: res?.error || t('actionStatusError') || 'Failed' })
            }
          })
          .catch((err) => {
            setLoadingAct(null)
            setFeedback({ ok: false, text: String(err?.message || err) })
          })
      }

      if (isBranch) {
        return React.createElement('div', { className: 'dgt-event-card' },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('span', { style: { fontWeight: 600, fontSize: 13 } }, '🌿 ' + (branch || 'main')),
            React.createElement('span', {
              className: 'dgt-drawer-tab-badge' + (dirty ? ' dgt-drawer-tab-badgeAlert' : ''),
            }, dirty ? ((dirtyFiles || 1) + ' modified') : 'clean')
          ),
          (ahead > 0 || behind > 0) ? React.createElement('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } }, '↑' + ahead + ' ↓' + behind) : null,
          feedback ? React.createElement('div', { style: { fontSize: 11, marginTop: 6, color: feedback.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } }, feedback.text) : null,
          React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
            React.createElement('button', {
              type: 'button',
              className: 'dgt-btn dgt-btn-ghost',
              style: { fontSize: 11, padding: '2px 8px' },
              disabled: loadingAct !== null,
              onClick: () => postAction('branch-commit'),
            }, loadingAct === 'branch-commit' ? '…' : t('actionCommit')),
            React.createElement('button', {
              type: 'button',
              className: 'dgt-btn dgt-btn-ghost',
              style: { fontSize: 11, padding: '2px 8px' },
              disabled: loadingAct !== null,
              onClick: () => postAction('branch-push'),
            }, loadingAct === 'branch-push' ? '…' : t('actionPush'))
          )
        )
      }

      const effectiveCi = ci_status || ciStatus || (ciFailed ? 'failure' : null)
      const isCiFail = effectiveCi === 'failure' || effectiveCi === 'error'
      const isCiPass = effectiveCi === 'success' || effectiveCi === 'passing'

      return React.createElement('div', { className: 'dgt-event-card' },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          React.createElement('span', { style: { fontWeight: 600, fontSize: 13 } }, (isPR ? 'PR #' : 'Issue #') + number + ' ' + (title || '')),
          React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
            isPR && isCiFail ? React.createElement('span', {
              className: 'dgt-drawer-tab-badge',
              style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
            }, t('ciFail') || 'CI Fail') : null,
            isPR && isCiPass ? React.createElement('span', {
              className: 'dgt-drawer-tab-badge',
              style: { color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)' },
            }, 'CI Pass') : null,
            (isPR && (props.has_conflicts || props.hasConflicts || props.mergeable === false)) ? React.createElement('span', {
              className: 'dgt-drawer-tab-badge',
              style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
            }, '⚔️ ' + (t('badgeConflict') || 'Conflict')) : null,
            React.createElement('span', { className: 'dgt-drawer-tab-badge' }, curState)
          )
        ),
        (Array.isArray(labels) && labels.length > 0) ? React.createElement('div', { style: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' } },
          ...labels.map((lbl, idx) => React.createElement('span', {
            key: 'lbl-' + idx,
            style: {
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 4,
              border: '1px solid var(--dsw-alias-border-l2)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-secondary)',
            },
          }, typeof lbl === 'object' ? lbl.name : String(lbl)))
        ) : null,
        assignedUser ? React.createElement('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 } }, '👤 ' + (typeof assignedUser === 'object' ? (assignedUser.login || assignedUser.username) : assignedUser)) : null,
        feedback ? React.createElement('div', { style: { fontSize: 11, marginTop: 6, color: feedback.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' } }, feedback.text) : null,
        React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
          isIssue ? React.createElement('button', {
            type: 'button',
            className: 'dgt-btn dgt-btn-ghost',
            style: { fontSize: 11, padding: '2px 8px' },
            disabled: loadingAct !== null,
            onClick: () => postAction('worktree-open'),
          }, loadingAct === 'worktree-open' ? '…' : t('actionOpenWorktree')) : null,
          isIssue ? React.createElement('button', {
            type: 'button',
            className: 'dgt-btn dgt-btn-ghost',
            style: { fontSize: 11, padding: '2px 8px' },
            disabled: loadingAct !== null,
            onClick: () => postAction('assign-me'),
          }, loadingAct === 'assign-me' ? '…' : t('actionAssignMe')) : null,
          (isPR && (props.has_conflicts || props.hasConflicts || props.mergeable === false) && curState === "open") ? React.createElement("button", {
            type: "button",
            className: "dgt-btn dgt-btn-ghost",
            style: { fontSize: 11, padding: "2px 8px", color: "var(--dsw-alias-state-error-primary)" },
            disabled: loadingAct !== null,
            onClick: () => postAction("conflict-analyze"),
          }, loadingAct === "conflict-analyze" ? "…" : t("actionResolveConflicts")) : null,
          (isPR && (props.needs_rebase || props.needsRebase) && curState === "open") ? React.createElement("button", {
            type: "button",
            className: "dgt-btn dgt-btn-ghost",
            style: { fontSize: 11, padding: "2px 8px", color: "var(--dsw-alias-state-warning-primary)" },
            disabled: loadingAct !== null,
            onClick: () => postAction("stack-rebase"),
          }, loadingAct === "stack-rebase" ? "…" : t("actionRebaseStack")) : null,
          isPR ? React.createElement('button', {
            type: 'button',
            className: 'dgt-btn dgt-btn-ghost',
            style: { fontSize: 11, padding: '2px 8px' },
            disabled: loadingAct !== null || curState !== 'open',
            onClick: () => postAction('merge'),
          }, loadingAct === 'merge' ? '…' : t('actionMerge')) : null,
          curState === 'open' ? React.createElement('button', {
            type: 'button',
            className: 'dgt-btn dgt-btn-ghost',
            style: { fontSize: 11, padding: '2px 8px' },
            disabled: loadingAct !== null,
            onClick: () => postAction('close'),
          }, loadingAct === 'close' ? '…' : t('actionClose')) : null,
          props.html_url ? React.createElement('a', {
            href: props.html_url,
            target: '_blank',
            rel: 'noopener noreferrer',
            style: { fontSize: 11, alignSelf: 'center', marginLeft: 4, color: 'var(--dsw-alias-label-secondary)' },
          }, t('actionViewGitea')) : null
        )
      )
    }

    let _graphGlobalSeq = 0
    let _graphGlobalCwd = null
    let _graphGlobalAbort = null

    function GitSidebarDrawer(props) {
      const { cwd, sessionId, snap, ready, onClose, onRefresh, t } = props
      const [tab, setTab] = React.useState('status')
      const [graphData, setGraphData] = React.useState(null)
      const [graphLoading, setGraphLoading] = React.useState(false)
      const [graphLimit, setGraphLimit] = React.useState(100)
      const [graphSkip, setGraphSkip] = React.useState(0)
      const [events, setEvents] = React.useState([])
      const [eventsLoading, setEventsLoading] = React.useState(false)
      const [refreshing, setRefreshing] = React.useState(false)

      React.useEffect(() => {
        const onKeyDown = (e) => {
          if (e.key === 'Escape') onClose()
        }
        if (typeof window !== 'undefined') {
          window.addEventListener('keydown', onKeyDown)
          return () => window.removeEventListener('keydown', onKeyDown)
        }
      }, [onClose])

      // Issue-308: reset graph pagination and data when repository cwd changes
      React.useEffect(() => {
        _graphGlobalCwd = cwd
        _graphGlobalSeq++
        if (_graphGlobalAbort) {
          try { _graphGlobalAbort.abort() } catch (_err) { void _err }
          _graphGlobalAbort = null
        }
        setGraphSkip(0)
        setGraphData(null)
      }, [cwd])

      const loadGraph = React.useCallback((limit, skip = 0) => {
        if (_graphGlobalAbort) {
          try { _graphGlobalAbort.abort() } catch (_err) { void _err }
        }
        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
        _graphGlobalAbort = ac
        const curSeq = ++_graphGlobalSeq
        const reqCwd = cwd

        setGraphLoading(true)
        const q = ['limit=' + limit]
        if (skip > 0) q.push('skip=' + skip)
        if (cwd) q.push('cwd=' + encodeURIComponent(cwd))
        if (sessionId) q.push('sessionId=' + encodeURIComponent(sessionId))
        clientFetch('/dsh-gitea/git-graph?' + q.join('&'), { cache: 'no-store', signal: ac?.signal })
          .then((r) => r.json())
          .then((res) => {
            if (curSeq !== _graphGlobalSeq || _graphGlobalCwd !== reqCwd) return
            if (res?.ok && res.data) {
              setGraphData((prev) => {
                if (curSeq !== _graphGlobalSeq || _graphGlobalCwd !== reqCwd) return prev
                if (skip > 0 && prev?.commits) {
                  return {
                    ...res.data,
                    commits: [...prev.commits, ...(res.data.commits || [])],
                    lanes: [...(prev.lanes || []), ...(res.data.lanes || [])],
                  }
                }
                return res.data
              })
            }
          })
          .catch(() => {})
          .finally(() => {
            if (curSeq === _graphGlobalSeq) setGraphLoading(false)
          })
      }, [cwd, sessionId])

      React.useEffect(() => {
        if (tab === 'graph') loadGraph(graphLimit, graphSkip)
      }, [tab, graphLimit, graphSkip, loadGraph])

      const loadEvents = React.useCallback(() => {
        setEventsLoading(true)
        clientFetch('/dsh-gitea/events', { cache: 'no-store' })
          .then((r) => r.json())
          .then((res) => { if (res?.ok && Array.isArray(res.data)) setEvents(res.data) })
          .catch(() => {})
          .finally(() => setEventsLoading(false))
      }, [])

      React.useEffect(() => {
        if (tab === 'events') loadEvents()
      }, [tab, loadEvents])

      const handleManualRefresh = () => {
        setRefreshing(true)
        if (typeof onRefresh === 'function') onRefresh()
        if (tab === 'graph') loadGraph(graphLimit)
        if (tab === 'events') loadEvents()
        setTimeout(() => setRefreshing(false), 600)
      }

      const title = ready ? (snap.repoName || snap.branch || 'Repository') : t('drawerTitle')
      const branchName = ready ? (snap.branch || 'HEAD') : ''

      let statusContent = null
      if (!ready) {
        statusContent = React.createElement('div', { className: 'dgt-drawer-empty' },
          React.createElement('p', { style: { margin: 0, color: 'var(--dsw-alias-label-secondary)' } }, t('gitEmpty'))
        )
      } else {
        const isDirty = !!snap.dirty
        const dirtyCount = snap.dirtyFiles || 0
        const pr = snap.pr
        const syncText = (snap.ahead > 0 || snap.behind > 0)
          ? ((snap.ahead > 0 ? '\u2191 ' + snap.ahead + ' ' + t('gitAhead') : '') +
             (snap.ahead > 0 && snap.behind > 0 ? ', ' : '') +
             (snap.behind > 0 ? '\u2193 ' + snap.behind + ' ' + t('gitBehind') : '') +
             (snap.upstream ? ' (' + snap.upstream + ')' : ''))
          : (snap.upstream ? t('gitUpToDate') + ' (' + snap.upstream + ')' : '')

        statusContent = React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'dgt-drawer-card' },
            React.createElement('div', { className: 'dgt-drawer-row' },
              React.createElement('span', { className: 'dgt-drawer-dim' }, t('branch')),
              React.createElement('span', { className: 'dgt-drawer-val', style: { fontFamily: 'ui-monospace, monospace' } }, branchName)
            ),
            syncText ? React.createElement('div', { className: 'dgt-drawer-row' },
              React.createElement('span', { className: 'dgt-drawer-dim' }, t('gitSync')),
              React.createElement('span', { className: 'dgt-drawer-val' }, syncText)
            ) : null,
            snap.head ? React.createElement('div', { className: 'dgt-drawer-row' },
              React.createElement('span', { className: 'dgt-drawer-dim' }, 'HEAD'),
              React.createElement('span', { className: 'dgt-drawer-val', style: { fontFamily: 'ui-monospace, monospace' } }, snap.head.slice(0, 7))
            ) : null
          ),

          pr && pr.prNumber ? React.createElement('div', { className: 'dgt-drawer-card' },
            React.createElement('span', { className: 'dgt-drawer-sec-h' }, t('activePr')),
            React.createElement('div', { className: 'dgt-drawer-row' },
              React.createElement('span', { style: { fontWeight: 600 } }, '#' + pr.prNumber),
              pr.ciFailed
                ? React.createElement('span', { className: 'dgt-badge dgt-badgeBad' }, t('ciFail'))
                : React.createElement('span', { className: 'dgt-badge dgt-badgeOk' }, t('prActive'))
            )
          ) : null,

          React.createElement('div', { className: 'dgt-drawer-card' },
            React.createElement('div', { className: 'dgt-drawer-row', style: { marginBottom: 6 } },
              React.createElement('span', { className: 'dgt-drawer-sec-h' }, t('gitChanges')),
              isDirty
                ? React.createElement('span', { className: 'dgt-badge dgt-badgeWarn' }, (t('dirtyChanged') || '{count} changed').replace('{count}', String(dirtyCount)))
                : React.createElement('span', { className: 'dgt-badge dgt-badgeOk' }, t('gitClean'))
            ),
            isDirty
              ? React.createElement('pre', { className: 'dgt-git-pre', style: { maxHeight: 220, overflowY: 'auto' } }, snap.diff || snap.dirty)
              : React.createElement('div', { className: 'dgt-drawer-clean-box' },
                  React.createElement('span', { style: { color: 'var(--dsw-alias-state-success-primary)', fontSize: 16 } }, '\u2713'),
                  React.createElement('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 } }, t('noChangesDesc'))
                )
          ),

          snap.graph ? React.createElement('div', { className: 'dgt-drawer-card' },
            React.createElement('span', { className: 'dgt-drawer-sec-h' }, t('gitCommits')),
            React.createElement('pre', { className: 'dgt-git-pre', style: { maxHeight: 160, overflowY: 'auto' } }, snap.graph)
          ) : null
        )
      }

      let graphContent = null
      const commits = graphData?.commits || []
      const lanes = graphData?.lanes || []
      const baseUrl = graphData?.baseUrl || ''
      const owner = graphData?.owner || ''
      const repo = graphData?.repo || ''

      if (graphLoading && commits.length === 0) {
        graphContent = React.createElement('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('graphLoading'))
      } else if (commits.length === 0) {
        graphContent = React.createElement('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('graphEmpty'))
      } else {
        graphContent = React.createElement('div', { className: 'dgt-graph-body', style: { padding: 0 } },
          commits.map((commit, idx) => {
            const laneRow = lanes[idx]
            const cols = laneRow?.columns || ['node']
            const commitUrl = (baseUrl && owner && repo && commit.oid)
              ? `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commit/${commit.oid}`
              : null

            const ciBadge = commit.ciStatus ? React.createElement('span', {
              className: 'dgt-graph-ci dgt-graph-ci-' + commit.ciStatus,
              title: 'CI: ' + commit.ciStatus,
            }, commit.ciStatus === 'success' ? 'CI \u2713' : (commit.ciStatus === 'failure' ? 'CI \u2717' : 'CI \u25cf')) : null

            return React.createElement('div', { key: commit.oid || idx, className: 'dgt-graph-row' },
              React.createElement('span', { className: 'dgt-graph-lanes' },
                cols.map((glyph, cIdx) => React.createElement('span', {
                  key: cIdx,
                  className: 'dgt-graph-' + glyph,
                }, glyphChar(glyph)))
              ),
              commitUrl
                ? React.createElement('a', {
                    href: commitUrl,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    className: 'dgt-graph-oid',
                    title: commit.oid,
                  }, (commit.oid || '').slice(0, 7))
                : React.createElement('span', {
                    className: 'dgt-graph-oid',
                    title: commit.oid,
                  }, (commit.oid || '').slice(0, 7)),
              React.createElement('div', { className: 'dgt-graph-main' },
                React.createElement('span', { className: 'dgt-graph-subject', title: commit.subject }, commit.subject || ''),
                React.createElement('div', { className: 'dgt-graph-meta' },
                  (commit.refs || []).map((ref) => React.createElement('span', {
                    key: ref,
                    className: 'dgt-graph-ref' + (ref === branchName ? ' dgt-graph-refCurrent' : ''),
                  }, ref)),
                  ciBadge,
                  React.createElement('span', null, commit.author || ''),
                  React.createElement('span', null, '\u00b7'),
                  React.createElement('span', null, formatRelativeTime(commit.authorTime, t))
                )
              )
            )
          }),
          graphData?.hasMore ? React.createElement('button', {
            type: 'button',
            className: 'dgt-graph-more',
            onClick: () => {
              if (graphData.nextOffset != null) {
                setGraphSkip(graphData.nextOffset)
              } else {
                setGraphLimit((prev) => prev + 100)
              }
            },
          }, t('graphLoadMore')) : null
        )
      }

      let eventsContent = null
      if (eventsLoading && events.length === 0) {
        eventsContent = React.createElement('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('loading'))
      } else if (events.length === 0) {
        eventsContent = React.createElement('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, t('noEvents'))
      } else {
        eventsContent = React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
          events.slice(0, 30).map((ev, i) => {
            const epochSec = resolveEventEpochSeconds(ev)
            return React.createElement('div', { key: ev.id || i, className: 'dgt-drawer-card' },
              React.createElement('div', { className: 'dgt-drawer-row' },
                React.createElement('span', { className: 'dgt-badge dgt-badgeOk' }, ev.type || 'event'),
                React.createElement('span', { className: 'dgt-drawer-dim', style: { fontSize: 11 } }, formatRelativeTime(epochSec, t))
              ),
              React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-primary)' } }, ev.title || ev.message || JSON.stringify(ev.payload || {}))
            )
          })
        )
      }


      const [hubData, setHubData] = React.useState(null)
      const [hubLoading, setHubLoading] = React.useState(false)
      const [ciRca, setCiRca] = React.useState({})
      const [ciLoading, setCiLoading] = React.useState({})
      const [conflictData, setConflictData] = React.useState({})
      const [conflictLoading, setConflictLoading] = React.useState({})

      const handleAnalyzeConflict = React.useCallback((prNumber) => {
        setConflictLoading((prev) => ({ ...prev, [prNumber]: true }))
        clientFetch('/dsh-gitea/hub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'conflict-analyze', number: prNumber, owner: hubData?.owner, repo: hubData?.repo }),
        })
          .then((r) => r.json())
          .then((j) => {
            setConflictData((prev) => ({ ...prev, [prNumber]: j.data || j.error }))
          })
          .catch((err) => {
            setConflictData((prev) => ({ ...prev, [prNumber]: { summary: String(err) } }))
          })
          .finally(() => {
            setConflictLoading((prev) => ({ ...prev, [prNumber]: false }))
          })
      }, [hubData])

      const handleExplainCi = React.useCallback((prNumber) => {
        setCiLoading((prev) => ({ ...prev, [prNumber]: true }))
        clientFetch('/dsh-gitea/hub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ci-analyze', number: prNumber, owner: hubData?.owner, repo: hubData?.repo }),
        })
          .then((r) => r.json())
          .then((j) => {
            setCiRca((prev) => ({ ...prev, [prNumber]: j.data || j.error }))
          })
          .catch((err) => {
            setCiRca((prev) => ({ ...prev, [prNumber]: { errorSummary: String(err) } }))
          })
          .finally(() => {
            setCiLoading((prev) => ({ ...prev, [prNumber]: false }))
          })
      }, [hubData])

      const loadHub = React.useCallback(() => {
        setHubLoading(true)
        clientFetch('/dsh-gitea/hub')
          .then((r) => r.json())
          .then((d) => { setHubData(d?.ok ? d.data : null); setHubLoading(false) })
          .catch(() => { setHubLoading(false) })
      }, [])

      React.useEffect(() => {
        if (tab === 'hub' && !hubData) loadHub()
      }, [tab, hubData, loadHub])

      const postHubAction = React.useCallback((payload) => {
        clientFetch('/dsh-gitea/hub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(() => loadHub()).catch(() => {})
      }, [loadHub])

      const hubContent = React.createElement('div', { className: 'dgt-drawer-events' },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          React.createElement('h4', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, t('tabHub')),
          React.createElement('button', {
            type: 'button',
            className: 'dgt-btn dgt-btn-ghost',
            style: { fontSize: 11, padding: '2px 8px' },
            onClick: loadHub,
          }, hubLoading ? '\u2026' : t('hubRefresh'))
        ),
        hubData && hubData.pulls?.length > 0
          ? React.createElement('div', { style: { marginBottom: 16 } },
              React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-text-secondary)', marginBottom: 6, textTransform: 'uppercase' } }, t('hubOpenPulls')),
              ...hubData.pulls.map((pr) => React.createElement('div', { key: 'pr-' + pr.number, className: 'dgt-event-card' },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                  React.createElement('span', { style: { fontWeight: 600 } }, 'PR ' + pr.number + ' ' + (pr.title || '')),
                  React.createElement('div', { style: { display: 'flex', gap: 4 } },
                    (pr.mergeable === false || pr.hasConflicts || pr.has_conflicts) ? React.createElement('span', {
                      className: 'dgt-drawer-tab-badge',
                      style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
                    }, '⚔️ ' + (t('badgeConflict') || 'Conflict')) : null,
                    (pr.ciStatus === 'failure' || pr.ciFailed) ? React.createElement('span', {
                      className: 'dgt-drawer-tab-badge',
                      style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'var(--dsw-alias-state-error-primary)' },
                    }, t('ciFail')) : null,
                    React.createElement('span', { className: 'dgt-drawer-tab-badge' }, pr.state)
                  )
                ),
                React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px' },
                    onClick: () => postHubAction({ action: 'approve', number: pr.number, type: 'pr', owner: hubData.owner, repo: hubData.repo }),
                  }, t('actionApprove')),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px' },
                    onClick: () => postHubAction({ action: 'merge', number: pr.number, type: 'pr', owner: hubData.owner, repo: hubData.repo }),
                  }, t('actionMerge')),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px' },
                    onClick: () => postHubAction({ action: 'close', number: pr.number, type: 'pr', owner: hubData.owner, repo: hubData.repo }),
                  }, t('actionClose')),
                  pr.html_url ? React.createElement('a', { href: pr.html_url, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: 11, alignSelf: 'center', marginLeft: 4 } }, t('actionViewGitea')) : null,
                  (pr.mergeable === false || pr.hasConflicts || pr.has_conflicts) ? React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px', color: 'var(--dsw-alias-state-error-primary)' },
                    onClick: () => handleAnalyzeConflict(pr.number),
                  }, conflictLoading[pr.number] ? '…' : (t('actionAnalyzeConflict') || 'Analyze Conflicts')) : null,
                  (pr.ciStatus === 'failure' || pr.ciFailed) ? React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px', color: 'var(--dsw-alias-state-error-primary)' },
                    onClick: () => handleExplainCi(pr.number),
                  }, ciLoading[pr.number] ? t('ciExplaining') : t('actionExplainCi')) : null
                ),
                ciRca[pr.number] ? React.createElement('div', {
                  style: {
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    background: 'var(--dsw-alias-bg-layer-2)',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    fontSize: 11,
                  },
                },
                  React.createElement('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-error-primary)', marginBottom: 4 } },
                    '⚡ ' + t('ciAnalysisTitle') + (ciRca[pr.number].failedStep ? ': ' + ciRca[pr.number].failedStep : '')
                  ),
                  React.createElement('div', { style: { marginBottom: 4, fontFamily: 'monospace' } },
                    ciRca[pr.number].errorSummary || ciRca[pr.number].error || 'No error details found'
                  ),
                  ciRca[pr.number].recommendation ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } },
                    '💡 ' + ciRca[pr.number].recommendation
                  ) : null,
                  conflictData[pr.number] ? React.createElement('div', {
                  style: {
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    background: 'var(--dsw-alias-bg-layer-2)',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    fontSize: 11,
                  },
                },
                  React.createElement('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-state-error-primary)', marginBottom: 4 } },
                    '⚔️ ' + (t('conflictAnalysisTitle') || 'Conflict Analysis') + (conflictData[pr.number].clean ? ': Clean' : ': ' + (conflictData[pr.number].conflictsCount || 0) + ' conflicting file(s)')
                  ),
                  React.createElement('div', { style: { marginBottom: 4 } },
                    conflictData[pr.number].summary || 'Conflict details ready.'
                  ),
                  Array.isArray(conflictData[pr.number].files) ? React.createElement('div', { style: { marginTop: 4, fontFamily: 'monospace', fontSize: 10 } },
                    ...conflictData[pr.number].files.map((cf, cIdx) => React.createElement('div', { key: 'cf-' + cIdx },
                      '• ' + cf.file + ' (' + (cf.hunksCount || 0) + ' hunk(s))'
                    ))
                  ) : null
                ) : null,
                ciRca[pr.number].snippet ? React.createElement('pre', {
                    style: {
                      maxHeight: 120,
                      overflow: 'auto',
                      fontSize: 10,
                      margin: 0,
                      padding: 4,
                      background: 'var(--dsw-alias-bg-base)',
                      borderRadius: 4,
                    },
                  }, ciRca[pr.number].snippet) : null
                ) : null
              ))
            )
          : null,
        hubData && hubData.issues?.length > 0
          ? React.createElement('div', { style: { marginBottom: 16 } },
              React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-text-secondary)', marginBottom: 6, textTransform: 'uppercase' } }, t('hubAssignedIssues')),
              ...hubData.issues.map((iss) => React.createElement('div', { key: 'iss-' + iss.number, className: 'dgt-event-card' },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                  React.createElement('span', { style: { fontWeight: 600 } }, 'Issue ' + iss.number + ' ' + (iss.title || '')),
                  React.createElement('span', { className: 'dgt-drawer-tab-badge' }, iss.state)
                ),
                React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'dgt-btn dgt-btn-ghost',
                    style: { fontSize: 11, padding: '2px 6px' },
                    onClick: () => postHubAction({ action: 'close', number: iss.number, type: 'issue', owner: hubData.owner, repo: hubData.repo }),
                  }, t('actionClose')),
                  iss.html_url ? React.createElement('a', { href: iss.html_url, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: 11, alignSelf: 'center', marginLeft: 4 } }, t('actionViewGitea')) : null
                )
              ))
            )
          : null,
        hubData && hubData.worktrees?.length > 0
          ? React.createElement('div', { style: { marginBottom: 16 } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-text-secondary)', textTransform: 'uppercase' } }, t('worktreeTitle')),
                React.createElement('button', {
                  type: 'button',
                  className: 'dgt-btn dgt-btn-ghost',
                  style: { fontSize: 11, padding: '2px 6px' },
                  onClick: () => postHubAction({ action: 'clean', cwd, sessionId }),
                }, t('worktreeGc'))
              ),
              ...hubData.worktrees.map((wt, idx) => React.createElement('div', { key: 'wt-' + idx, className: 'dgt-event-card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } },
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 12 } }, wt.branch || wt.path || 'worktree'),
                  React.createElement('div', { style: { fontSize: 10, color: 'var(--dsw-alias-text-secondary)' } }, wt.path || '')
                ),
                React.createElement('button', {
                  type: 'button',
                  className: 'dgt-btn dgt-btn-ghost',
                  style: { fontSize: 11, padding: '2px 8px', marginLeft: 8 },
                  onClick: () => postHubAction({ action: 'switch', path: wt.path, cwd, sessionId }),
                }, t('worktreeSwitch'))
              ))
            )
          : null,
        hubData && hubData.runners?.length > 0
          ? React.createElement('div', { style: { marginBottom: 16 } },
              React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-text-secondary)', marginBottom: 6, textTransform: 'uppercase' } }, 'Runners'),
              ...hubData.runners.map((run, idx) => React.createElement('div', { key: 'run-' + idx, className: 'dgt-event-card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('span', { style: { fontWeight: 600, fontSize: 12 } }, run.name || 'Runner'),
                React.createElement('span', { className: 'dgt-drawer-tab-badge' }, run.status || 'idle')
              ))
            )
          : null,
        React.createElement('div', { style: { marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-text-secondary)', textTransform: 'uppercase' } }, t('releaseAssistantTitle')),
            React.createElement('button', {
              type: 'button',
              className: 'dgt-btn dgt-btn-ghost',
              style: { fontSize: 11, padding: '2px 8px' },
              onClick: () => {
                clientFetch('/dsh-gitea/release-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preflight' }) })
                  .catch(() => {})
              },
            }, t('releasePreflight'))
          )
        ),
        (!hubLoading && !hubData?.pulls?.length && !hubData?.issues?.length && !hubData?.worktrees?.length
          ? React.createElement('div', { className: 'dgt-events-empty' }, t('hubEmpty'))
          : null)
      )

      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dgt-drawer-backdrop', onClick: onClose }),
        React.createElement('aside', {
          className: 'dgt-drawer',
          role: 'dialog',
          'aria-modal': true,
          'aria-label': t('drawerTitle'),
        },
          React.createElement('div', { className: 'dgt-drawer-head' },
            React.createElement('div', { className: 'dgt-drawer-title-wrap' },
              React.createElement('h3', { className: 'dgt-drawer-title' }, title, React.createElement('span', { className: 'dgt-chevron', style: { display: 'inline-flex', verticalAlign: 'middle', marginLeft: '6px' } }, React.createElement(Chevron))),
              branchName ? React.createElement('span', { className: 'dgt-drawer-branch-badge' }, '\u2442 ' + branchName) : null
            ),
            React.createElement('div', { className: 'dgt-drawer-actions' },
              React.createElement('button', {
                type: 'button',
                className: 'dgt-drawer-btn' + (refreshing ? ' dgt-drawer-btn-spin' : ''),
                title: t('drawerRefresh'),
                'aria-label': t('drawerRefresh'),
                onClick: handleManualRefresh,
              }, '\u27f3'),
              React.createElement('button', {
                type: 'button',
                className: 'dgt-drawer-btn dgt-drawer-btn-close',
                title: t('drawerClose'),
                'aria-label': t('drawerClose'),
                onClick: onClose,
              }, '\u00d7')
            )
          ),
          React.createElement('div', { className: 'dgt-drawer-tabs' },
            React.createElement('button', {
              type: 'button',
              className: 'dgt-drawer-tab' + (tab === 'status' ? ' dgt-drawer-tabActive' : ''),
              onClick: () => setTab('status'),
            },
              t('tabStatus'),
              ready && snap.dirty ? React.createElement('span', { className: 'dgt-drawer-tab-badge dgt-drawer-tab-badgeAlert' }, snap.dirtyFiles || '*') : null
            ),
            React.createElement('button', {
              type: 'button',
              className: 'dgt-drawer-tab' + (tab === 'graph' ? ' dgt-drawer-tabActive' : ''),
              onClick: () => setTab('graph'),
            }, t('tabGraph')),
            React.createElement('button', {
              type: 'button',
              className: 'dgt-drawer-tab' + (tab === 'events' ? ' dgt-drawer-tabActive' : ''),
              onClick: () => setTab('events'),
            },
              t('tabEvents'),
              events.length > 0 ? React.createElement('span', { className: 'dgt-drawer-tab-badge' }, events.length) : null
            ),
            React.createElement('button', {
              type: 'button',
              className: 'dgt-drawer-tab' + (tab === 'hub' ? ' dgt-drawer-tabActive' : ''),
              onClick: () => setTab('hub'),
            }, t('tabHub'))
          ),
          React.createElement('div', { className: 'dgt-drawer-body' },
            tab === 'status' ? statusContent : (tab === 'graph' ? graphContent : (tab === 'hub' ? hubContent : eventsContent))
          )
        )
      )
    }

    function useCrossTabGitStatus(cwd, sessionId) {
      const [snap, setSnap] = React.useState(null)
      const channelRef = React.useRef(null)
      const aliveRef = React.useRef(true)

      const fetchStatus = React.useCallback(() => {
        if (!aliveRef.current) return
        if (typeof document !== 'undefined' && document.hidden) return
        const query = []
        if (cwd) query.push('cwd=' + encodeURIComponent(cwd))
        if (sessionId) query.push('sessionId=' + encodeURIComponent(sessionId))
        clientFetch('/dsh-gitea/git-status' + (query.length ? '?' + query.join('&') : ''), { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (!aliveRef.current) return
            setSnap(data)
            if (channelRef.current) {
              channelRef.current.postMessage({ type: 'git-status', payload: data, cwd: cwd || '', sessionId: sessionId || '' })
            }
          })
          .catch(() => {
            if (!aliveRef.current) return
            setSnap({ ok: false })
          })
      }, [cwd, sessionId])

      React.useEffect(() => {
        aliveRef.current = true
        let alive = true
        const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dsh_gitea_sync') : null
        channelRef.current = channel

        if (channel) {
          channel.onmessage = (ev) => {
            if (alive && ev.data && ev.data.type === 'git-status') {
              const msgCwd = ev.data.cwd || ''
              const msgSession = ev.data.sessionId || ''
              const curCwd = cwd || ''
              const curSession = sessionId || ''
              if (msgCwd === curCwd && msgSession === curSession) {
                setSnap(ev.data.payload)
              }
            }
          }
        }

        const onVisibilityChange = () => {
          if (typeof document !== 'undefined' && !document.hidden && alive) {
            fetchStatus()
          }
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', onVisibilityChange)
        }

        let abortController = typeof AbortController !== 'undefined' ? new AbortController() : null
        if (typeof navigator !== 'undefined' && navigator.locks && abortController) {
          const lockKey = 'dsh_gitea_status_leader_' + encodeURIComponent(sessionId || cwd || 'global')
          navigator.locks.request(lockKey, { signal: abortController.signal }, async () => {
            fetchStatus()
            const id = setInterval(fetchStatus, 4000)
            return new Promise((resolve) => {
              abortController.signal.addEventListener('abort', () => {
                clearInterval(id)
                resolve()
              })
            })
          }).catch((err) => {
            if (err && (err.name === 'AbortError' || abortController.signal.aborted)) return
            if (alive) fetchStatus()
          })
        } else {
          fetchStatus()
          const id = setInterval(fetchStatus, 4000)
          return () => {
            alive = false
            aliveRef.current = false
            clearInterval(id)
            if (channel) {
              channel.close()
              channelRef.current = null
            }
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
              document.removeEventListener('visibilitychange', onVisibilityChange)
            }
          }
        }

        return () => {
          alive = false
          aliveRef.current = false
          if (abortController) abortController.abort()
          if (channel) {
            channel.close()
            channelRef.current = null
          }
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('visibilitychange', onVisibilityChange)
          }
        }
      }, [cwd, sessionId, fetchStatus])

      return [snap, fetchStatus]
    }

    function GitStrip(props) {
      const t = typeof props.t === 'function' ? props.t : makeT(props.locale)
      const [open, setOpen] = React.useState(false)
      const session = props.useSession ? props.useSession(function (s) { return s }) : null
      const workspaces = props.useWorkspaces ? props.useWorkspaces(function (s) { return s }) : null
      const cwd = workspaceCwdFrom(session, workspaces)
      const sessionId = chipSessionId(props, session)
      const statusRes = useCrossTabGitStatus(cwd, sessionId)
      const snap = Array.isArray(statusRes) ? statusRes[0] : statusRes
      const fetchStatus = Array.isArray(statusRes) ? statusRes[1] : null

      const ready = snap && snap.ok
      const pr = ready && snap.pr ? snap.pr : null

      const syncBadge = []
      if (ready && snap.ahead > 0) {
        syncBadge.push(React.createElement('span', { key: 'a', className: 'dgt-git-badge dgt-git-ahead', title: t('gitAhead') + ': ' + snap.ahead }, '\u2191' + snap.ahead))
      }
      if (ready && snap.behind > 0) {
        syncBadge.push(React.createElement('span', { key: 'b', className: 'dgt-git-badge dgt-git-behind', title: t('gitBehind') + ': ' + snap.behind }, '\u2193' + snap.behind))
      }

      const chipLabel = [
        (ready ? ((snap.branch || '?') + (snap.dirty ? ' *' : '')) : 'git'),
        ...syncBadge,
        (pr && pr.prNumber ? ' #' + pr.prNumber : ''),
        (pr && pr.ciFailed ? ' CI\u2717' : ''),
        (pr && pr.mirrorWarning ? (pr.mirrorLag > 1 ? ' \uD83E\uDE9E!' + pr.mirrorLag : ' \uD83E\uDE9E!') : ''),
      ]

      const chip = React.createElement('button', {
        type: 'button',
        className: 'dgt-git-chip' + (ready && snap.dirty ? ' dgt-git-dirty' : '') + (ready ? '' : ' dgt-git-muted'),
        title: t('gitHint'),
        'aria-expanded': open,
        onClick: () => setOpen((value) => !value),
      }, ...chipLabel)

      const drawer = open ? React.createElement(GitSidebarDrawer, {
        cwd,
        sessionId,
        snap,
        ready,
        onClose: () => setOpen(false),
        onRefresh: fetchStatus,
        t,
      }) : null

      return React.createElement('div', { className: 'dgt-git-wrap' }, chip, drawer)
    }

    function apply(ctx) {
      const localeSvc = getService(ctx, 'locale')
      const slotsSvc = getService(ctx, 'slots')

      try {
        if (localeSvc && typeof ctx.effect === 'function') {
          ctx.effect(() => {
            try {
              if (typeof localeSvc.register === 'function') {
                localeSvc.register(NS, { en, zh })
              }
            } catch (err) {
              console.warn('[dsh-gitea] locale already registered:', (err && err.message) || err)
            }
          }, 'dsh-gitea: locale dictionary')
        }
      } catch (taken) {
        console.warn('[dsh-gitea] locale already registered:', (taken && taken.message) || taken)
      }

      function useLocale() { return useActiveLocale(ctx) }

      if (slotsSvc && typeof slotsSvc.inject === 'function') {
        try {
          // Primary seat on DSH 0.2.x: a first-class page under Settings.
          // `label` is a static brand string on purpose — it is resolved while
          // the page renders, and a locale lookup there would take the whole
          // client batch down with it.
          slotsSvc.inject('settings.section', () => slotsSvc.register(
            {
              name: 'settings.section',
              id: ROW_ID,
              order: 60,
              label: () => 'Gitea',
              locale: NS,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(GiteaSettingsSection, Object.assign({}, props, { ctx, locale: useLocale() })),
          ))
        } catch (err) {
          console.error('[dsh-gitea] error registering settings.section:', err)
        }

        try {
          // DSH >= 0.1.6: the Plugins page lists a configurable entry as a card
          // and opens the entry's own page with the settings form. Kept as a
          // compatibility seat; on 0.2.x the row seat below is the canonical one.
          slotsSvc.inject('plugins.item', () => slotsSvc.register(
            {
              name: 'plugins.item',
              id: ROW_ID,
              order: 60,
              label: () => 'Gitea',
              locale: NS,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(GiteaPluginCard, Object.assign({}, props, { ctx, locale: useLocale() }))),
          ))
        } catch (err) {
          console.error('[dsh-gitea] error registering plugins.item:', err)
        }

        try {
          // Canonical DSH 0.2.x configuration page: keyed by
          // `<package name>#<row id>` as declared by cordis.patch.yml.
          slotsSvc.inject('plugins.row.config', () => slotsSvc.register(
            {
              name: 'plugins.row.config',
              key: ROW_CONFIG_KEY,
              locale: NS,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(GiteaPluginCard, Object.assign({}, props, { ctx, locale: useLocale() }))),
          ))
        } catch (err) {
          console.error('[dsh-gitea] error registering plugins.row.config:', err)
        }

        try {
          // Legacy (< 0.1.6) settings seat; unknown slots never resolve, so this
          // is inert on newer cores and harmless as a fallback.
          slotsSvc.inject('settings.plugin.item', () => slotsSvc.register(
            {
              name: 'settings.plugin.item',
              key: NS,
              locale: NS,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(GiteaPluginCard, Object.assign({}, props, { ctx, locale: useLocale() }))),
          ))
        } catch (err) {
          console.error('[dsh-gitea] error registering settings.plugin.item:', err)
        }

        try {
          slotsSvc.inject('conversation.session.header.utilities', () => slotsSvc.register(
            {
              name: 'conversation.session.header.utilities',
              id: '@goodandready/dsh-gitea',
              locale: NS,
              order: 25,
              inject: () => ({ ctx }),
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(GitStrip, Object.assign({}, props, { ctx, locale: useLocale() }))),
          ))
        } catch (err) {
          console.error('[dsh-gitea] error registering conversation.session.header.utilities:', err)
        }
      }
    }

    module.exports = { apply, GitSidebarDrawer, GiteaActionCard, EventsPanel, GiteaSettingsSection, formatRelativeTime, resolveEventEpochSeconds, en, zh, inject: ['slots', 'locale'] }
    return module.exports
  },
})
