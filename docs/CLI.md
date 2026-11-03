# DevFlow CLI v0.2

The CLI provides a reusable **safe starting point** for new GitHub projects. It does not yet provision GitHub Projects V2, edit project status fields or install an autonomous development daemon.

## Requirements

- Node.js 20+ to run the CLI (this is a developer-side setup tool, not a requirement for the target project's runtime)
- Git for repository checks
- GitHub CLI `gh` for GitHub diagnostics and optional label creation
- A GitHub account with appropriate repository access; `gh auth login` if needed
- GitHub Project V2 access to inspect the configured project

From a local checkout of this repository:

```bash
node bin/devflow.mjs help
```

Optionally run with npm from the checkout:

```bash
npm install
npm run check
npm test
```

`package.json` defines the `devflow` executable for use via npm linking or installation when appropriate. The package is private and is not published to npm.

## Initialize another repository

Review changes without writing:

```bash
node /path/to/devflow/bin/devflow.mjs init --cwd /path/to/project --name MyApp --repo owner/myapp --project-number 4
```

Apply the proposed files:

```bash
node /path/to/devflow/bin/devflow.mjs init --cwd /path/to/project --name MyApp --repo owner/myapp --project-number 4 --apply
```

This creates `.devflow.yaml`, `AGENTS.md`, `CLAUDE.md` and `.github/ISSUE_TEMPLATE/devflow-task.md` only if missing. Existing files are skipped; review carefully before using both `--apply --force` to overwrite existing files.

`init` does **not** run GitHub commands, create labels, create issues or change Project V2 status.

## Diagnose

```bash
node /path/to/devflow/bin/devflow.mjs doctor --cwd /path/to/project
node /path/to/devflow/bin/devflow.mjs doctor --cwd /path/to/project --json
```

Doctor reports missing configuration, Git, GitHub CLI, authentication, configured repository and Project V2 access. Warnings do not fix configuration or permissions.

## Plan GitHub labels

```bash
node /path/to/devflow/bin/devflow.mjs github plan --cwd /path/to/project
```

Shows the labels it would create, and the expected board status names, without writing anything.

## Create missing labels

```bash
node /path/to/devflow/bin/devflow.mjs github setup --cwd /path/to/project --apply
```

This only creates missing repository labels (15 default labels) using `gh api`. It does not modify existing label colors/descriptions or create/manage Projects V2. Verify your GitHub permissions and the `.devflow.yaml` repository before applying.

## Security and scope

- Commands never run source code from task issue bodies.
- No destructive Git actions, issues, merges or Project mutations.
- The CLI uses the operator's local GitHub CLI credentials; credentials are not copied to templates.
- Use trusted target directories. `--force` may overwrite existing project files and is deliberately opt-in.
- This release does not guarantee that agent subscription usage cannot consume paid credits; the Autopilot reference requires fail-closed operation if a strict spending guarantee cannot be established.

## Planned v0.3

Optional setup of new GitHub Projects V2 boards, discovery and controlled creation of status fields, and idempotent task management scripts. These capabilities are not yet available.
