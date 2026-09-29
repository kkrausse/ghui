# Rendered Markdown from diffs

## Why

Documentation reviews are hard to judge from changed Markdown source alone. A
reviewer should be able to preview the complete file at the pull request's head
revision without leaving ghui.

## What we'd ship

- A `m` diff-view command that opens the currently selected `.md` or
  `.markdown` file as rendered terminal Markdown.
- Fetch the complete updated file at the PR head SHA, rather than trying to
  render an incomplete patch hunk.
- A scrollable preview with Vim-style navigation and mouse text selection; `y`
  copies the selection or falls back to the complete source, while `m` or `esc`
  returns to the diff at the same location.
- Keep the diff mounted underneath so dismissing the dialog restores the exact
  file and line context.

## API / architecture mapping

- Add a raw file-content operation to `GitHubService`, backed by GitHub's
  repository contents endpoint and keyed by repository, path, and head SHA.
- Reuse the shared OpenTUI `MarkdownBody` renderer.
- Store only preview visibility in diff UI atoms; file content is loaded for
  the active preview and is not added to the persistent cache.
- Give the preview its own keymap scope so diff commenting commands cannot run
  against hidden source lines.

## Open questions

None for v1.

## Out of scope (for v1)

- Rendering deleted files from the base revision.
- Rendering MDX or resolving relative image assets.
- Side-by-side source and rendered output.

## Status

Implemented in the local fork. The preview is a nearly full-height dialog over
the unchanged diff. Drag-selected rendered text can be copied with `y`, which
falls back to the complete Markdown source when there is no selection.
