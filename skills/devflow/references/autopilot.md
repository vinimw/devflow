# Optional autonomous orchestration

This is a **policy reference, not an executable background agent**.

A durable Autopilot requires a separately installed controller with persistent checkpoints, singleton lock, approved Ready selection, isolated worktrees, provider calls, bounded retry/backoff, validation, independent review, PR/merge gates, recovery and human escalation.

Default to disabled, dry-run, auto-merge off, one task and strict runtime/task limits. Never promote Backlog. Never bypass GitHub branch protections, fake approvals or use an unrestricted Docker socket without separate authorization.

## Strict billing protection
ChatGPT subscription authentication and API billing are different. Subscription sign-in by itself cannot guarantee that only included allowance is used if purchased credits or paid resets may be consumed. Do not promise zero extra charge without a supported enforceable control. For strict zero-extra-cost demands, fail closed when reliable spending enforcement is unavailable.

An Autopilot implementation should be independently reviewed, with a separate PR and explicit activation, project-specific credentials, financial controls and real-world validation. Never copy DeepGrow Project #3 IDs, personal credentials or service volumes into a new repo.
