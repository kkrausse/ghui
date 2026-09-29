# PR queue tabs

## Why

The home-level Pull Requests tab hides review requests behind a second view selector.

## What we'd ship

- Home tabs: Repos, My PRs, Review requested, Assigned PRs, Mentioned PRs, Issues.
- Clicking, numeric shortcuts, and Tab/Shift+Tab select a queue directly.
- Repository scope retains Pull Requests and Issues.
- Only the loaded PR queue gets a count; switching tabs uses existing lazy loading.

## API / architecture mapping

Separate workspace tab identity from content surface identity. Queue tabs select the existing global `PullRequestView` and render the pull-request surface, using existing GitHub search qualifiers and cache keys.

## Open questions

None.

## Status

Implemented locally; pending commit.
