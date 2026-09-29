# Description / conversation selection

## Why

The expanded PR description includes comments but previously offered no comment
cursor. Copying a permalink and replying should work where the user is reading.

## What we'd ship

- One block cursor through Description → comments in displayed/threaded order.
  Up/Down and j/k move without wrapping; a full-height accent-colored left rail
  identifies the selected block. Header and body keep their normal colors and
  text weight, with no selected-header background. Reserve
  the gutter on unselected blocks to avoid layout shifts. Use the same rail in
  the separate comments view. Store selection by item and comment identity.
- PageUp/PageDown, Ctrl-U/Ctrl-D, Home/End, and the wheel scroll independently.
  Navigation reveals the selected block using measured layout. After scrolling
  away from selection, arrows pick up at the nearest visible block in that
  direction. Re-renders and refreshes do not trigger selection scrolling.
- `y` copies the selected comment's browser permalink; on Description it copies
  the item URL. Shift-Y retains its PR-link meaning regardless of selection.
  Copy metadata remains in the command palette (and retains its list binding).
- Click a comment header to select it, or its selected `[y Copy link]` action
  to copy. Markdown links continue opening normally. Unsynced comments and API
  URLs produce an unavailable-permalink notice rather than copying the PR URL.
- Enter on a selected comment reuses the existing reply editor. There is no new
  inline composer. Enter on Description and Escape retain existing exit behavior.
  The palette's existing Reply to comment action works on the same selection.
- Preserve Shift-R for PR review, e for open-in-editor, and x for close item.
  Comment edit/delete remain available through the palette or comments view.
- `c` remains an optional shortcut to the separate comments view, entering at
  the selected comment. That view also supports y for a permalink and Shift-Y
  for the PR URL.
- Keep issue-description arrows as scrolling: the combined conversation is
  currently a PR surface. Issue comments have copying in the comments view.

```text
  Description
    Update the retry behavior ...

  Conversation · 3 comments
› @alex · 2h ago                              [y Copy link]
    Can we cover the timeout case too?

    ↳ @robin · 1h ago
      Added a test for that.
──────────────────────────────────────────────────────────
↑↓ select  PgUp/PgDn scroll  y copy link  Enter reply
```

## API / architecture mapping

- `ui/comments/atoms.ts`: per-item stable selection, shared selected-comment
  resolution for detail and comments views.
- `ui/comments/useConversationSelection.ts`: measured blocks, imperative reveal,
  mouse selection, and navigation handoffs registered by the PR surface.
- `ui/CommentsPane.tsx`: selected inline headers and copy action.
- `keymap/detailView.ts`: separate block movement and viewport scrolling.
- `commands/builtins.ts`: shared permalink command and contextual Enter action.
- `hooks/useCommentsViewActions.ts`: preserve selected comment on entry.
- Reuse the existing reply editor and mutations, including quoted top-level
  replies and threaded review replies. No new API endpoints or composer UI.

## Open questions

None for this iteration. Reactions can be considered separately if requested.

## Out of scope (for v1)

- Reactions, an inline composer, and removing the separate comments view.
- Changing the compact description preview or adding an issue conversation.

## Status

Implemented in the local fork. Formatting, typecheck, lint, all 598 tests, and
the CLI build pass. Tests cover permalink targeting, stable selection after
insertion, unavailable API URLs, keybinding conflicts, and reuse of the reply
editor at narrow and wide terminal widths.
