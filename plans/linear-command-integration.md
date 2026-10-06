# Linear command integration

## Why

Linear currently bypasses the host command palette and keymap. Its actions need
to be discoverable through the same registry without losing retained navigation,
input ownership, or triggering unrelated GitHub actions.

## What

1. Enable the shared Ctrl+P / Cmd+K palette in Linear, and give host modals
   exclusive keyboard ownership while preserving the visible Linear workspace.
2. Register Linear navigation, refresh, search, grouping, help, and linked-PR
   expansion commands in the existing registry. Publish availability from the
   mounted workspace and use the existing imperative handoff mechanism for its
   React-owned actions. Shortcuts and palette actions share implementations.
3. Follow up by moving remaining issue/project/comment actions and pane navigation
   into explicit keymap contexts, then reduce the monolithic Linear key handler.

## API mapping

No new API calls or mutations. `commands/linear.ts` supplies command definitions
and atom-backed availability. The lazy Linear surface owns handoff registration;
the Linear app exposes live actions through a typed boundary. The host continues
to own modal rendering, palette search/paste, dispatch, and workspace switching.
Do not migrate all Linear state into Effect atoms merely to expose commands.

## Open questions

- Preserve `?` as Linear's full help initially; Ctrl+P / Cmd+K is the shared palette.
- Issue edits need existing permission checks and explicit composer/picker flows,
  not synthetic key events or direct API mutations from palette commands.
- Generic cross-workspace back navigation remains a separate follow-up.

## Status

Phase 1 implemented locally. Ctrl+P / Cmd+K now uses the host keymap, shared modal,
and Effect dispatch. Nine Linear actions are registered with live availability;
unrelated GitHub commands are hidden and rejected by dispatch in Linear. Palette
input does not trigger Linear shortcuts or numeric host-tab changes. Both palette
entry keys and expansion/collapse are covered by a host render regression.

Validation: all 66 test files pass when run in separate processes, plus typecheck,
lint, formatting, and CLI build. The combined `bun run test` run has cross-file
render/mock interference and timed out; process isolation avoids that interference.

Terminal Control verification also passed in a real OpenTUI PTY with two mocked
issues: Shift+Space expands/collapses both, Space toggles one, a partially expanded
list expands fully, palette expand/collapse works, and collapse returns a selected
PR child to its own parent. Ctrl+P and the terminal's Meta+K sequence open the host
palette. Typing `2 status` stays in the palette without switching tabs or opening
an edit picker; Ctrl+P does not interrupt Linear's search input. The shared modal
also fits after resizing from 140x42 to 80x24. Modifier keys were sent as Kitty
keyboard sequences because termctrl has no named Shift+Space input. Mock mutations
were explicitly blocked, and the verification session was stopped afterward.

Follow-up live verification used the actual Bun-linked launcher, normal credentials,
and real My Issues data with no mock/preload. Bulk expansion changed 18 issue rows
to 39 selectable rows, and palette collapse restored the issue-only list. The same
launcher was also checked through tmux 3.4 with extended-key capability enabled.
The user's machine-local `~/.tmux.conf` now enables `extended-keys on` and advertises
`extkeys` for xterm-256color/xterm-ghostty; the live server option was applied without
reloading unrelated config. Existing clients need reattachment to negotiate the
new terminal capability. Test-owned sessions were stopped; no issue edits were made.

Actual browser-keyboard follow-up found that `extended-keys on` alone was insufficient:
tmux 3.4 advertises `CSI >4;1m`, and Ghostty/ghostty-web encode Shift+Space as plain
byte 32 in that mode. Machine-local `Eneks` overrides now request mode 2. GHUI asks
for full Kitty key reporting for direct native terminals, and requests/cleans up
modifyOtherKeys mode 2 through tmux on startup, suspend, resume, and exit. Bulk
expansion is now view-wide, including sidebar focus.

Browser Control on the user's actual terminal page verified trusted `Shift+Space`
events, not injected byte sequences: outgoing data changed from plain byte 32 to
`CSI 27;2;32~`, and the real issue list expanded 18→39 rows then collapsed 39→18.
Plain Space expanded only one issue (18→19); partial bulk expansion and typed
palette collapse also worked. No web-terminal code changes or issue edits were
needed. Native Ghostty clients must reattach to pick up the mode-2 override.

Remaining action/keymap migration is deliberately staged rather than a wholesale
replacement of the retained Linear workspace. Next: selected-issue actions and
project/comment workflows, then pane navigation/prefix keys as typed contexts.
