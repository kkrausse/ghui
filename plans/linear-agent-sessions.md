# Agent sessions under Linear tickets

## Why

Agent sessions working on a ticket should sit next to its PRs, and be opened or
started without leaving GHUI.

## What we'd ship

- faplex sessions nest under their ticket after its PRs, in every ticket list
  and project preview. A session belongs to a ticket by tag, or by the ticket id
  in its title, status line or directory.
- `→`/`enter` on a session hands the terminal to `faplex open`; `←` at its empty
  prompt or `ctrl+]` returns.
- `n` on a ticket picks machine × harness, then a directory, takes optional
  instructions (Enter sends), and runs `faplex new --background` with them plus
  the ticket's id, title and link, tagged with the ticket. GHUI stays on the
  page; only a trust prompt takes the terminal.
- Rows use faplex's marks and colors; archived sessions are hidden.

## API / architecture mapping

`faplex watch --json` (one child per GHUI) streams the session list;
`faplex.ts` indexes it by ticket id and `buildIssueRows` adds `session` rows.
Opening and starting reuse `withTuiSuspended`. faplex owns harnesses,
machines, panes and tags; GHUI owns the picker.

Opening relays the terminal over the watch's socket to a client the watch
keeps (faplex `held.ts`); the session under the cursor is warmed after 250ms.
Opening went from ~7s (faplex open, waiting for the first listing) to ~1.3s
(`--open`) to ~0.2s (warmed or reopened).

## Open questions

- faplex's dashboard and `held.ts` carry two copies of the pane logic (ready
  probe, leave check, mode restore); unify if either changes.
- Editing the start directory in the picker; today it offers the ticket's
  session dirs, the machine default and recent session dirs.

## Status

Shipped locally on `fork-workflow-improvements`, with faplex `0d9c7c7`.
