# Linear workspace follow-ups

Local fork only; no publishing clearance. Keep the original standalone app intact.

- **Navigation:** refactor toward a generic page/view stack with predictable
  Left/back return across GHUI and Linear. The current linked-PR drill-in has
  a narrow return boundary; do not extend it into a generic framework piecemeal.
- **Commands:** shared Ctrl+P palette and explicit Linear command registration.
  Currently Linear owns its own pane keys; GHUI owns numeric host tabs outside
  text inputs/pickers. Linear project tabs use brackets/clicks, never digits.
- **Parity:** audit all migrated workflows, retained unsent drafts through resize,
  credential handling and cross-platform behavior. Current nested PR rows are
  only in My Issues, not project issue previews or search results. Input typed
  in the same render tick as opening a text field can precede its mount and be
  dropped; host digits no longer switch tabs during that transition.
- **Links:** internal routing supports public HTTPS GitHub PR root URLs only.
  Query/fragment/subpage links, issues/repos/Actions URLs, Enterprise and other
  hosts still open externally. Add only routes whose exact destination can be
  honored. GHUI's existing GitHub service uses its `gh api` transport; Linear
  stays native and does not invoke the separate Linear CLI.
- **Privacy/licensing:** audit copied company fixtures/examples/logs/builds,
  ownership/licenses and credentials before any public sharing or publication.
- **Release:** separate this migration and its follow-up changes from older
  uncommitted fork work before preparing an authorized local commit. No push.
