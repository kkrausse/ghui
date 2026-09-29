# Native terminal Markdown

## Why

PR descriptions and conversations should use OpenCode's OpenTUI Markdown renderer
for consistent headings, lists, quotes, tables, and highlighted code.

## What we'd ship

- Theme-aware Markdown for PR descriptions and full comment/review threads.
- Preserve threaded replies, comment selection, and link navigation.
- Measure actual rendered comment blocks for selection scrolling; the old plain
  text row counts are not valid for Markdown tables and code blocks.

## API / architecture mapping

Use the existing `@opentui/core` / React `<markdown>` component behind a shared
`MarkdownBody`. Integrate it into `DetailBody` and `CommentsPane`; keep compact
single-line diff previews as previews. No GitHub API changes are needed.

## Open questions

None for the initial integration.

## Status

Implemented in the local fork. Formatting, typecheck, lint, the full test suite,
and package smoke pass. Renderer tests cover tables, wrapped link clicks, issue
references, and comment selection scrolling.
