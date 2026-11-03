# DevFlow repository — Codex and agent bootstrap

This repository is the **DevFlow installer source**, not an application that needs DevFlow project configuration.

## Natural-language global installation trigger

If the user opens this cloned repository in Codex or Claude Code and says **"instalar devflow global"**, **"install DevFlow globally"**, or similar, treat it as a request to install DevFlow on the current machine **without requiring any pre-installed DevFlow skill**.

1. Confirm the current workspace is the DevFlow repository with `bin/devflow.mjs`, `src/install-global.mjs`, and `skills/devflow/SKILL.md`.
2. Check `node --version` (Node.js 20+) and the local checkout path.
3. Run `node bin/devflow.mjs install global` to PREVIEW changes. Explain the destinations and any conflicts.
4. Request explicit confirmation from the user before writing into their home directory.
5. Once approved, run `node bin/devflow.mjs install global --apply`. This installs both skill symlinks and the CLI launcher. The installer refuses conflicting paths; never overwrite existing configurations or delete directories automatically.
6. Verify using `node bin/devflow.mjs help`, inspect `~/.claude/skills/devflow/SKILL.md`, `~/.agents/skills/devflow/SKILL.md`, and `~/.local/bin/devflow`. Optionally run `npm run validate` (no AI or GitHub calls).
7. If PATH was updated, inform the user to open a new terminal/agent session. The existing process may not inherit PATH updates automatically.
8. Report concrete success, warnings, and any remaining manual steps. **Do not claim installation succeeded without verifying files.**

The installed global skill is available to all local projects. New projects need their own `.devflow.yaml`, created through the conversational `devflow config` workflow.

## Safety and financial policy

The installer is local-only: no API calls, no AI provider invocation, no token handling, no purchasing credits, no GitHub writes. Do not spawn another AI agent. This conversation with Codex or Claude Code may use included subscription usage and cannot be guaranteed to avoid purchased credits; do not enable paid continuation.

Never replace a conflicting file, symlink, shell profile, or installation without specific authorization and an explicit reviewed plan. Do not silently modify the DevFlow source, `main`, or unrelated repositories.
