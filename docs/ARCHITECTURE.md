# DevFlow architecture and scope

The package has three layers:

1. **Skill** (`skills/devflow/`): portable workflow instructions in SKILL.md plus on-demand references for Claude Code and Codex.
2. **Templates** (`templates/`): copy-and-adapt policy, issue and project config documents.
3. **Execution tools** (future): separately versioned GitHub Projects V2 CLI, CI templates and optional autonomous runner.

A SKILL.md is not a GitHub Projects V2 API client or a background daemon. It does not provision a GitHub App, issue credentials, promise merges or eliminate provider costs.

## Portability principles
- Do not hardcode `vinimw/deepgrow`, GitHub Project #3, issue numbers, database volumes, private paths or secrets.
- Discover per-project status IDs, branch names, build commands and GitHub access.
- Repository-local policy takes precedence for explicit approved differences.
- Keep UI locale independent from code/commit language.
- Prefer minimal permissions and fail-closed defaults.

## Future milestones
- `devflow init` and `devflow doctor` commands.
- Idempotent issue and GitHub Projects V2 synchronization.
- Verified reusable GitHub Actions and PR completion checks.
- Optional containerized Autopilot with durable state, cost enforcement and approved merge gates.
- Disposable-repository integration verification and versioned releases.

Do not present those future capabilities as already implemented.
