# DevFlow

**A reusable GitHub development workflow for Claude Code and OpenAI Codex.**

DevFlow standardizes repository initialization, GitHub Projects V2 boards, structured tasks, GitHub Flow, pull requests, and agent handoffs. It is based on the workflow developed for [DeepGrow](https://github.com/vinimw/deepgrow), but its configuration is independent of any particular application.

> **Current release: v0.10 (proposed).** The project consists of a portable agent skill, a local Node.js CLI, templates, documentation, automated tests, and an offline installation smoke test. **It is not a background AI agent or an autonomous coding service.**

## What you get

| Capability | Current status |
| --- | --- |
| Claude Code / Codex skills | Project-local installation |
| Repository setup | Templates and config via `init` |
| GitHub labels | Preview and create missing labels |
| GitHub Projects V2 | Preview and create/reuse board; configure *new* board statuses |
| GitHub issues | Create structured tasks and synchronize to Backlog |
| Task lifecycle | Select Ready, prepare branch, open draft PR, move to review, complete after verified merge |
| AI integration | Generate a handoff for an **interactive, supervised** agent session |
| Ongoing AI automation | **Not implemented / not enabled** |
| Zero-extra-cost AI guarantee | **Not technically attestable**; DevFlow performs no AI calls |

### The standard workflow

```text
Backlog  →  Ready  →  In progress  →  In review  →  Done
  │           │            │               │          │
  │       Owner approves   Agent/dev        PR        Verified merge
  └─ New issues           implements       exists     and issue closed
```

Only eligible **Ready** issues are selected. Priority order: `P0 > P1 > P2 > P3`, oldest issue first on ties. The default policy allows only one active task globally. Code, branches, and commits are in English; user-facing application language is independently configurable (such as `pt-BR`).

## DevFlow response language (v0.10)

**The DevFlow skill replies to users in Brazilian Portuguese (`pt-BR`) by default**, in both Claude Code and Codex: explanations, questions, plans, permissions, diagnostics and delivery summaries. This also applies to bootstrap instructions in the cloned repository before global installation.

A generated `.devflow.yaml` separates agent response language from application UI locale:

```yaml
development:
  code_language: en
  response_locale: pt-BR  # Responses from Claude Code / Codex when using DevFlow
  ui_locale: pt-BR        # Application UI language, independent of DevFlow messages
```

Existing repositories without `response_locale` default to `pt-BR`; no migration is needed. To change it for a particular project, set `development.response_locale: en-US` (or another requested locale). An explicit user language request in the current conversation takes precedence.

**Stable English conventions:** CLI command names, flags, GitHub Project status values, Conventional Commits, branch names, source code, technical file names, machine-readable keys and GitHub issue titles are not automatically translated. Raw output from some older CLI commands or upstream GitHub errors can remain in English; the AI agent must explain it in Portuguese. The global installer and uninstaller also display their interactive previews, confirmation prompts and human-readable messages in Portuguese.

---

## Safely uninstall the global installation (v0.9)

If you want to test the global installer again from a clean state, open the **DevFlow clone** in Claude Code or Codex and tell the agent:

> desinstalar devflow global

The repository's `AGENTS.md` and `CLAUDE.md` instruct the agent to **preview first**, show the exact changes and request permission before removing anything. This is supported even if the global skill installation is absent.

The most convenient terminal commands are:

```bash
# From the DevFlow clone; each previews and asks for confirmation
npm run setup       # install globally
npm run uninstall   # uninstall globally
```

In a non-interactive agent shell, after you explicitly approve the plan in chat, the agent can run `npm run setup -- --yes` or `npm run uninstall -- --yes`. These flags **bypass the terminal question**, so the agent must not invoke them before receiving your approval.

Alternatively, use the lower-level CLI from the clone:

```bash
# Read-only preview
node bin/devflow.mjs uninstall global

# After reviewing the plan
node bin/devflow.mjs uninstall global --apply
```

The tool removes **only** the verified DevFlow-owned symlinks `~/.claude/skills/devflow`, `~/.agents/skills/devflow`, the DevFlow-generated `~/.local/bin/devflow` launcher, and the exact managed PATH block in `~/.zshrc` or `~/.bashrc`. It preserves your original cloned repository, independent projects, unrelated profiles and custom scripts. Incompatible existing paths are left unchanged and reported. Repeating uninstall is safe.

When complete, open a fresh agent and terminal session as necessary. To test installation from scratch, return to this clone and ask:

> instalar devflow global

The installer does not call an AI API; conversations inside Claude Code or Codex still use the active provider plan and may draw from purchased credits depending on account settings.

---

## One-message global installation from a fresh clone (v0.8)

**This is the simplest recommended way to get DevFlow running everywhere on your Mac.**

### Step 1 — Clone this repository once

```bash
git clone https://github.com/vinimw/devflow.git ~/Documents/jobs/devflow
```

You can keep it wherever you like; no specific folder is required. The installer discovers its own checkout directory automatically.

### Step 2 — Open the DevFlow clone in Claude Code or Codex

Use your preferred agent's normal interface to open the **DevFlow repository itself**. It reads `AGENTS.md` (Codex) or `CLAUDE.md` (Claude Code), even before the skill is globally installed.

In the **agent's chat**, simply say:

> instalar devflow global

or:

> Install DevFlow globally on this computer.

The agent must inspect the repository, run a **read-only preview**, show you its intended changes, and ask for permission before touching files in your home directory. After you approve, it runs the installer and verifies the result.

There is no need to manually create symlinks, decide an install directory, or duplicate the DevFlow source. **The current cloned folder is the single source of truth.**

### What the agent runs internally

In a real interactive terminal, `npm run setup` previews, requests confirmation, and applies the installation automatically if you answer yes. In a non-interactive agent shell, the agent must preview with the CLI, request your approval through chat, and then use `npm run setup -- --yes`.

```bash
# Preview — no changes
node bin/devflow.mjs install global

# After your explicit approval
node bin/devflow.mjs install global --apply
```

The installer configures:

| Destination | Purpose |
| --- | --- |
| `~/.claude/skills/devflow` | Symlink to the cloned skill for Claude Code |
| `~/.agents/skills/devflow` | Symlink to the same skill for Codex |
| `~/.local/bin/devflow` | Executable launcher to the cloned CLI |
| `~/.zshrc` or `~/.bashrc` | Adds `~/.local/bin` to `PATH` if necessary and supported |

**No manual updates to existing installations:** if any target contains different files, directories, or an unrelated symlink, installation stops and explains the conflict. It never removes an existing directory or overwrites user configuration. You can rerun the installer safely after a successful setup.

If the installer cannot identify a supported shell, it leaves the shell profile untouched and prints the remaining PATH requirement. Optional `--skip-shell` prevents any profile changes.

### Step 3 — Open any other repository

For example:

```text
~/Documents/jobs/
├── devflow/          ← single shared checkout, with AGENTS.md and CLAUDE.md
├── new-project/      ← independent repository
└── deepgrow/         ← independent repository
```

Open `new-project` in Claude Code or Codex and use the global skill in chat:

| Claude Code | Codex | Action |
| --- | --- | --- |
| `/devflow config` | `$devflow config` | Verify and configure repository/Project V2 |
| `/devflow project` | `$devflow project` | Inspect or safely repair Project V2 statuses |
| `/devflow next` | `$devflow next` | Preview the next Ready task and request approval to begin |

You can also try natural-language prompts such as `devflow config`; explicit skill invocation is more reliable.

### What happens when you update DevFlow?

```bash
cd ~/Documents/jobs/devflow
git pull --ff-only
npm run validate
```

Both agents use the same skill symlink and CLI. Restart the terminal or agent session if PATH or skill discovery requires refreshing.

**Costs:** installation and validation do not call AI providers and do not use API credits. The *interactive* conversation with Claude Code or Codex still uses its subscription allowance, which cannot be independently proven to avoid purchased credits. No unattended AI execution is enabled.

---

## Chat commands inside Claude Code and Codex (v0.7)

**You type commands in the AI agent's chat, not in your terminal.** DevFlow is a reusable skill, and the agent interprets the command and invokes the underlying GitHub/CLI tools in the **current project and session**. It must first show what it found and request confirmation before writing changes.

| What you say in chat | What the agent does |
| --- | --- |
| `devflow config` | Inspect local configuration, ask for the repository/Project when missing, verify access, then ask to save configuration |
| `devflow project` | Audit the configured GitHub Project V2 and propose safe status fixes |
| `devflow next` | Select the highest-priority eligible Ready issue and immediately claim, prepare its branch and begin implementing in the same agent session; ask only for real blockers or separately permission-gated actions |
| `devflow doctor` | Diagnose local Git/GitHub/CLI and setup without changing anything |
| `devflow task pr --issue N` | Inspect task branch and validations; ask before opening a draft PR |
| `devflow task complete --issue N --pr P` | Verify an actual merge before marking Done |

**Explicit invocation**: In Claude Code, type `/devflow config`, `/devflow project`, or `/devflow next` when the project-local skill is installed and discovered. In Codex, use `$devflow config`, `$devflow project`, or `$devflow next` to explicitly invoke the skill. Plain `devflow config` is a natural-language request and depends on the agent recognizing the installed skill.

**The CLI is internal to this workflow**: The agent may run `node /path/to/devflow/bin/devflow.mjs config` or another CLI command itself; you do not need to type it manually. Make sure the agent has terminal/GitHub access and can locate the DevFlow CLI checkout. The skill itself is instructions, not a program that can run commands without tools or permissions.

The short CLI commands remain available for troubleshooting and scripting. They preview by default, can ask questions in an interactive terminal, and require `--apply` to perform noninteractive writes. **Chat requests do not automatically authorize writes**: the agent must still ask before applying modifications.

### Example: initial chat setup

In an interactive Claude Code session, say:

> /devflow config

The agent should check whether `.devflow.yaml` exists and whether GitHub repository and Project V2 are accessible. If not configured, it asks for the repository and Project number, verifies both, explains what will be saved, and requests approval.

Then say:

> /devflow project

The agent checks the status options `Backlog → Ready → In progress → In review → Done`. If differences are found, it proposes a plan. It must **not delete or remap unknown status options without review**, especially when items already exist.

Finally:

> /devflow next

The agent selects the highest-priority eligible Ready issue, checks safety and starts work in the *current* session without requesting a redundant start confirmation. This invocation authorizes only one safe task claim and branch preparation; destructive actions, paid services and independently permission-gated Git operations still require approval. No new AI session or paid API is launched by the CLI. A Claude/Codex interaction can still consume your subscription allowance and is not a technical guarantee against paid credits.

For installation and the complete CLI reference, continue with the sections below.

## 1. Prerequisites

For macOS, Linux, or Windows with a suitable shell:

- **Git**, with access to your GitHub repository.
- **Node.js 20+**, to run DevFlow's local CLI. This does not change your application's runtime.
- **GitHub CLI (`gh`)**, authenticated with access to the target repository. Project V2 commands require Project permissions.
- A GitHub repository you own or can administer. Start with a **disposable test repository** rather than an existing production project.
- **Optional:** Claude Code and/or Codex, installed separately. They are not needed to run DevFlow setup, tests, or dry runs.

Check your environment:

```bash
node --version
git --version
gh --version
gh auth status
```

Install the GitHub CLI using [cli.github.com](https://cli.github.com/) if needed. Authenticate using the official flow:

```bash
gh auth login
```

For Project V2 commands, your GitHub credentials must have suitable Project and repository scopes. If you receive a scope error, review the permissions of your connection and use the official CLI authentication/refresh flow. Do not paste credentials into `.devflow.yaml`, source code, or issues.

## 2. Download and validate DevFlow

Clone the repository anywhere convenient:

```bash
git clone https://github.com/vinimw/devflow.git
cd devflow
```

Run the zero-cost, local validation suite:

```bash
npm run validate
```

This runs:

```text
npm run check    JavaScript syntax validation
npm test         Unit tests with a simulated GitHub CLI
npm run smoke    Offline first-run test in a disposable temporary directory
```

The smoke test initializes a temporary project, tests no-overwrite behavior, installs the skill for both agents, and checks the financial preflight **without calling an AI model or GitHub API**.

> The repository is currently `private: true` in `package.json`: no npm publishing or global npm installation is required. All examples use `node /path/to/devflow/bin/devflow.mjs` directly. You may later install/link this local package with npm, but a published `npx devflow` package is **not** part of this release.

## 3. Create a test project

Open another terminal and choose paths. For example, on macOS:

```bash
mkdir -p ~/Projects/devflow-playground
cd ~/Projects/devflow-playground
git init
```

In the examples below, adjust the absolute DevFlow path and the GitHub repository name. The example `vinimw/devflow-playground` **must exist on GitHub before remote GitHub operations**.

You can create a disposable GitHub repository using the GitHub website or `gh repo create` after explicitly deciding to do so.

### 3.1 Preview initialization

```bash
node ~/Projects/devflow/bin/devflow.mjs init \
  --cwd ~/Projects/devflow-playground \
  --name DevFlowPlayground \
  --repo vinimw/devflow-playground
```

Without `--apply`, it only prints the plan. No files are written.

### 3.2 Apply initialization

```bash
node ~/Projects/devflow/bin/devflow.mjs init \
  --cwd ~/Projects/devflow-playground \
  --name DevFlowPlayground \
  --repo vinimw/devflow-playground \
  --apply
```

It creates files **only when absent**:

```text
devflow-playground/
├── .devflow.yaml
├── AGENTS.md
├── CLAUDE.md
└── .github/
    └── ISSUE_TEMPLATE/
        └── devflow-task.md
```

Review `.devflow.yaml` and your project's existing instructions before continuing. Repeating `init --apply` skips existing files; `--force` is an explicit overwrite option, **never use it without reviewing local changes**.

### 3.3 Diagnose your setup

```bash
node ~/Projects/devflow/bin/devflow.mjs doctor \
  --cwd ~/Projects/devflow-playground
```

`doctor` checks config, Git, `gh`, authentication, the configured repository, and any configured Project. It may warn that no GitHub Project exists yet — that is expected before step 4.

## 4. Prepare GitHub Projects V2

**Always preview before writing to GitHub.**

### 4.1 Preview repository labels

```bash
node ~/Projects/devflow/bin/devflow.mjs github plan \
  --cwd ~/Projects/devflow-playground
```

### 4.2 Create missing labels

```bash
node ~/Projects/devflow/bin/devflow.mjs github setup \
  --cwd ~/Projects/devflow-playground --apply
```

DevFlow uses `priority:P0`–`priority:P3`, `project:<area>`, and `type:<type>` labels. It does not automatically replace existing label settings.

### 4.3 Preview or create the board

```bash
node ~/Projects/devflow/bin/devflow.mjs github project plan \
  --cwd ~/Projects/devflow-playground

node ~/Projects/devflow/bin/devflow.mjs github project setup \
  --cwd ~/Projects/devflow-playground --apply
```

When the project number is unset, DevFlow looks for a project with the same name under the configured owner. If none exists, applying setup creates one. The new project receives the five status choices and the CLI stores its number in `.devflow.yaml`.

**Existing boards are not silently rewritten.** If their Status options differ, DevFlow refuses to change them automatically. The GitHub Project V2 create/Status mutation still needs a **live test on a disposable board**; passing simulated tests does not prove the GitHub API integration works against every account or CLI version.

## 5. Create and manage a task

### 5.1 Prepare a task specification

Use the template in `templates/github/issue-template.md`. Required sections include Summary, Context, Scope, Dependencies, Acceptance Criteria, Validation, and the technical implementation guidance. Acceptance Criteria must include at least one checkbox.

Save it as `task.md` in the target project, then preview:

```bash
node ~/Projects/devflow/bin/devflow.mjs task create \
  --cwd ~/Projects/devflow-playground \
  --title "feat(web): add a welcome screen" \
  --body-file task.md \
  --priority P2 --area web --type feature
```

After confirming the preview:

```bash
node ~/Projects/devflow/bin/devflow.mjs task create \
  --cwd ~/Projects/devflow-playground \
  --title "feat(web): add a welcome screen" \
  --body-file task.md \
  --priority P2 --area web --type feature --apply
```

The issue is created and synchronization to Backlog is attempted. If issue creation succeeds but board synchronization fails, **do not rerun create** — use `github sync --issue NUMBER --apply` for the existing issue.

### 5.2 Approve, select, and claim

On the Project board, manually move the task from **Backlog** to **Ready**.

```bash
node ~/Projects/devflow/bin/devflow.mjs task next \
  --cwd ~/Projects/devflow-playground

node ~/Projects/devflow/bin/devflow.mjs task next \
  --cwd ~/Projects/devflow-playground --issue 123 --apply
```

Replace `123` with the actual issue number. DevFlow selects the highest-priority eligible Ready task. It also checks dependencies and refuses new work if another task is In progress or In review.

**Do not run competing workers:** GitHub Project status updates alone do not provide an atomic lease/lock.

### 5.3 Prepare the branch, work, and open a PR

```bash
node ~/Projects/devflow/bin/devflow.mjs task branch \
  --cwd ~/Projects/devflow-playground --issue 123 --apply
```

This requires a clean worktree and an `origin` remote pointing to the configured repository. It creates a task branch from the current default branch. It does **not** implement the task, run validation, commit, or push.

Implement and validate using your preferred developer tools. Follow GitHub Flow and Conventional Commits. Once the changes have been committed and pushed with your explicit approval:

```bash
node ~/Projects/devflow/bin/devflow.mjs task pr \
  --cwd ~/Projects/devflow-playground --issue 123 --apply
```

This opens a **draft PR**, without merging it.

When the PR is ready to be reviewed and correctly linked to the issue:

```bash
node ~/Projects/devflow/bin/devflow.mjs task review \
  --cwd ~/Projects/devflow-playground --issue 123 --pr 45 --apply
```

After the owner reviews and merges the PR and required checks are green:

```bash
node ~/Projects/devflow/bin/devflow.mjs task complete \
  --cwd ~/Projects/devflow-playground --issue 123 --pr 45 --apply
```

DevFlow verifies the actual PR merge before marking the issue Done and closing it.

## 6. Install the skill in your project

To make the instructions available to the agents directly from your project:

```bash
node ~/Projects/devflow/bin/devflow.mjs agent install \
  --cwd ~/Projects/devflow-playground
```

This previews the installation. To apply it:

```bash
node ~/Projects/devflow/bin/devflow.mjs agent install \
  --cwd ~/Projects/devflow-playground --apply
```

The default installation adds the same skill to both agents:

```text
devflow-playground/
├── .agents/skills/devflow/SKILL.md
├── .agents/skills/devflow/references/
├── .claude/skills/devflow/SKILL.md
└── .claude/skills/devflow/references/
```

To install only one variant, pass `--provider codex` or `--provider claude`.

Existing differing skill files **will not be overwritten**. If you need to update a previously installed version, compare and update its tracked files explicitly.

### Using the skill from Codex or Claude Code

Open the target project in the agent's supported interface. You can ask:

> Use the DevFlow skill to audit this repository and show me the next eligible Ready task. Do not make changes until I authorize them.

Or:

> Follow the DevFlow skill and the current issue's acceptance criteria. Implement on the task branch, run validations, and prepare a PR. Do not merge or enable paid usage.

The agent must have the skill installed/discoverable and access to the repository, local files, and required GitHub tools. Installing the skill itself does **not** install Claude Code or Codex or grant GitHub permissions.

## 7. Generate an issue-specific handoff (optional)

After the task is **In progress**, check the subscription safety preflight:

```bash
node ~/Projects/devflow/bin/devflow.mjs agent preflight \
  --provider codex
```

The preflight performs **no AI requests**. It reports that included-only usage cannot be confirmed programmatically.

Then preview or create a local task handoff:

```bash
node ~/Projects/devflow/bin/devflow.mjs agent handoff \
  --cwd ~/Projects/devflow-playground --issue 123 --provider codex

node ~/Projects/devflow/bin/devflow.mjs agent handoff \
  --cwd ~/Projects/devflow-playground --issue 123 --provider codex --apply
```

The file is saved under `.devflow/handoffs/`, for example `issue-123-codex.md`. Review and share its instructions in your **interactive** agent session. The handoff is not an executable agent job. By default its generated directory is ignored only when your target repository has that ignore rule; add `.devflow/handoffs/` to the target repository's `.gitignore` to prevent accidental commits.

## 8. Subscription-only AI cost policy

**DevFlow's own commands do not call AI providers or consume model tokens.** They use local files and, for the GitHub operations you explicitly request, the GitHub CLI.

However, **a ChatGPT or Claude subscription login alone is not a technical guarantee of zero extra charges**. Depending on the provider, account configuration, and current allowances, additional usage may draw from purchased credits or require a paid continuation.

Before using an interactive AI agent:

1. Use the provider's official subscription login; avoid API-key/pay-as-you-go authentication.
2. Check remaining included allowance and any available purchased credits in the provider's official account interface.
3. Disable automatic reload/top-ups and any supported option to continue with paid usage.
4. Do not buy credits or paid resets for DevFlow. When a limit or payment request appears, stop.
5. If you require an enforceable included-only spending guarantee and no supported provider control can verify it, **do not run the AI request**.

The preflight detects certain API-key environment variables but cannot inspect billing controls or prove which allowance a future agent request will consume. DevFlow does **not** run unattended AI automation, proxy session credentials, or work around provider terms.

For details, see [subscription safety](skills/devflow/references/subscription-safety.md) and [agent usage](docs/AGENTS.md).

## 9. Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node: command not found` | Install Node.js 20+ and reopen the terminal |
| `gh: command not found` | Install GitHub CLI and verify `gh --version` |
| GitHub access denied | Run `gh auth status`; check repository/Project permissions |
| `Missing .devflow.yaml` | Run `init --apply` and inspect the generated config |
| Project status mismatch | Do not rewrite an active board; reconcile its Status options manually |
| No eligible Ready issue | Check labels, issue sections, dependencies, and active WIP |
| Dirty Git worktree | Commit or safely preserve changes before `task branch --apply` |
| Existing skill differs | Inspect the differences; installer intentionally refuses overwrite |
| Handoff rejected for API keys | Remove API credentials from the *agent* environment and verify subscription login |
| No zero-extra-cost assurance | Do not start an AI request; inspect provider account settings |
| `npm run smoke` fails | Run the command locally and inspect output; it never touches a real GitHub Project |

## 10. Technical documentation

- [Project architecture and roadmap](docs/ARCHITECTURE.md)
- [CLI v0.2 setup details](docs/CLI.md)
- [GitHub Projects V2 and issue synchronization](docs/PROJECTS_V2.md)
- [Task lifecycle and merge requirements](docs/TASK_LIFECYCLE.md)
- [Agent handoff and financial controls](docs/AGENTS.md)
- [Branch protection and required CI](docs/BRANCH_PROTECTION.md)
- [DevFlow skill definition](skills/devflow/SKILL.md)

## Security and limitations

- No automatic merge, branch-protection bypass, API-key extraction, paid provider fallback or background controller.
- GitHub Project status operations are not atomic; use a single operator until an explicit lock/lease is implemented.
- The current CLI has mocked GitHub integration tests. **Live creation and mutation of a disposable GitHub Project should be validated before relying on it in an active repository.**
- Generated repository policy files should be reviewed and adapted, never copied over existing rules without inspection.
- The target project's language, stack, dependencies and tests are not dictated by DevFlow.

The first complete real-world trial should use a disposable repository and Project with one test issue. Only after the trial is verified should DevFlow be installed in an existing production project.
