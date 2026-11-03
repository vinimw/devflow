# DevFlow repository — Codex and agent bootstrap

This repository is the **DevFlow installer source**, not an application that needs DevFlow project configuration.

## Default communication language

For DevFlow-related conversations in Claude Code or Codex, respond to the user in **Brazilian Portuguese (`pt-BR`)** by default, including installation and uninstallation plans, confirmation requests, errors and completion summaries. The user's explicit language request overrides this default. Source code, Git metadata, identifiers, CLI commands and machine-readable fields remain in English. Once installed, apply the skill's language policy; per-project `development.response_locale` may override `pt-BR`. Application `development.ui_locale` is a separate setting.

## Natural-language global installation trigger

If the user opens this cloned repository in Codex or Claude Code and says **"instalar devflow global"**, **"install DevFlow globally"**, or similar, treat it as a request to install DevFlow on the current machine **without requiring any pre-installed DevFlow skill**.

1. Confirm the current workspace is the DevFlow repository with `bin/devflow.mjs`, `src/install-global.mjs`, and `skills/devflow/SKILL.md`.
2. Check `node --version` (Node.js 20+) and the local checkout path.
3. Prefer `npm run setup` to preview global installation and ask for confirmation. If no interactive terminal is available, use `node bin/devflow.mjs install global` for the read-only preview. Explain the destinations and any conflicts.
4. Request explicit confirmation from the user before writing into their home directory.
5. When an interactive terminal is available, the `npm run setup` command asks and applies after confirmation. Otherwise, once the user explicitly approves the plan, run `npm run setup -- --yes` (or `node bin/devflow.mjs install global --apply`). This installs both skill symlinks and the CLI launcher. The installer refuses conflicting paths; never overwrite existing configurations or delete directories automatically.
6. Verify using `node bin/devflow.mjs help`, inspect `~/.claude/skills/devflow/SKILL.md`, `~/.agents/skills/devflow/SKILL.md`, and `~/.local/bin/devflow`. Optionally run `npm run validate` (no AI or GitHub calls).
7. If PATH was updated, inform the user to open a new terminal/agent session. The existing process may not inherit PATH updates automatically.
8. Report concrete success, warnings, and any remaining manual steps. **Do not claim installation succeeded without verifying files.**

The installed global skill is available to all local projects. New projects need their own `.devflow.yaml`, created through the conversational `devflow config` workflow.

## Natural-language global uninstall trigger

If the user says **"desinstalar devflow global"**, **"remover DevFlow global"**, or **"uninstall DevFlow globally"**, inspect this checkout and preview using `node bin/devflow.mjs uninstall global` or `npm run uninstall` in an interactive terminal. Show exactly which known DevFlow-owned links, launcher and shell PATH fragment would be removed, then ask for explicit confirmation. Only then run `npm run uninstall -- --yes` in non-interactive sessions, or `node bin/devflow.mjs uninstall global --apply`. In interactive terminals `npm run uninstall` itself requests confirmation.

Do not delete the cloned repository or any real existing directory. Do not remove unknown/broken symlinks, customized launchers, or unrelated PATH entries. Verify the resulting absence of owned links and wrapper. Repeat-safe uninstall is supported. If the current session still sees the skill or shell command, explain that the terminal and agent may need restarting.

## Safety and financial policy

The installer is local-only: no API calls, no AI provider invocation, no token handling, no purchasing credits, no GitHub writes. Do not spawn another AI agent. This conversation with Codex or Claude Code may use included subscription usage and cannot be guaranteed to avoid purchased credits; do not enable paid continuation.

Never replace a conflicting file, symlink, shell profile, or installation without specific authorization and an explicit reviewed plan. Do not silently modify the DevFlow source, `main`, or unrelated repositories.
