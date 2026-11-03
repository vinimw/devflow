# GitHub Projects V2 setup — DevFlow v0.3

The DevFlow CLI can **create or reuse** a GitHub Project V2, configure its initial five Status choices and synchronize individual existing repository issues. It does not create issues or change an already-active task's status.

## Requirements

- Node.js 20+ (CLI only)
- GitHub CLI `gh` installed and logged in
- `gh auth refresh -s project,repo` if the current login lacks Project V2 or repository permissions
- An existing target repository and a reviewed `.devflow.yaml` generated with `devflow init --apply`
- Use a recent version of `gh` with `project` subcommands and JSON output

Always verify the repository owner, project name and `github_project_number` before using `--apply`.

## Preview and configure the project

From the target repository:

```bash
node /path/to/devflow/bin/devflow.mjs github project plan
node /path/to/devflow/bin/devflow.mjs github project setup --apply
```

With an explicit path:

```bash
node /path/to/devflow/bin/devflow.mjs github project plan --cwd /path/to/target
node /path/to/devflow/bin/devflow.mjs github project setup --cwd /path/to/target --apply
```

When `github_project_number` is set, DevFlow uses that exact Project.

When unset, it searches Projects owned by the configured repository owner for an **exact title match**. A unique match is reused; multiple matches or unexpectedly large result sets fail closed. If no match exists and `--apply` is specified, DevFlow creates a new project. It persists the resulting project number to the target `.devflow.yaml`. Only a **new** project receives automatically configured Status options:

`Backlog → Ready → In progress → In review → Done`

Existing boards with differing Status options are **not rewritten**. Adjust the board manually or select a different project, then retry. This avoids silently changing work already in progress.

A newly created project is linked to the repository where supported. If linking fails, the command reports a warning rather than pretending the association succeeded.

## Synchronize one issue

```bash
node /path/to/devflow/bin/devflow.mjs github sync --issue 123
node /path/to/devflow/bin/devflow.mjs github sync --issue 123 --apply
```

The preview is read-only. Applying:

1. Verifies that issue #123 belongs to the configured repository and is open.
2. Checks that the configured project and five Status options are valid.
3. Searches for the existing item by exact issue URL.
4. Preserves existing items **and their existing status**, even if Ready, In progress or In review.
5. Adds missing issues to the board and assigns **Backlog**.
6. Assigns Backlog to an existing item only when its Status is empty.

No issue creation, status promotion, task claim, PR or merge occurs. Re-running the command is intended to be safe. If an API request is interrupted after adding an item, run sync again so the controller rediscovers the item before changing status.

For huge boards, sync refuses to infer that an issue is missing if the item listing reaches its configured 1,000-item limit.

## GitHub setup sequence for a new project

```bash
node /path/to/devflow/bin/devflow.mjs init --name MyApp --repo owner/myapp --apply
node /path/to/devflow/bin/devflow.mjs doctor
node /path/to/devflow/bin/devflow.mjs github plan
node /path/to/devflow/bin/devflow.mjs github setup --apply
node /path/to/devflow/bin/devflow.mjs github project plan
node /path/to/devflow/bin/devflow.mjs github project setup --apply
node /path/to/devflow/bin/devflow.mjs github sync --issue 123 --apply
```

The first `github setup --apply` manages missing **labels only**; the new `github project setup --apply` manages the board. The issue sync command must be called explicitly per issue. Automatic GitHub Actions intake and task-execution scripts remain out of scope for this release.

## Verification and limitations

Run `npm run check` and `npm test` in the DevFlow repository. The simulated GitHub CLI covers idempotency and status preservation, but a live project create/link/Status mutation and live issue sync must be verified against a disposable test repository before trusting it with an established project.

DevFlow never copies credentials from another repository, enables paid AI services, bypasses repository rules or performs autonomous merges.
