# Workflow and Git standards

## Task board
Default: Backlog → Ready → In progress → In review → Done. Discover project-specific status field IDs; do not hardcode DeepGrow settings.

## Selection
- Ready issues only; exclude blocked/closed or dependency-incomplete tasks.
- Priority: `priority:P0`, `priority:P1`, `priority:P2`, `priority:P3`; oldest first on ties.
- Default one task globally. Respect area concurrency: `project:<area>` cannot have active In progress or In review PR work.
- GitHub Projects V2 status updates alone are not atomic locks; a real controller needs concurrency controls.

## GitHub Flow
- Only default branch (`main` by default) is permanent.
- Branch: `feat/123-add-plant`, `fix/124-plants-route`, etc.
- Commit: `feat(web): add plant drawer`; Conventional Commits 1.0.0.
- PR targets default branch and links issue with `Closes #123` if compatible with repository automation.
- Create PRs as **ready for review**, never Draft by default, after validation and human review of the diff. Move to In review only after an open, non-Draft PR exists. Done only after verified merge and issue reconciliation.
- Merge manually by default; autonomous merge requires explicit opt-in and protected-branch gates.

## Validation
Use repository commands for formatting, lint, typecheck, build and relevant functional checks. Prefer Docker-based validation where configured. Never describe skipped database/migration/Compose checks as passing.
