# Plans

One markdown file per multi-commit feature or larger redesign. The aim is to capture _intent + design + open questions_ before the work starts so the implementer (Kit, an agent, or a contributor) can pick it up cold.

## Format

Each plan should cover:

- **Why** — the user-facing problem or feature gap it addresses.
- **What we'd ship** — bullet-level description of the user-visible end state.
- **API / architecture mapping** — concrete endpoints, services, atoms, types.
- **Open questions** — design choices that aren't decided yet.
- **Out of scope (for v1)** — what we're explicitly _not_ doing first time round.
- **Status** — `Not started` / `In progress` / `Shipped — see <commit/PR>`.

When a plan ships, leave the file in place and update the **Status** line so we can read the history.

## Index

- [`linear-workspace-migration.md`](./linear-workspace-migration.md) — local migration of the full Linear TUI into a native GHUI tab; supersedes the CLI-handoff proposal.
- [`linear-workspace-follow-ups.md`](./linear-workspace-follow-ups.md) — centralized navigation/commands, parity, link-routing and privacy/licensing follow-ups for the native workspace.
- [`linear-command-integration.md`](./linear-command-integration.md) — shared palette/registry integration implemented; staged migration of remaining Linear actions and keymap contexts.
- [`linear-ticket-list-prs.md`](./linear-ticket-list-prs.md) — linked PR dropdowns across all Linear ticket lists and project previews.

- [`linear-tui-handoff.md`](./linear-tui-handoff.md) — exploratory nested PR rows in Linear and a direct-PR handoff to GHUI; inline embedding alternative.

- [`conversation-selection.md`](./conversation-selection.md) — proposed block cursor and copy-permalink actions in the expanded description/conversation.

- [`pr-queue-tabs.md`](./pr-queue-tabs.md) — direct home tabs for authored, review-requested, assigned, and mentioned PR queues.

- [`native-markdown.md`](./native-markdown.md) — OpenTUI Markdown for PR descriptions and full conversations, with measured scrolling.

- [`diff-markdown-preview.md`](./diff-markdown-preview.md) — preview the complete updated Markdown file from a PR diff using the native terminal renderer.

- [`queued-reviews.md`](./queued-reviews.md) — pending diff-comment reviews and the submit/discard flow.
- [`edit-delete-comments.md`](./edit-delete-comments.md) — edit your own comments in place, delete with confirm.
- [`sqlite-cache.md`](./sqlite-cache.md) — persistent SQLite cache for queues, hydrated details, comments, and optional diffs.
- [`cache-v2.md`](./cache-v2.md) — audit-driven follow-up: diff cache, per-repo metadata persistence, `--cache-info` / `--cache-clear`.
- [`cache-v3.md`](./cache-v3.md) — issue queue cache, repo rollup query, repository-details prewarm.
- [`comments-pane-redesign.md`](./comments-pane-redesign.md) — living design doc exploring how the Comments pane should render. Multiple styles, fully specced, iterate freely.
- [`repo-workspace-home.md`](./repo-workspace-home.md) — repository-oriented shell with Pull Requests and Issues as first project surfaces.
- [`workspace-hub-and-filters.md`](./workspace-hub-and-filters.md) — escape hatch from repo scope, global/repo filters, and hub navigation mockups.
- [`surface-aware-loading.md`](./surface-aware-loading.md) — active-surface loading, progressive hydration, and local API telemetry.
- [`diff-rendering-performance.md`](./diff-rendering-performance.md) — semantic diff rows, viewport-windowed rendering, and syntax-plus-word-diff highlighting.
- [`app-tsx-decomposition.md`](./app-tsx-decomposition.md) — carve the 3,000-LOC App.tsx into a thin shell + per-surface modules + capability modules + a data-driven command registry.
- [`app-shell-deepening.md`](./app-shell-deepening.md) — follow-up: shrink the 1,400-LOC `useAppShell` God-hook into App-shell infrastructure + per-Surface shells, with commands reading atoms via registry.
- [`item-load-deepening.md`](./item-load-deepening.md) — consolidate the shared PR/Issue load, pagination, cache, and displayed-selection engine.
- [`open-in-editor.md`](./open-in-editor.md) — open a PR in a configurable editor command (nvim/diffview/octo, code, …) via `e`, with `repoPaths` mapping and TUI suspend/resume.
- [`pr-runs-view-mockups.md`](./pr-runs-view-mockups.md) — UI mock-ups for the per-PR GitHub Actions runs view.
- [`github-actions-runs.md`](./github-actions-runs.md) — per-PR workflow runs view (`a`): runs list → jobs/steps/log investigation, as a diff-view-peer PR view mode.
