# Repository agent instructions

Use DevFlow skill for GitHub task management and Git workflow, together with repository-local requirements.

- Read `.devflow.yaml` and local architecture documentation before acting.
- GitHub Flow; `main` is the default permanent branch unless explicitly configured otherwise.
- Task states: Backlog → Ready → In progress → In review → Done.
- Select only Ready, eligible work; respect priorities, dependencies and concurrency.
- Branch: `<type>/<issue-number>-<kebab-case>`.
- Commit: Conventional Commits in English.
- Validate changes and disclose skipped checks.
- PR to default branch, no automatic merge without explicit authorization and security gates.
- Never overwrite local work or expose secrets; pause on destructive, security, architectural or billable decisions.

Project-specific approved rules go below; do not blindly copy product or stack details from another project.
