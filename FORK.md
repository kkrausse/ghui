# kkrausse/ghui Fork Notes

This repository is a fork of [`kitlangton/ghui`](https://github.com/kitlangton/ghui).
It is the user's active local GHUI implementation, with ongoing workflow and
native Linear workspace improvements. Some changes may be proposed upstream
later; preserving the local fork is the default.

## Canonical Local Baseline

- Checkout: `/Users/kevinkrausse/Documents/kkrausse/ghui`.
- Local development branch: `fork-workflow-improvements`. Continue new work from
  this branch rather than treating `main` as the development baseline.
- Remotes: `origin` = `kkrausse/ghui`, `upstream` = `kitlangton/ghui`.
- Git's `origin/HEAD` currently names `origin/main`. The local development policy
  above does not change GitHub's default branch, publish local commits, or imply
  that this branch is pushed/tracking a remote branch.
- `~/.bun/bin/ghui` resolves through Bun's global package link to this checkout.
  Currently `bin/ghui.js` finds no installed platform binary and runs
  `bun src/standalone.ts`, so source changes are used on the next launch.
- `/opt/homebrew/bin/ghui` is a separate upstream installation. Do not replace
  the fork with it or run `ghui upgrade` as part of local development.

## Status

The full Linear TUI has been copied into `src/linearWorkspace` and is being
integrated as a native Linear tab. This migration is recorded in local checkpoint
commits only: no push or publication. The original app is retained pending parity/security
audits. See `plans/linear-workspace-migration.md` for scope and follow-up work.

The URL-only pull request copy command and context-aware process title are
implemented on the fork branch.

## Planned Differences

### Copy only the pull request link — implemented

**Why:** ghui's existing `y` command copies several lines of pull request
metadata, including the URL. Sometimes the URL alone is needed for chat,
documents, or issue trackers.

**What to ship:**

- Add a command-palette action named **Copy pull request link**.
- Copy only the selected pull request's `url` value to the system clipboard.
- Make the action available anywhere a pull request is selected, including the
  queue and pull request detail views.
- Show a brief success notice after copying and preserve the existing clipboard
  error handling.
- Add `Shift+Y` as the direct keyboard shortcut. In the queue, `y` remains
  assigned to **Copy pull request metadata**. In description/comments, `y`
  copies the selected conversation link; metadata remains in the palette.
- Include the action in relevant footer hints without overcrowding narrow
  layouts.

**Likely implementation areas:**

- `src/commands/builtins.ts` for the command definition.
- `src/services/Clipboard.ts` for the existing cross-platform clipboard service
  (no new clipboard implementation should be needed).
- `src/keymap/` and `src/hooks/useKeymapWiring.ts` for dispatching the shortcut.
- `src/ui/FooterHints.tsx` for discoverability.
- Command, keymap, and clipboard-related tests under `test/`.

### Context-aware process title — implemented

**Why:** terminal tabs and window switchers currently do not identify which
repository or pull request is open.

**What to ship:**

- Use `ghui` as the default terminal title.
- In a repository workspace, show `ghui — owner/repository`.
- While a pull request detail view is active, show
  `ghui — owner/repository #123`.
- Keep the title synchronized when navigating between repositories, pull
  requests, and views, and restore it cleanly when leaving a detail view or
  exiting the app.

The fork updates both the OS process title and the terminal tab/window title,
rather than the npm package description or an extra heading inside the TUI.

**Likely implementation areas:**

- Workspace selection and detail-view atoms under `src/workspace/` and
  `src/ui/detail/`.
- A small terminal-title lifecycle service or hook, using the renderer API when
  available and a carefully scoped terminal escape sequence otherwise.
- Tests for title derivation and navigation transitions.

## Open Questions

1. Should issue detail views receive the same link-copy and terminal-title
   behavior in a follow-up?

## Local Development

From this checkout:

```bash
bun install
bun run build:cli
bun link
ghui
```

`bun link` exposes this checkout as `ghui` through Bun's bin directory. To run
the source explicitly without relying on the linked command:

```bash
bun run dev
```

For offline UI development with generated data:

```bash
bun run dev:mock
```

## Keeping the Fork Current

The `origin` remote is `kkrausse/ghui`, and `upstream` is `kitlangton/ghui`.
Upstream synchronization is a deliberate maintenance task, not a prerequisite
for each local change; do it only when requested, preserving local work. Keep
the fork notes accurate as decisions change. Once a feature ships, move it from planned
to an implemented-differences section and link its commit or pull request.
