# Creating and maintaining tasks

Inspect repository source, documentation and existing issues before writing new work. Avoid duplicates and microtasks.

## Required issue headings
Summary; Context; Objective; Scope; Technical Requirements; Expected Files / Modules; Implementation Guidelines; Dependencies; Acceptance Criteria; Validation; Out of Scope; AI Agent Notes.

## Classification
Apply one priority (`priority:P0` to `priority:P3`), one area (`project:<area>`) and one type (`type:feature`, `type:bug`, `type:refactor`, `type:documentation`, `type:chore`, `type:infrastructure`). Verify these labels exist; do not silently invent them.

New tasks belong in Backlog. Never silently promote to Ready. Use *real GitHub issue numbers* when referencing dependencies; roadmap IDs are not issue numbers.

If an available connector can create issues but cannot mutate Projects V2, explain that limitation and provide a separate board synchronization plan.

Specify user-visible acceptance criteria, validation commands and exclusions. Disclose any checks not actually performed. Avoid fake links, screenshots or results.
