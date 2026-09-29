# ghui

Terminal UI for keeping up with your open GitHub pull requests across repositories.

`ghui` gives you one keyboard-driven place to review PR details, inspect diffs, leave diff comments, manage labels, toggle draft state, merge, open PRs in GitHub, and copy PR metadata without leaving the terminal.

PR descriptions and full comment/review threads render Markdown with OpenTUI's
native renderer, the same component used by OpenCode. Headings, emphasis, lists,
quotes, tables, and fenced code follow the active ghui theme.

<img width="1420" height="856" alt="image" src="https://github.com/user-attachments/assets/5e560a4a-5887-4baa-a6d4-e1f4f0410c70" />

## Install

Homebrew is the recommended install path on macOS and Linux. It installs a standalone `ghui` binary, so you do not need Bun or npm at runtime.

```bash
brew install kitlangton/tap/ghui
```

Upgrade with:

```bash
brew upgrade ghui
```

Or install with npm:

```bash
npm install -g @kitlangton/ghui
```

The npm package also installs a platform-specific binary package and does not require Bun.

Requirements:

- GitHub CLI installed and authenticated with `gh auth login`

Run it from anywhere:

```bash
ghui
```

## Local Development

### Local fork: experimental Linear workspace

This checkout now includes a native **LINEAR** tab containing the migrated
Linear TUI (inbox, My Issues, projects, search, details, editing, and comments).
It shares GHUI's renderer; it does not launch another CLI. The original app in
`kevin-scripts` remains untouched until migration audits are complete.

- Click **LINEAR**, or press `7` from the home list (`3` in a repository).
- `ctrl+left` / `ctrl+right` (or `ctrl+tab` / `ctrl+shift+tab` where supported)
  switch host tabs. Plain `tab` remains Linear's pane-navigation key.
- Finish or cancel a Linear picker/search input/composer before leaving its tab.
- Linear credentials are resolved on the first visit, from `LINEAR_API_TOKEN`
  or the local macOS Keychain item `linear-api-token`. No credential is bundled.
- Setup: `ghui --linear-login`; removal: `ghui --linear-logout`. Source-mode
  equivalents are `bun src/index.tsx --linear-login` / `--linear-logout`.
- Current PR links still open in the browser. Nested PR child rows and direct
  navigation into GHUI's PR workspace are a follow-up, not part of this first pass.

This migration is local and unpushed. Company-specific fixtures/examples still
require sanitization, source licensing/ownership review, and additional audits
before public sharing. See `plans/linear-workspace-migration.md`.

Clone, install, and link:

```bash
git clone https://github.com/kitlangton/ghui.git
cd ghui
bun install
bun link
```

With Nix flakes:

```bash
nix develop
bun install
bun run dev
```

## Configuration

- `GHUI_PR_FETCH_LIMIT`: max PRs fetched, defaults to `200`
- `GHUI_RUN_FETCH_LIMIT`: max workflow runs fetched per PR, defaults to `20`

Example:

```bash
GHUI_PR_FETCH_LIMIT=100 ghui
```

You can also copy `.env.example` to `.env` and edit the values locally.

ghui stores UI preferences in `config.json` under `GHUI_CONFIG_DIR` when set,
otherwise under the platform config directory. On Linux this is normally
`~/.config/ghui/config.json`.

Example:

```json
{
	"theme": "system",
	"systemThemeAutoReload": true,
	"showScrollbars": false
}
```

`systemThemeAutoReload` defaults to `false`. Set it to `true` to let external
theme reload signals update the active system theme palette while ghui is
running.

Scrollable panes hide their scrollbar rails by default. Set `showScrollbars`
to `true` to display them while retaining the same keyboard and mouse scrolling
behavior.

### Open in editor

Press `e` on a pull request (in the list, detail, or diff view) to hand it off
to your editor. ghui suspends the TUI, runs your command attached to the
terminal, and resumes when it exits.

Configure this in `config.json`:

```json
{
	"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'",
	"repoPaths": {
		"kitlangton/ghui": "~/code/ghui",
		"kitlangton/*": "~/code/repos/kitlangton/*",
		":owner/:repo": "~/src/github.com/:owner/:repo"
	}
}
```

`repoPaths` maps a repository to a local clone, matched in order: an exact
`owner/repo` key, then an owner wildcard (`owner/*`, where `*` becomes the repo
name), then the generic `:owner/:repo` template. `~` expands to your home
directory.

`editorCommand` is a shell command template with these substitutions:

- `{{repo}}` — full `owner/repo`
- `{{owner}}`, `{{name}}`
- `{{number}}` — PR number
- `{{headRef}}` — PR head branch
- `{{baseRef}}` — base branch
- `{{author}}`
- `{{url}}`
- `{{repoPath}}` — resolved local path (requires a matching `repoPaths` entry)

