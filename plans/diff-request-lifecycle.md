# Diff request lifecycle

## Why

The diff pane shows loading for an absent cache entry, but full-view mode disables
prefetch. Revision changes or background cache eviction can therefore display an
endless spinner without a request. Cache Loading markers also aren't proof of
live work.

## What we'd ship

- Ensure the visible revision is loaded, including after cache loss.
- Protect the selected diff from background cache eviction.
- Deduplicate using registry-scoped in-flight requests, not Loading markers.
- Only the latest request may publish success or failure; bound request waits.

## API / architecture mapping

Keep revision-keyed Effect atoms (independent PRs remain concurrent). Track request
ownership separately in `useDiffLoader`, with identity guards for forced refreshes
and a 60-second timeout. `useDiffPrefetch` observes revision and cache state and
loads immediately in full view, while retaining delayed background prefetch.

## Open questions

The exact transition in the original running instance wasn't logged. Overlapping
refreshes worked in controlled probes; missing-cache spinner paths are confirmed.

## Out of scope

Global fetch locks, redesigning all loaders, and adding runtime debug attachment.

## Status

Implemented locally. Loader and mounted-hook regression tests cover request
ownership, orphaned markers, concurrent revisions, forced refresh, selected-entry
eviction protection, timeout/retry, revision changes, and missing-cache recovery.
Full suite: 617 passing; typecheck, lint, and format check passing.
