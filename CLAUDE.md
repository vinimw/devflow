# Claude Code — DevFlow bootstrap

Read [AGENTS.md](AGENTS.md) for repository-wide safety rules.

When the user opens this fresh DevFlow clone in Claude Code and requests **"instalar devflow global"** or **"install DevFlow globally"**, you do **not** need DevFlow installed yet: these repository instructions are the bootstrap.

Use the project-local CLI:

```bash
node bin/devflow.mjs install global
```

Show the preview, ask for confirmation, and only then:

```bash
node bin/devflow.mjs install global --apply
```

The installer installs the global Claude Code skill, global Codex skill, and the CLI command, without deleting existing configurations. Verify the results. Do not run paid AI APIs or use unattended agents.

After a new agent session starts, the user can open any other repository and use `/devflow config` in Claude Code or `$devflow config` in Codex.
