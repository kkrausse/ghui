# Repository Notes

## Read First

- Checkout: `/Users/kevinkrausse/Documents/kkrausse/ghui`; remote `origin` is
  `https://github.com/kkrausse/ghui.git`.
- `fork-workflow-improvements` is the development branch. Check status/branch
  before editing, and do not switch, reset, or rebase onto `main` on your own.
- To push: fast-forward `main` to the development branch and push `main` to
  `origin`. Commit as `kkrausse97@gmail.com` (set repo-locally). Do not push,
  publish, or change the GitHub default branch without an explicit request.
- `~/.bun/bin/ghui` is Bun-linked to this checkout through
  `~/.bun/install/global/node_modules/ghui`. No platform binary is installed, so
  the launcher runs `bun src/standalone.ts` and source changes apply on the next
  launch. Preserve this link.
- Read the relevant `plans/` before larger changes.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.
- Create changeset: `bun run changeset`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- If formatting fails, run `bunx oxfmt src/ test/ dev/` or format only the touched files, then rerun `bun run format:check`.
- CI enforces formatting with `bun run format:check`; do not rely on manual review to catch formatting drift.

## UI Conventions

- Modal dividers must connect to the side borders with junction characters (`├` / `┤`). When adding a horizontal divider inside a modal body, thread the divider's row index through `ModalFrame`'s `junctionRows` so the side bars render `├`/`┤` at that row instead of `│`. Inline `<Divider>`s without a corresponding junction row look detached and are wrong.

## Plans

Larger features and redesigns are captured in markdown under `plans/` before work starts. Each plan has Why / What / API mapping / Open questions / Status. When taking on something non-trivial, check `plans/` first; when sketching a future-direction idea, write a plan there rather than only mentioning it in chat or commits. See `plans/README.md` for the format and index.

## Future Work

- Add a conversation panel focus/expand flow for reading and navigating longer PR conversations.
- Consider click-drag support in diffs to select a comment range.
- See `plans/` for tracked feature plans (e.g. queued PR reviews).
