# Executing an approved task

1. Read repository agent policy and issue specification. Check Ready status, priority, dependencies, open PRs and area availability.
2. Verify clean/safe Git state. Fetch the default branch; fast-forward only. Create or reuse the approved issue branch without overwriting changes.
3. Implement only the issue's scope using the repository's stack and Docker/deployment standards.
4. Run relevant validation. Respect policy excluding unit tests when applicable; mandatory integration checks cannot be silently skipped.
5. Review the diff for credentials, unrelated changes, unexpected dependencies, destructive steps and high-risk policy files.
6. When approved, commit using Conventional Commits, push to task branch, open or reuse a **ready-for-review (non-Draft)** PR into the default branch, and link the issue. Do not publish an unvalidated change as ready; resolve blockers or report them before PR creation.
7. Move to In review only once PR exists. Do not mark Done until the merge and status reconciliation are verified.
8. Stop and ask for decisions on architecture, financial commitments, sensitive access, destructive operations or blockers.

On interrupted work, preserve files/branches and describe safe recovery.
