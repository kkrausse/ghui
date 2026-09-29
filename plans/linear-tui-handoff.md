# Linked PR navigation from linear-tui

## Why

My Issues should show each ticket's associated PRs as selectable child rows,
including status, and reuse this local GHUI fork for GitHub navigation rather
than building a second PR viewer. This is an exploratory design, not approval
to implement either application.

## What we'd ship

Example Linear list:

```text
BACKEND-1234  Fix rate limit
  ├─ ◐ scheduler-service #456 · in review · 2 approved
  └─ ◌ tax-engine #789 · draft
BACKEND-1235  Add validation
```

- Initially scope child rows to My Issues, expanded by default; Space can
  collapse/expand an issue. Keep existing grouping and pagination.
- Up/down moves through issues and PR children, skipping group headers.
- Selecting a PR keeps the list visible. Right/Enter opens that exact PR in
  GHUI in the same terminal, initially at its description/conversation.
- GHUI retains its existing arrows, diff, comments, Actions, and fork customizations.
- Left/Escape at the integration's root returns to Linear; nested views first
  use GHUI's normal back navigation. `q` exits GHUI, not the parent Linear app.
- Linear restores its selected child, scroll, grouping, and expansion state.
- Browser opening remains available; absent GHUI should not prevent Linear startup.

## API / architecture mapping

### Linear: rows and data

In `kevin-scripts/linear-tui`, `git.ts` already normalizes attachments into
`GitLink` values with PR URL, number, repository, state, reviews, and conflicts.
Use those list-query results for immediate child rows; no per-issue GitHub
request is needed. Treat these statuses as integration snapshots, not guaranteed
live GitHub state. Parse owner/repository from a validated GitHub PR URL rather
than assuming the metadata's repository name is fully qualified.

`ui/IssueList.tsx` currently renders group and issue rows; `app.tsx` and
`views.ts` navigate issue indices. Introduce one shared flattened row model
with group/issue/PR variants for rendering, movement, scrolling, and clicking.
Use stable occurrence keys (group + issue + PR) because label grouping repeats
issues. Separate selected row from its owning issue. Issue mutation shortcuts
must not accidentally run on PR rows. Keep pagination based on issues, not
the expanded child count; reconcile selection by key after refresh/collapse.

### GHUI: proposed public launch contract

```sh
ghui pr https://github.com/owner/repository/pull/123 --return-on-back
```

This command does not exist today. Add argument handling in `src/standalone.ts`
and equivalent source-launch support. Pass an explicit initial target into the
app bootstrap, then reuse `GitHubService.getPullRequestDetails`, keyed loaders,
and existing PR surfaces/keymaps. Load the exact PR even if merged/closed or
absent from the normal open-PR queue. Avoid fetching all home queues just to
reach the initial target. Define an integration root for return-on-back rather
than making every Escape exit; pending review/composer guards still apply.

### Terminal handoff and dependency

Linear suspends its renderer, launches GHUI with inherited terminal stdio,
awaits exit, and resumes in a finally block. Explicitly restore title, mouse
and keyboard protocols, terminal size, and repaint. Handle spawn failure,
nonzero exit, and signals without leaving the parent terminal broken. GHUI
already uses this suspend/subprocess/resume pattern for its editor handoff.

Prefer an optional runtime dependency on the locally linked fork executable,
with a configurable executable path. Do not shell-interpolate PR URLs. This
reuses the existing Bun link without hardcoding a global node_modules path.
A development symlink to the fork, or a pinned Git submodule under vendor/,
can later provide reproducible source/build inputs without changing the launch
contract. Avoid copying the working fork: it contains uncommitted custom work.

### Alternative: actual inline GHUI embedding

If merely highlighting a child must display GHUI inside Linear's detail pane,
extract a supported PR-workspace component with target, focus, and onBack props.
GHUI would supply its Effect registry/runtime, keyed state, and keyboard scope;
Linear would own the single renderer, layout, title, and outer navigation.
Today the installed GHUI package is CLI-only (no library exports), its PR
surface takes extensive app-owned state, and OpenTUI versions differ (GHUI
0.4.2 versus Linear 0.5.12). Align renderer/React dependencies and isolate GHUI
startup side effects before embedding. Vendoring alone solves none of these.

## Open questions

- Is explicit full-screen handoff acceptable, or is selection-driven inline
  preview essential? These are different implementation scopes.
- Show merged/closed children always, or hide them behind expansion?
- Is refresh-on-return of Linear metadata sufficient initially, or should a
  later version hydrate visible row status directly from GitHub?
- Does v1 require linked PR titles/CI summaries beyond today's attachment fields?
- Use the existing PATH link for local experiments, or pin the fork for distribution?

## Out of scope (for v1)

- Embedding another TUI through an emulated terminal/PTY pane.
- Copying/forking GHUI UI inside Linear or publishing an embeddable package.
- Automatically launching an interactive child whenever selection moves.
- Automatic Git checkout, new auth mechanisms, or background PR mutations.
- Live status polling for every issue's PRs.

## Validation

Test flattened navigation, grouping duplicates, collapse, page boundaries, and
selection restoration. Test exact open/merged/closed PR launch and guarded back
navigation. Verify the handoff in a real PTY both inside/outside tmux, including
resize, repeated open/return, missing executable, crash, and Ctrl+C.

## Status

Superseded by `linear-workspace-migration.md`: the chosen direction is migrating
the full Linear app into GHUI, not a CLI handoff. Retained as design history.
