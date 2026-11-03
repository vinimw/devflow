# Merge open pull requests in the current interactive agent session

Use this workflow when the user enters `devflow merge` or invokes `/devflow merge` (Claude Code) or `$devflow merge` (Codex).

## Bounded authorization

The explicit command authorizes **one** sweep of the configured repository's open pull requests targeting its verified default branch, with no routine approval questions. It also authorizes a **non-force** push of the agent's verified conflict-resolution commit to the existing PR branch (if safe and permitted). It does NOT authorize bypassing branch protections, disabling CI, force-push, merging a PR that has just had its conflicts fixed, merging Draft PRs, unrelated code changes, paid services, administrative overrides or destructive local changes.

Do not launch a new agent, use paid APIs or run in the background. The interactive session does the work. Give short progress updates; ask only for real blockers or safety-critical decisions.

## 1. Inspect and attempt merges

1. Read repository instructions and `.devflow.yaml`; verify the configured repository, default branch and GitHub credentials.
2. Run `devflow merge` (no `--dry-run`) in the target repository. This CLI **immediately** attempts eligible merges; `--dry-run` is a read-only diagnostic.
3. The CLI inspects all currently open PRs once, oldest PR number first. A PR can merge only if it is non-Draft, targets the default branch, has a verified head SHA, is mergeable, has no pending/failed/unknown checks and no pending/changes-requested review. GitHub's protected-branch rules and server-side checks are authoritative.
4. Report merged, blocked, pending CI, skipped and conflicting PRs individually. Do not keep polling CI within the same invocation; pending checks are left open for a later run. Do not use `--admin`, `--auto`, force push, or disable checks.

## 2. Resolve conflicting PRs separately

The CLI detects conflicts and does not edit any local files. The *agent*, after the merge sweep, may attempt a safe resolution **only for PRs reported as conflicting**, not for PRs blocked by CI or review:

1. Inspect the PR, its base/head repository, author and actual changes; do not resolve forks or inaccessible/unsafe branches by guessing.
2. Check that the local repository is safe and no existing work is overwritten. Use a **new temporary worktree** for the PR branch if possible. Fetch both default branch and PR head; avoid changing the user's active working tree.
3. Recheck the PR head SHA before making changes. Merge the updated default branch into the PR branch **without rewriting history**. If Git reports conflicts, inspect both sides and the issue acceptance criteria. Resolve only with sound contextual evidence; do not blindly choose ours/theirs or remove tests/protections.
4. Run relevant project tests, typecheck, lint, build and manual checks. If mandatory checks cannot run, a conflict is ambiguous, credentials are missing or high-impact changes are required, **stop and ask**; preserve a safe recovery report.
5. Commit with Conventional Commits and push the verified resolution to the same PR branch **without force** and only if its remote head did not change. Preserve other contributors' commits.
6. Confirm the PR has been updated, report its number, commit SHA and validations. Mark it **updated; rerun `devflow merge` after CI completes**. **Never merge this updated PR in the current invocation**, even if checks pass quickly.
7. Do not resolve conflicts by merging main into the default branch, editing PR metadata, pushing to the default branch or bypassing protections.

## 3. Status reconciliation

A verified merge may be followed by normal DevFlow task completion (including closing its linked issue and moving its Project card to Done) **only after identifying a matching verified merged PR and corresponding issue**. Failure to sync the board must be reported; never claim a Done status without confirmation. Do not change the status of PRs merely updated to fix conflicts.

## Example result

- PR #12: merged into main (verified).
- PR #13: skipped; CI pending. Rerun later.
- PR #14: conflict resolved, branch updated and pushed. Not merged. Rerun after CI.
- PR #15: blocked; required review. Leave open.

The command is deliberately a bounded action, **not** an unattended waiting loop or an automatic CI bypass.
