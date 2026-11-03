# DevFlow v0.4 — task lifecycle CLI

DevFlow v0.4 extends project setup with a guarded, **operator-driven** GitHub Flow task lifecycle. It is not a background worker and does not invoke Codex, Claude, or billable APIs.

## Preconditions

- Run `devflow init --apply` and `devflow github project setup --apply` first.
- Configure and verify `.devflow.yaml`: repository owner/name and Project V2 number.
- Install and authenticate GitHub CLI with repository and Projects V2 permissions.
- Ensure the Project status options include `Backlog`, `Ready`, `In progress`, `In review`, `Done`.
- Labels `priority:P0`–`P3`, `project:web|api|shared|infra|docs` and `type:feature|bug|refactor|documentation|chore|infrastructure` must exist.
- Run the CLI from the target repository, or pass `--cwd /path/to/repository`.

All writing commands require `--apply`. Dry-run previews are the default.

## 1. Create tasks in Backlog

Write a complete issue in a local Markdown file, using all sections of `templates/github/issue-template.md` and a checkbox under Acceptance Criteria. Then:

```sh
devflow task create --title "feat(web): add plant cards" --body-file task.md --priority P1 --area web --type feature
devflow task create --title "feat(web): add plant cards" --body-file task.md --priority P1 --area web --type feature --apply
```

The command verifies required sections and attempts to detect exact-title duplicates, creates a labeled issue, then attaches it to the configured Project in Backlog. An issue may be created even if board synchronization fails; in that case, **do not rerun create**. Use `devflow github sync --issue N --apply` to recover. Large issue lists fail closed when the duplicate scan cannot be trusted.

New tasks are never promoted from Backlog automatically. The owner must approve and move the task to Ready in GitHub Projects.

## 2. Find or claim next Ready issue

```sh
devflow task next
devflow task next --issue 123 --apply
```

`next` checks the board, complete issue sections, one priority/area/type label, and Dependencies references. A referenced dependency must be **closed and Done**. Eligible issues are ranked P0 → P1 → P2 → P3, then oldest first. If any task is In progress or In review globally, selection pauses. Applying re-reads the board and changes the selected issue to In progress.

**Concurrency caveat:** GitHub Project status updates are not transactional task leases. Run only one operator/agent at a time. For independent unattended controllers, use a separate durable lock and claim arbitration, like DeepGrow's Autopilot; v0.4 does **not** supply this.

## 3. Prepare the implementation branch

```sh
devflow task branch --issue 123
devflow task branch --issue 123 --apply
```

The CLI requires that the issue be In progress, the working tree be clean and the `origin` remote match the configured GitHub repository. Applying fetches the default branch and creates `feat/123-description` (or another type prefix) from `origin/main`. It does not modify `main` or overwrite existing branches.

The developer or AI agent implements and validates the issue, creates Conventional Commits, and pushes the task branch separately. No automatic code generation, push or merge is performed by this command.

## 4. Open a ready-for-review Pull Request

```sh
devflow task pr --issue 123
devflow task pr --issue 123 --apply
```

Requires a clean working tree and the expected issue branch, with no unpushed local commits. The PR is created **ready for review (not Draft)**, targeting the repository's default branch and linking the issue with `Closes #123`.

This command **does not assert that tests passed** and never silently pushes. It must be preceded by actual validation and a review of the changes. A ready-for-review PR is **not** automatically approved or mergeable: required CI checks, review and branch protections still apply.

## 5. Move to review

```sh
devflow task review --issue 123 --pr 45
devflow task review --issue 123 --pr 45 --apply
```

Verifies that the PR is open, **not Draft**, targets the default branch, belongs to the expected issue branch, and contains the closing reference. Then it moves the issue to In review; it does not automatically approve or merge the PR.

## 6. Complete only after merge

```sh
devflow task complete --issue 123 --pr 45
devflow task complete --issue 123 --pr 45 --apply
```

The command verifies the PR's `mergedAt`, base branch, task branch and issue closing reference. Applying marks the board item Done and closes the issue if GitHub did not already close it. Re-running after a partial completion is safe where GitHub state is consistent.

## Security and limitations

- Task bodies are untrusted data, never shell instructions.
- No automatic branch pushes, merges, admin bypasses or paid AI provider usage.
- Task selection refuses to start while another task remains In progress or In review.
- Validation is performed by the project developer/agent and CI; this CLI **does not run the project's validation commands**.
- Project V2 pagination currently fails closed at 1,000 items; large repositories should not use the tool without pagination upgrades.
- GitHub Projects V2 status writes are not atomic; do not use multiple competing task runners.
- Test on a disposable repository and Project before enabling writes on production repositories.
