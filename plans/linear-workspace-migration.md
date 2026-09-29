# Native Linear workspace migration

## Why

Host the full existing Linear TUI in this local GHUI fork, under a Linear tab.
One application and one renderer should own navigation; no CLI subprocess or
embedded terminal. Keep this migration local: local checkpoint commits are
authorized, but do not publish or push.

## What

- Copy the existing app, queries, mutations, UI, and tests from
  `kevin-scripts/linear-tui` into this checkout.
- Add a native Linear workspace tab, preserving Linear's internal navigation.
- Adapt workspace dimensions, input ownership, and quit behavior to the host.
- Resolve credentials only when Linear is first opened, not at GHUI startup.
- Retain Linear state across tab switches without hidden focused inputs.
- Leave the original standalone app untouched until migration audits pass.
- Follow up with nested selectable PR rows and navigation into the existing
  GHUI PR workspace, returning to the original Linear selection.

## API / architecture mapping

`src/linearWorkspace/` contains the migrated app; the GHUI shell owns the
renderer and workspace tabs. The Linear component receives active/size/quit
inputs. Use the official Linear GraphQL API and existing local credential
resolution. Do not require the separate Linear CLI or import kevin-scripts.
Share a compatible OpenTUI version, while keeping Linear's data model isolated
from GHUI's Effect state. Port tests into `test/linear/`.

## Open questions

Central follow-up list: [Linear workspace follow-ups](linear-workspace-follow-ups.md).

- Subsequent audit: sanitize all company-specific examples and fixtures before
  public sharing, verify source ownership/licenses, and review logs/builds for
  accidental disclosure. This local copy is not a publication clearance.
- Generic browser-like navigation stack across all GHUI views remains follow-up;
  this change uses a small explicit Linear origin/return boundary only.

## Linked PR navigation

- My Issues expands linked GitHub PR rows with Space, including merged/closed
  attachments. Rows are single-line, selectable, status-colored; arrows traverse
  issue occurrences and children. Group-label duplicates have distinct keys;
  collapse reconciles a selected child to its own parent. Pagination preserves
  stable keys rather than assuming an open-queue index.
- Linear hands supported URLs to the host via `onOpenGitHubLink`. GHUI fetches
  the exact repository/number through its existing read-only GitHub service and
  selects the entity independently of open queue membership. Linear stays mounted.
- Left/Escape at the PR description root clears that selection and returns to
  the same Linear view/row/expansion/scroll. Diff, comments and Actions back first
  return to the preceding PR page through a drill-in-only trail; their existing modal/composer guards still own
  input. Explicit host-tab switching abandons the drill-in without changing the
  retained Linear view. Late fetches cannot switch away from another tab/input.
- Linked-PR `O`, picker choices, detail rows and Markdown links (issue descriptions,
  comments, project overview/update bodies) use the same boundary.
- Safe internal routes: HTTPS `github.com/<owner>/<repo>/pull/<positive-number>`
  root URLs, optionally trailing slash. Queries, fragments, PR files/commits,
  issues, repositories, Actions URLs, GitHub Enterprise and non-GitHub links
  retain browser behavior. No fuzzy repo/issue route claims to open an exact PR.
  This uses GHUI's GitHub service (its existing `gh api` transport), not a new
  CLI workspace/subprocess or the separate Linear CLI; no navigation mutations.
- Host digits 1–7 take precedence outside Linear search/composer/modal picker;
  Linear project tabs remain reachable via brackets or clicks. Ctrl+arrows stay
  host tab navigation and respect editing locks.

## Out of scope for the first migration pass

- Removing/deprecating the original app before parity is verified.
- Publishing, pushing, or moving the separate Linear CLI.
- New Linear product features, cross-platform credential storage redesign.

## Status

Initial migration implemented locally. Runtime is in `src/linearWorkspace/`,
ported tests in `test/linear/`, and the GHUI shell hosts a lazy-loaded native
Linear tab. The original application remains untouched. Recorded as local
checkpoint commits; nothing pushed or published.

Validation: 751 tests pass, TypeScript/format/lint checks pass, CLI build and
package smoke pass. Real PTY testing verified opening the tab and an issue's
detail view using existing local Linear credentials; no Linear mutations were
performed during that manual check. Host tests cover deferred Linear queries,
keyboard ownership, tab-return state, small-terminal resize, and blocking tab
switches while a Linear search input is active.

Linked-PR follow-up implemented locally. Keep validation pragmatic: two host
render regressions cover exact out-of-queue routing, nested back navigation,
collapse/picker/detail-origin return and numeric-tab input guards; one small
route test checks supported roots versus unsafe/unsupported URLs. Existing
tests remain intact. Broader temporary unit scaffolding was removed on request.
Final scoped checks: 66 focused tests pass; typecheck, lint, format check and CLI
build pass. A mock-backed real PTY check verified expand/select/open exact PR,
diff/root return, numeric host tabs and digits staying in Linear search. No
recording was retained. The full suite passed at the earlier implementation
checkpoint; it was not rerun after the requested testing reduction.
No real mutations or changes to the original standalone app. Remaining URL
limitations and generic navigation-stack follow-up are listed above.

Still required: detailed feature-parity audits (including
unsent editor drafts through resize), cross-platform host integration, and
privacy/licensing review. Fixtures and copied examples remain local only.
