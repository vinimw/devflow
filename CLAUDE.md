# Claude Code — DevFlow bootstrap

Read [AGENTS.md](AGENTS.md) for repository-wide safety rules.

When the user opens this fresh DevFlow clone in Claude Code and requests **"instalar devflow global"** or **"install DevFlow globally"**, you do **not** need DevFlow installed yet: these repository instructions are the bootstrap.

Use the project-local CLI:

```bash
npm run setup
```

Show the preview, ask for confirmation, and only then:

```bash
npm run setup -- --yes
```

The first command asks for confirmation in a real terminal. In a non-interactive agent shell, use `node bin/devflow.mjs install global` to preview, obtain the user's explicit approval in chat, then run the `--yes` variant. The installer installs the global Claude Code skill, global Codex skill, and the CLI command, without deleting existing configurations. Verify the results. Do not run paid AI APIs or use unattended agents.

After a new agent session starts, the user can open any other repository and use `/devflow config` in Claude Code or `$devflow config` in Codex.

## Removing global installation safely

When the user says **"desinstalar devflow global"**, follow the uninstall steps in `AGENTS.md`. Preview with `node bin/devflow.mjs uninstall global`, ask permission, then run `npm run uninstall -- --yes` (non-interactive) or `npm run uninstall` (interactive with confirmation), and verify. Keep the cloned source and all other project files.
