/**
 * #77 spike: golden tasks for the fuzzy dispatcher.
 *
 * Each `ask` is phrased the way a small model would restate a user request:
 * short, imperative, no operation names. `expect: null` means the ask is not a
 * Gitea operation and the matcher must not answer confidently.
 *
 * Keep this list honest: add the asks that actually failed, not the ones that
 * already pass.
 */
export const TASKS = [
  { ask: 'list the open pull requests in acme/web', expect: 'gitea_pr_list' },
  { ask: 'close issue 42 in acme/web', expect: 'gitea_issue_close' },
  { ask: 'comment on PR 17: looks good', expect: 'gitea_pr_comment' },
  { ask: 'who am I on the forge', expect: 'gitea_whoami' },
  { ask: 'show me issue 8', expect: 'gitea_issue_get' },
  { ask: 'file a bug about the login timeout', expect: 'gitea_issue_create' },
  { ask: 'what changed in PR 12', expect: 'gitea_pr_diff' },
  { ask: 'is PR 9 mergeable', expect: 'gitea_pr_merge_status' },
  { ask: 'merge PR 9', expect: 'gitea_pr_merge' },
  { ask: 'list the branches', expect: 'gitea_branches' },
  { ask: 'create a tag v0.9.0', expect: 'gitea_tags' },
  { ask: 'show README.md', expect: 'gitea_repo_contents' },
  { ask: 'recent commits on master', expect: 'gitea_repo_commits' },
  { ask: 'compare main and feature/x', expect: 'gitea_repo_compare' },
  { ask: 'what CI runs failed', expect: 'gitea_ci' },
  { ask: 'why did CI fail', expect: 'gitea_ci_logs_analyze' },
  { ask: 'plan the release notes for 0.9.0', expect: 'gitea_release_plan' },
  { ask: 'list labels', expect: 'gitea_labels' },
  { ask: 'add label bug to issue 5', expect: 'gitea_labels' },
  { ask: 'search issues about timeout', expect: 'gitea_issue_search' },
  { ask: 'find the code that reads the token', expect: 'gitea_code_search' },
  { ask: 'list packages', expect: 'gitea_packages_list' },
  { ask: 'delete package version 1.2.3', expect: 'gitea_package_delete' },
  { ask: 'set branch protection on master', expect: 'gitea_branch_protection_set' },
  { ask: 'security audit', expect: 'gitea_security_audit' },
  { ask: 'create a worktree for issue 42', expect: 'gitea_worktree_add' },
  { ask: 'show the git graph', expect: 'gitea_git_graph' },
  { ask: 'review this PR', expect: 'gitea_pr_review' },
  { ask: 'approve PR 7', expect: 'gitea_pr_submit_review' },
  { ask: 'notification inbox', expect: 'gitea_notifications' },
  { ask: 'wiki page about deployment', expect: 'gitea_wiki' },
  { ask: 'repo health', expect: 'gitea_project_health' },
  { ask: 'triage digest', expect: 'gitea_triage_digest' },
  { ask: 'create repo from template', expect: 'gitea_repo_bootstrap' },
  { ask: 'sync memory brain', expect: 'gitea_memory_brain_sync' },
  { ask: 'create an issue from this crash log', expect: 'gitea_incident_report' },
  { ask: 'cut release 0.9.0', expect: 'gitea_releases' },
  { ask: 'remove the worktree', expect: 'gitea_worktree_remove' },
  { ask: 'milestones', expect: 'gitea_milestones' },
  { ask: 'duplicate issues', expect: 'gitea_issue_duplicates' },
  { ask: 'bootstrap the house labels', expect: 'gitea_label_bootstrap' },
  { ask: 'org members', expect: 'gitea_org' },
  { ask: 'mirror status', expect: 'gitea_mirror_sync_status' },
  { ask: 'deploy keys', expect: 'gitea_deploy_keys' },
  { ask: 'webhook sandbox', expect: 'gitea_webhook_sandbox' },
  { ask: 'line comment with a suggestion', expect: 'gitea_pr_line_comment' },
  { ask: 'rebase the PR onto main', expect: 'gitea_pr_rebase' },
  { ask: 'stack status', expect: 'gitea_pr_stack_status' },
  { ask: 'book a flight to Rome', expect: null },
  { ask: 'write a haiku about the sea', expect: null },
]

/**
 * Held-out phrasings, written after the keyword map was tuned. Reported
 * separately: a number that only holds on the development set is not evidence.
 */
export const HOLDOUT = [
  { ask: 'open a PR from feature/login to main', expect: 'gitea_pr_create' },
  { ask: 'squash merge pull request 3', expect: 'gitea_pr_merge' },
  { ask: 'list all milestones', expect: 'gitea_milestones' },
  { ask: 'remove label bug from issue 9', expect: 'gitea_labels' },
  { ask: 'get the diff between v0.8.9 and master', expect: 'gitea_repo_compare' },
  { ask: 'show the file lib/index.js at HEAD', expect: 'gitea_repo_contents' },
  { ask: 'rerun the failed job', expect: 'gitea_ci' },
  { ask: 'change the issue title', expect: 'gitea_issue_update' },
  { ask: 'assign issue 12 to alice', expect: 'gitea_issue_set_assignee' },
  { ask: 'add a reaction to issue 4', expect: 'gitea_reactions' },
  { ask: 'delete the branch old-stuff', expect: 'gitea_branches' },
  { ask: 'list my unread notifications', expect: 'gitea_notifications' },
  { ask: 'scaffold a new repo', expect: 'gitea_repo_bootstrap' },
  { ask: 'what forge is this', expect: 'gitea_flavor' },
  { ask: 'repo analytics', expect: 'gitea_repo_analytics' },
  { ask: 'list deploy keys', expect: 'gitea_deploy_keys' },
]