If `editorCommand` is omitted, ghui falls back to `$VISUAL`/`$EDITOR` opening
the resolved `repoPath`. Some common recipes:

```jsonc
// diffview.nvim: checkout the branch and diff against base
"editorCommand": "tmux new-window -c {{repoPath}} 'gh pr checkout {{number}} && nvim -c \":DiffviewOpen {{baseRef}}...{{headRef}}\"'"

// octo.nvim: review via the GitHub API (no checkout)
"editorCommand": "tmux new-window -c {{repoPath}} 'nvim -c \":silent Octo pr edit {{number}}\"'"

// VS Code
"editorCommand": "code {{repoPath}}"
```

### Workflow runs

Press `a` on a pull request to open its **GitHub Actions runs** full-screen,
scoped to the PR's head commit:

- The runs list shows each workflow run with status, conclusion, duration, and age.
- `enter` drills into a run to see its jobs and steps; failing steps are easy to spot.
- `n` / `p` jump between failures, `enter` expands a step, `o` opens the run in your browser, `r` refreshes, and `esc` walks back out.

Requires the GitHub CLI (`gh`) the same as the rest of ghui; nothing extra to configure.

## Keybindings

The home tabs are **Repos**, **My PRs**, **Review requested**, **Assigned PRs**,
**Mentioned PRs**, and **Issues**. PR queues span all repositories; **Review
requested** shows open PRs requesting your review. Inside a repository, the tabs
are **Pull Requests** and **Issues**. Click a tab or use the shortcuts below.

- `up` / `down`: move selection
- `k` / `j`: move selection
- `left` / `right`: navigate PR list ↔ PR details/description ↔ diff (no wrapping); inputs and modals keep their own arrow behavior
- `gg` / `G`: jump to first or last pull request
- `ctrl-u` / `ctrl-d`: page up or down
- `tab` / `shift-tab`: switch top-level tabs
- `1`–`6`: select a home tab by position (`1`–`2` inside a repository)
- `ctrl-p` / `cmd-k`: open the command palette
- `/`: filter
- `enter`: expand details; normal PR actions still work while details are expanded
- Expanded PR details show the description followed by the conversation in one scroll area. Use `↑` / `↓` or `j` / `k` to select the description or a comment; page keys and the wheel scroll independently. `y` copies the selected link, while `shift-y` always copies the PR link. `enter` on a comment opens the existing reply editor (also available as **Reply to comment** in the command palette). `c` opens the dedicated comments view at the selected comment for additional actions.
- `esc`: return from expanded details, leave diff/comment mode, or close modal
- `r`: refresh
- `d`: view stacked diff for all changed files
- `a`: view this PR's GitHub Actions runs (jobs, steps, and failing logs)
- `shift-r`: review or approve the selected pull request
- `up` / `down` / `pageup` / `pagedown`: move comment target while viewing a diff
- `enter`: open a commented diff line, or start a comment on an uncommented line
- `v`: start or clear a multi-line diff comment range
- `y`: copy a link to the selected diff line, or to the range selected with `v` and the movement keys
- `n` / `p`: jump between diff comment threads
- `f`: open the changed-files navigator while viewing a diff
- `h` / `l`: choose the deleted or added side while in split diff comment mode
- `[` / `]`: switch files while viewing or commenting on a diff
- `m`: preview the selected `.md` or `.markdown` file in a nearly full-height rendered Markdown dialog; drag to select rendered text, then press `y` / `cmd-c` to copy the selection (the complete source is copied when nothing is selected), and use `m` / `esc` to close
- `shift-y`: copy only the selected pull request's GitHub link
- `s`: toggle draft or ready-for-review state
- `m`: merge
- `x`: close with confirmation
- `t`: choose a fixed theme, including `System` to match your terminal colors; press `m` in the theme picker to follow the OS light/dark appearance with separate theme choices
- `l`: manage labels
- `o`: open PR in browser
- `e`: open PR in your editor (configurable; see `editorCommand` / `repoPaths`)
- `y`: copy PR metadata in the list; copy the selected link in description/comments. **Copy pull request metadata** remains available in the command palette.
- `q`: quit

Authored-only pull request views render compact one-line rows because the
author identity is implied by the active view. Mixed-author views continue to
show the author and branch metadata row.

Review submission:

- Press `shift-r` to open the review modal.
- Use `j` / `k` or `up` / `down` to choose Comment, Approve, or Request changes.
- Press `enter` to move to the optional summary area.
- Press `enter` again to submit, or `shift-enter` to insert a newline.
- Press `esc` from the summary to return to action selection; press `esc` from action selection to cancel.
