# Repository Notes

## Active Local Fork — Read First

- This is the user's actively maintained `kkrausse/ghui` fork, checked out at
  `/Users/kevinkrausse/Documents/kkrausse/ghui`. Further local improvements are
  planned; this is not a disposable upstream experiment.
- `fork-workflow-improvements` is the canonical local development branch and
  baseline for new work. Git's `origin/HEAD` currently points to `origin/main`;
  that is not the intended local development baseline. Check status/branch before
  editing, and do not automatically switch, reset, or rebase onto `main`.
- `origin` is `https://github.com/kkrausse/ghui.git`; `upstream` is
  `https://github.com/kitlangton/ghui.git`. Read `FORK.md` and relevant `plans/`
  for implemented differences and ongoing work.
- `~/.bun/bin/ghui` is Bun-linked to this checkout through
  `~/.bun/install/global/node_modules/@kitlangton/ghui`. The launcher currently
  falls back to `bun src/standalone.ts` because no platform binary is installed
  in this checkout. A separate Homebrew `ghui` exists but is not the local fork.
- Preserve the local CLI link. Do not run `ghui upgrade`, reinstall the upstream
  package, sync upstream, push, publish, or change the GitHub default branch
  without an explicit request. See `FORK.md` for development commands.

## Upstream Release Process (Reference Only)

These are inherited upstream instructions, not authorization to release this
fork. Local development stays on `fork-workflow-improvements`; upstream release
targets below apply only when explicitly working on an upstream release.

- Release workflow: `.github/workflows/publish.yml`.
- npm Trusted Publisher should be configured for owner `kitlangton`, repository `ghui`, workflow `publish.yml`, environment `npm`.
- Add a changeset for every user-facing change with `bun run changeset`.
- Check pending changesets with `bun run changeset:status`.
- Apply pending changesets with `bun run changeset:version`; this bumps `package.json` and updates `CHANGELOG.md` when release notes exist.
- Run `bun run format:check`, `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run package:smoke` before committing the version bump.
- Commit and push the version bump and consumed changesets to `main`.
- Create a GitHub release named and tagged `v<package.json version>`.
- Publishing to npm happens from GitHub Actions via trusted publishing; do not use an `NPM_TOKEN`.
- The workflow verifies the release tag matches `package.json`, builds standalone binaries, runs `npm publish`, uploads release assets, and dispatches `kitlangton/homebrew-tap`.
- Homebrew tap automation uses the `HOMEBREW_TAP_TOKEN` Actions secret on `kitlangton/ghui` to dispatch `kitlangton/homebrew-tap`.
- `HOMEBREW_TAP_TOKEN` should be a fine-grained PAT owned by `kitlangton`, scoped only to `kitlangton/homebrew-tap`, with repository `Contents: Read and write`.
- After releases, verify both the publish workflow and the tap dispatch workflow pass.

## Commands

- Format check: `bun run format:check`.
- Typecheck: `bun run typecheck`.
- Lint: `bun run lint`.
- Test: `bun run test`.
- Package smoke: `bun run package:smoke`.
- Create changeset: `bun run changeset`.
- Check changesets: `bun run changeset:status`.
- Apply changesets: `bun run changeset:version`.
- Create release: `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes "..."`.
- Check publish run: `gh run list --workflow publish.yml --limit 5`.
- Check npm version: `npm view @kitlangton/ghui version`.
- Check tap workflow: `gh run list --repo kitlangton/homebrew-tap --workflow update-ghui.yml --limit 5`.
- Check Homebrew formula: `brew info kitlangton/tap/ghui`.
- Test Homebrew install: `brew reinstall kitlangton/tap/ghui && /opt/homebrew/opt/ghui/bin/ghui --version`.

## Commit Readiness

- Before committing or pushing code changes, run `bun run format:check`, `bun run typecheck`, `bun run lint`, and `bun run test`.
- Before release commits, also run `bun run package:smoke`.
- Before release commits, also run `bun run build:standalone`.
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
