# Request isolation

## Why

Promise-mode setters on a shared runtime.fn atom subscribe to the same result.
Overlapping calls can both resolve with the later call's data, poisoning caches
under the earlier caller's PR/repository key. Mutations can also interrupt each
other and report another operation's result.

## What

- Give imperative data requests and PR/issue mutations a fresh atom per invocation.
- Keep existing keyed detail, diff, review-comment, and Actions-run loaders.
- Preserve per-entity display caches and refresh behavior.
- Test overlapping requests, failures, and mutation completion independently.

## API / architecture mapping

`githubRequest` builds an invocation-owned runtime atom. `useRequest` awaits that
specific atom through the existing registry, with zero idle TTL. Replace shared
function atoms for conversation reads/writes, merge operations, labels, close,
draft/review actions, pagination, and repository metadata/cache operations.

## Open questions

None. Invocation isolation is stronger than entity-only isolation for imperative
operations: two writes to the same PR must also retain independent outcomes.

## Status

Implemented locally; regression tests cover overlapping reads and mutations,
failure isolation, cross-repository comment cache writes, and same-subject refresh ordering.
