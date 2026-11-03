# DevFlow

Reusable AI-assisted GitHub development workflows for **Claude Code** and **OpenAI Codex**.

DevFlow packages project-independent practices tested in DeepGrow: GitHub Flow, GitHub Projects V2 task management, structured issues, priority-aware execution, Pull Requests and guarded automation.

## Structure

- `skills/devflow/SKILL.md`: reusable skill for AI agents
- `skills/devflow/references/`: Git standards, task management, task execution and optional Autopilot policy
- `templates/`: starter files for new repositories
- `docs/ARCHITECTURE.md`: scope, limitations and roadmap

## Install the skill

Clone this repository, then copy the skill directory into the appropriate agent's global skills folder.

For **Claude Code**:

```bash
mkdir -p ~/.claude/skills
cp -R skills/devflow ~/.claude/skills/devflow
```

For **Codex**:

```bash
mkdir -p ~/.agents/skills
cp -R skills/devflow ~/.agents/skills/devflow
```

If an installation already exists, review its contents before overwriting it. You can also install to the agent's project-local skills folder.

## DevFlow CLI (v0.2)

A Node.js 20+ CLI now supports dry-run-first project scaffolding, diagnostics, and idempotent creation of missing GitHub labels. From a checkout of this repository:

```bash
node bin/devflow.mjs init --cwd /path/to/project --name MyApp --repo owner/myapp --project-number 4
node bin/devflow.mjs init --cwd /path/to/project --name MyApp --repo owner/myapp --project-number 4 --apply
node bin/devflow.mjs doctor --cwd /path/to/project
node bin/devflow.mjs github plan --cwd /path/to/project
node bin/devflow.mjs github setup --cwd /path/to/project --apply
```

Existing files are preserved unless both `--apply` and `--force` are given. GitHub setup only creates missing **labels**; Project V2 boards and status fields are not provisioned yet. See [CLI commands and limitations](docs/CLI.md).

## GitHub Projects V2 (v0.3)

The CLI can now safely discover, create or reuse a GitHub Project V2, configure the five DevFlow Status choices on **new** boards, and attach an existing issue to Backlog while preserving statuses on existing items:

```bash
node bin/devflow.mjs github project plan --cwd /path/to/project
node bin/devflow.mjs github project setup --cwd /path/to/project --apply
node bin/devflow.mjs github sync --cwd /path/to/project --issue 123
node bin/devflow.mjs github sync --cwd /path/to/project --issue 123 --apply
```

The new setup commands are dry-run-first and do not reconfigure active boards. Review [Projects V2 setup](docs/PROJECTS_V2.md), including required GitHub CLI permissions and live-integration limitations.

## Task lifecycle (v0.4)

DevFlow now supports safe, dry-run-first task creation, priority-ordered Ready selection, task branch preparation, draft PR creation, review transition and verified merge completion:

```bash
node bin/devflow.mjs task create --title 'feat(web): add plant cards' --body-file task.md --priority P1 --area web --type feature --apply
node bin/devflow.mjs task next --issue 123 --apply
node bin/devflow.mjs task branch --issue 123 --apply
node bin/devflow.mjs task pr --issue 123 --apply
node bin/devflow.mjs task review --issue 123 --pr 45 --apply
node bin/devflow.mjs task complete --issue 123 --pr 45 --apply
```

Each command can be previewed without `--apply`. Code implementation, tests, commits, push, PR approval and merge remain deliberate separate steps. See [task lifecycle and safety requirements](docs/TASK_LIFECYCLE.md).

## Supervised AI-agent handoffs (v0.5)

DevFlow now installs the portable skill **inside your target project** and creates an agent-ready handoff for an approved **In progress** issue. It does not invoke Claude Code, Codex, AI APIs or unattended background workers.

```bash
node bin/devflow.mjs agent install --cwd /path/to/project
node bin/devflow.mjs agent install --cwd /path/to/project --apply
node bin/devflow.mjs agent preflight --provider codex
node bin/devflow.mjs agent handoff --cwd /path/to/project --issue 123 --provider codex
node bin/devflow.mjs agent handoff --cwd /path/to/project --issue 123 --provider codex --apply
```

**Billing constraint:** Official subscription authentication alone cannot guarantee included-allowance-only usage. The CLI fails closed against API-key environments and performs **no AI requests**; it cannot verify whether a future manually started agent session will consume purchased credits. Verify the official account usage settings before interactive work. See [Agent usage and spending controls](docs/AGENTS.md).

## Set up a project

1. Copy `templates/project/devflow.yaml` to `.devflow.yaml` in the target repository; replace all placeholder values.
2. Adapt `templates/AGENTS.md` and `templates/CLAUDE.md`; preserve existing project-specific instructions.
3. Configure GitHub access, including GitHub Projects V2 permissions where needed.
4. Ask your AI agent: **"Use the DevFlow skill to audit this repository and propose the workflow setup."**
5. Approve any changes before the agent creates issues, changes statuses or opens PRs.

Default statuses: **Backlog → Ready → In progress → In review → Done**. New issues start in Backlog; only eligible Ready issues may be started. Default Git strategy is GitHub Flow with `main` and short-lived branches. Conventional Commits and validation precede PR delivery.

## What this release does and does not do

**v0.5** provides a skill, templates, project initialization, Project V2 setup/sync and an operator-driven task lifecycle CLI. It adds subscription-safe project-local skill installation and supervised task handoffs, but does not execute AI requests or run an autonomous agent daemon. GitHub writes require appropriate access and tools. Autonomous merge is **disabled by default** and requires a separate approved implementation, protections and validation.

### Cost and credentials

Subscription authentication does not guarantee that only included AI usage is consumed. If the user demands strictly no additional cost and no supported spending guard exists, autonomous execution must fail closed. Never transfer secrets, hardcoded Project IDs or Docker volumes from DeepGrow to another project.

See [architecture and future work](docs/ARCHITECTURE.md).
