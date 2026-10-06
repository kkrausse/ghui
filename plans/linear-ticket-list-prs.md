# Linked PR dropdowns in every Linear ticket list

## Why

Linked PR navigation should work wherever a ticket appears, not only My Issues.

## What we'd ship

- Space toggles the selected ticket's PR children; Shift+Space toggles all
  loaded tickets' PR dropdowns in team, sprint, saved-view, project and search lists.
- My Projects ticket previews support the same nested PR rows while Space on a
  project still toggles its tickets.
- Keyboard/mouse selection, grouping, pagination, GitHub drill-in and safe
  handling of issue-edit shortcuts reuse the existing nested issue row model.

## API / architecture mapping

Use `buildIssueRows` and existing attachment metadata, with no new API calls.
Enable nested selection for every `IssueList` and reuse those rows inside
`ProjectList` previews. Expose bulk expansion through the shared command palette.

## Open questions

None; toggles affect loaded tickets only, as in the existing My Issues behavior.

## Out of scope

Live GitHub polling, new link routes, and expanding unloaded projects/pages.

## Status

Shipped locally — working-tree implementation, not committed or published.
Validated with 758 passing tests, typecheck, lint and formatting checks.
