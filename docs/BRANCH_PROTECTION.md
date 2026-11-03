# Protect the main branch

The repository's `protect-main` ruleset already requires Pull Requests, blocks branch deletion and force pushes, and requires review conversations to be resolved.

## Required CI check

Once `.github/workflows/ci.yml` has run successfully on a PR:

1. Open **Settings → Rules → Rulesets → protect-main**.
2. Add **Require status checks to pass**.
3. Add the GitHub Actions check **CLI checks** (from workflow **DevFlow CI**) as required, with **GitHub Actions** as the expected source if offered.
4. Keep **Require a pull request before merging** with zero required approvals initially for a solo-maintained repo, unless you have an available reviewer.
5. Keep **Block force pushes**, **Restrict deletions**, and **Require conversation resolution**.
6. Save and verify that a PR with a failed or pending check cannot merge.

Do not configure a check as required before it has been reported at least once, because GitHub may not offer it in the required-status picker yet.

If the `CLI checks` status is unavailable, open the Actions page, run **DevFlow CI** using `workflow_dispatch`, and check its check-run name. Select the exact name that GitHub reports.

## What the workflow validates

- `npm run check`: syntax checks for CLI entrypoints.
- `npm test`: built-in Node.js test runner for CLI scaffolding and dry-run protections.
- CLI help entrypoint works.

This workflow has read-only GitHub permissions. It requires no API keys or billable AI services. It runs on PRs to main, on main pushes and on manual dispatch.

## Scope and caveats

- CI cannot replace a manual review of GitHub write operations against a disposable repository.
- It does **not** validate a real GitHub Projects V2 setup; the v0.2 CLI only creates missing labels.
- Never bypass a failing required check. Correct the error and rerun the workflow.
