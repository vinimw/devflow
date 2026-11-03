# DevFlow v0.5 — supervised subscription agents

DevFlow is a reusable skill and workflow tool for **interactive Claude Code and OpenAI Codex sessions**. This release intentionally does **not** invoke AI providers: `agent` commands only check local configuration, copy skill files, or produce a prepared issue handoff.

## Financial policy — included subscription allowance only

The desired spending policy is **no incremental AI charges, no API usage, no purchased credits and no automatic top-ups**.

An official ChatGPT subscription sign-in or Claude Code subscription sign-in is not proof that a particular request will be billed exclusively against included allowance. In particular, usage may continue using purchased credits when available. No supported, machine-readable pre-request spending attestation is available to DevFlow.

Therefore:

- DevFlow does not launch `codex`, `claude`, `codex exec`, API requests or unattended AI agents.
- No API provider fallback, purchased credits, paid resets, browser scraping or token extraction is implemented.
- `agent handoff` rejects execution when known API credential variables are present in the process environment. This is **not** a complete billing firewall; local environment checks cannot prove the agent's eventual account mode.
- Before starting an interactive agent, the operator must verify official subscription sign-in, remaining included usage, purchased-credit balance, and available controls for disabling paid continuation/auto-reload.
- If included-only usage cannot be guaranteed, strict zero-extra-cost execution must stop. Generating a handoff is safe because it makes no AI request; manually running the agent is a distinct, operator-controlled decision.
- Do not use personal subscription credentials for unauthorized unattended automation. Follow each provider's current terms.

## Install the same skill into a project

From a checkout of the DevFlow repository:

```bash
node bin/devflow.mjs agent install --cwd /path/to/your-project
node bin/devflow.mjs agent install --cwd /path/to/your-project --apply
```

By default, the skill is installed into both project-scoped directories:

- `.agents/skills/devflow/` for Codex
- `.claude/skills/devflow/` for Claude Code

Use `--provider codex` or `--provider claude` to select one. Installation **does not overwrite** a conflicting version. To update a previously installed skill, inspect the changes first and use ordinary version-controlled file operations.

## Read-only subscription preflight

```bash
node bin/devflow.mjs agent preflight --provider codex
node bin/devflow.mjs agent preflight --provider claude
```

The output always reports `includedOnlyUsageAttestable: false` and `unattendedSafe: false`. It never tests credentials by calling an AI model, so it consumes no provider allowance. It checks known API-key environment variables and reports if they are present.

This cannot inspect account settings, authenticate with a provider or tell you how many subscription requests remain.

## Produce a task handoff

First approve the issue in GitHub Projects by moving Backlog → Ready, then claim it in DevFlow using the task CLI. The handoff requires that the issue be uniquely **In progress** on the configured board.

```bash
node bin/devflow.mjs task next --issue 123 --apply
node bin/devflow.mjs agent handoff --cwd /path/to/your-project --issue 123 --provider codex
node bin/devflow.mjs agent handoff --cwd /path/to/your-project --issue 123 --provider codex --apply
```

The handoff file is generated at `.devflow/handoffs/issue-123-codex.md`; it includes the verified issue, branch name, target base, required Git and validation rules, and an explicit financial warning. This file is not an executable script, and the generator never starts a provider. Existing files are not overwritten.

The user may read the handoff, inspect account billing controls, and copy it into an **interactive** session when the chosen provider's current policies and available included allowance permit. Never claim that this results in an enforceable zero-extra-cost guarantee.

## Testing

`npm run check` checks JavaScript syntax and `npm test` runs Node.js built-in tests for installation, idempotency, existing-file protection, handoff state checks, and API environment rejection. Live AI requests are **not** part of testing.

## Future releases

- More complete CLI diagnostics and opt-in project-safe handoff updates.
- Better detection of GitHub task state and branch race conditions.
- Potential interactive provider integration only if officially supported controls can enforce the user's billing policy.

This release does not copy DeepGrow's autonomous AI runner and does not enable auto-merge, background work or token handling.
