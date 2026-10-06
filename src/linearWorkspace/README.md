# Linear workspace

A Linear client in the terminal. Reads teams, sprints, projects, and tickets;
edits status, assignee, priority, and comments (including threaded replies), and
posts project updates. Built so the Linear desktop app does not have to stay
open just to glance at a sprint. It runs as the **LINEAR** tab inside GHUI and shares
GHUI's renderer, dependencies, and browser/clipboard services.

Comments, issue/project descriptions, and full project updates render Markdown
using OpenTUI's built-in `<markdown>` component — the same renderer OpenCode uses.
Headings, emphasis, lists, quotes, links, fenced code, and tables use the TUI's
palette. The shared renderer and syntax colors live in `ui/Markdown.tsx`.

Links in those bodies are terminal hyperlinks (OSC 8) where OpenTUI detects
support. GitHub pull request links open in GHUI's PR view; other web links open
in the browser, and non-web schemes are refused.

## Setup

```sh
ghui --linear-login
```

That opens Linear's key page, hands the secret prompt to `security` (so the key
never passes through this process, your shell, or history), stores it in the
Keychain, then reports which teams the key can see and whether it is really
read-only. `ghui --linear-logout` removes it.

Restrict the key to the teams you browse. Scope is your call: **Read** only if
you just want to look, in which case the edit keys fail with a scope error and
everything else keeps working. The edit features need write scope.

`$LINEAR_API_TOKEN` also works and takes precedence when set. Prefer the
Keychain: an env var is inherited by every process your shell spawns and usually
ends up in a dotfile.

### Why not OAuth

Linear does support authorization-code + PKCE, which would avoid a long-lived
secret. Two reasons it loses here:

- Registering an OAuth application is **workspace-admin gated**, and Linear
  recommends a dedicated workspace for it since every admin can see it.
- OAuth's scopes are account-wide. A personal API key can be **restricted to
  specific teams**, so it is the narrower credential of the two.

The refresh token OAuth would hand back is itself a long-lived secret in the
same Keychain, so the security gap is smaller than it first looks.

## Run

Start GHUI and press `7` on the home list (`3` inside a repository), or click
**LINEAR**. The credential is resolved on the first visit.

Resident memory is ~160 MB with a 250-issue view loaded — most of that is the
Bun runtime floor, not the UI. Well under Electron, but this is not a 20 MB Rust
binary; that was the trade for writing views in React.

## Keys

| key                  | action                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `j` / `k`, `↓` / `↑` | move selection                                                                        |
| `ctrl+d` / `ctrl+u`  | half-page jump                                                                        |
| `gg` / `G`           | jump to the first / last row                                                          |
| `gi` / `gn`          | go to My Issues / Inbox                                                               |
| `Space`              | Toggle selected ticket's PRs; on a My Projects project, toggle its tickets            |
| `Shift+Space`        | Any ticket list, search or project preview: toggle all loaded tickets' PR dropdowns   |
| `Ctrl+P` / `Cmd+K`   | GHUI: shared command palette (outside text inputs and pickers)                        |
| `l` / `→`            | into the list, then open the selected row                                             |
| `h` / `←`            | back out: close the pane, then back to the sidebar                                    |
| `tab`                | in the list: switch pane · in detail: cycle comments                                  |
| `enter`              | load view · open issue · drill into project                                           |
| `1` `2` `3`, `[` `]` | inside a project: switch tab                                                          |
| `u`                  | inside a project: post a project update                                               |
| `esc`                | leave detail, search, or a drilled-in project                                         |
| `/`                  | search all issues by text                                                             |
| `b`                  | group the list by an attribute                                                        |
| `r`                  | in the list: reload · in detail: reply to selected comment                            |
| `R` (shift+r)        | refresh the current page with fresh data, including issue details and project updates |
| `t`                  | in detail: the activity feed — every change with its timestamp                        |
| `y`                  | copy the issue's git branch name                                                      |
| `Y`                  | copy the issue's link                                                                 |
| `o`                  | open the issue in the browser (or the desktop app)                                    |
| `O`                  | open its linked PR — picks one when the issue has several                             |
| `P`                  | jump to the issue's project — also the `Project` row in the detail pane               |
| `?`                  | help                                                                                  |
| `q`, `ctrl+c`        | quit                                                                                  |

`g` is a prefix, matching both Linear (`gi`, `gn`) and vim (`gg`). Grouping used
to live on `g` and moved to `b` to free it.

### Grouping

`b` opens a picker: **status** (the sprint board), **assignee**, **project**,
**priority**, **cycle**, or **label**. The active grouping is named in the pane
title, since past status the rows alone no longer imply it.

Grouping is remembered separately for each view (including search and each
project's Issues tab) in `~/.config/linear-tui/preferences.json`, or under
`$XDG_CONFIG_HOME/linear-tui` when set. It survives refreshes and restarts.
My Projects starts with status grouping for its selected project's tickets;
`b` there changes that preview's grouping.

Grouping by label puts an issue under each of its labels, the way Linear does.
Selecting it highlights every copy — they are the same issue.

Groups cover what is loaded. On a paginated view that is the pages you have
scrolled through, not the whole backlog.

### Linked PRs

Every issue carries whatever GitHub attached to it, so the list answers "what is
actually in review" without opening anything.

List rows get one cell: a status glyph and the PR number, plus `+` when more PRs
hang off the issue — `◐#575+`. The cell shows the PR most worth looking at:
in-flight before merged or closed, most recently updated first.

The detail pane lists them under the branch row, one line each:

```
Branch    backend-1336-implement-metering-aggregation
PR #789   ◌ draft · data-warehouse-pipeline · ⎇ backend-1336-metering-shared-events-base
PR #612   ⊘ closed · data-warehouse-pipeline
```

| glyph | state     | means                                                   |
| ----- | --------- | ------------------------------------------------------- |
| `◌`   | draft     | not ready for anyone                                    |
| `○`   | open      | nobody has been asked to review                         |
| `◐`   | in review | a review was requested — usually the one waiting on you |
| `●`   | merged    |                                                         |
| `⊘`   | closed    | closed unmerged                                         |

Approvals, change requests, and merge conflicts follow the repo when GitHub
reports them. Approvals count _reviewers_, not reviews: someone who comments and
then approves is one approval, and bots are ignored.

A PR's own branch is only named when it differs from the issue's suggested
branch, which is common — one ticket, several repos, several branches. A branch
pushed with no PR behind it shows up as `Commit`.

Five PRs fit above the description; past that the pane says `+N more linked`.

Each row is its own link: **click one to open that PR**, which is what you want
when a ticket spans three repos, and the `⎘` beside the PR number copies its URL.
`O` is the keyboard route for opening — straight to the browser with one PR,
through a picker with several. Rows are underlined and click-to-open; they do not
carry an OSC 8 hyperlink of their own.

The whole thing rides along on the list queries rather than costing a request
per issue. `Attachment.metadata` is an untyped JSONObject, so the full blob comes
down including each PR's review list — measured at +27KB and +34ms on a
100-issue page, which is cheap enough to not bother deferring.

### Activity feed

`t` swaps the scrolling half of the detail pane — description, sub-issues,
comments — for the ticket's history, newest first. `t` again swaps back.

```
ACTIVITY (7) · newest first
Aug 06 09:12   GitHub          ◐ In Progress → ◐ In Review
Aug 05 14:20   Dana            commented: Nice, I will review.
Aug 03 14:00   Robin           assigned to Robin
Aug 03 14:00   Robin           +label backend
Jul 28 11:30   Dana            priority Medium → High
Jul 20 09:02   Robin           created the issue
```

One line per change, not per event: Linear records "moved to In Review **and**
reassigned" as a single `IssueHistory` node with several fields set, and the feed
fans that out so each line is one fact with the event's stamp and actor.

Comments are interleaved by timestamp — first line only, since the full thread is
one `t` away — and the issue's creation is synthesized from `createdAt`, which
Linear does not record as a history entry.

Stamps are absolute local time. Relative ages ("3d") are fine for a list; when
you are lining a status change up against a deploy or a Slack thread, they are
not.

Changes made by an integration or a Linear automation have no `actor`. Those are
named from `botActor` instead — a PR merge moving the status reads as `GitHub`,
a cycle rollover as `Linear`, rather than as a blank column.

The 50 newest entries come down with the detail query — +3-13KB and no extra
round trip, since the description and comments are already being fetched. Only a
ticket with more than 50 needs the older ones, and the feed says
`…older activity not loaded` rather than implying it is complete.

`IssueRelationHistoryPayload.type` is a two-letter code Linear's schema does not
document. `ar` / `ab` / `am` were decoded by matching them against the issues'
current relations — added related, blocking, duplicate — and an unrecognized code
renders as itself.

### Search

`/` searches every issue in the workspace by text. Search is **its own scope**,
not a filter on the view you were looking at, so the sidebar comes off the screen
and the results fill the width:

```
 / aggregation                                          100+ found · / edit · esc exit
┌─Search · "aggregation"──────────────────────────────────────────────────────────────┐
│↑ BACKEND-1337 ◌ Implement quotas aggregation                      robin.shell… 11d  │
│↑ BACKEND-1335 ◌ Implement Billing aggregation            ●#783    robin.shell… 12m  │
```

That is a correctness fix, not decoration. `searchIssues` is workspace-wide, but
the results used to appear in the list pane with the sidebar still highlighting
whatever you had loaded — a highlighted **Sprint 42** next to search results
reads as "these are the sprint's matches", which they never were.

| key     | action                                                            |
| ------- | ----------------------------------------------------------------- |
| `/`     | open the query — prefilled with the current one, caret at the end |
| `enter` | run it; an empty query leaves search                              |
| `esc`   | leave search, from the query or the results                       |

Everything else works on the results the way it works on any list: `j`/`k`,
`enter` or `l`/`→` to open, `s`/`a`/`p`/`c` to edit, `b` to group, `y`/`Y`/`o`/`O`.
Editing a result keeps you in the scope — the refresh re-runs the query instead
of dropping you back onto the sidebar's view.

`h` and `tab` do nothing here. They reach for a sidebar that is not on screen,
and `esc` is the way out.

Because search is isolated, search-only controls (assignee filter, team filter,
sort) can live in its header without spending a keybinding or a row anywhere else.

### Inbox

The sidebar's first entry, with an unread badge. `gn` jumps to it.

| key     | action                                                |
| ------- | ----------------------------------------------------- |
| `enter` | open what it points at, marking the notification read |
| `e`     | archive — clears it from the inbox                    |
| `u`     | toggle read / unread                                  |
| `o`     | open in the browser                                   |

`enter` lands in the app: an issue notification opens the issue detail, and a
project notification opens the project — the update itself when the notification
names one, the Overview otherwise. `esc` from there returns to the inbox.

The rest (document mentions, initiative updates) still open in the browser, since
the app has no pane for them.

The badge comes from `notificationsUnreadCount`, which Linear flags internal in
its schema. It is fetched on its own so a key that cannot read it costs you the
badge and nothing else; the inbox itself still counts what it loaded.

### Projects

`enter` on a project row opens a three-tab workspace, the way Linear's own
project page does. `1`/`2`/`3` jump to a tab, `[`/`]` step through them, and the
tabs are clickable. `esc` or `h` unwinds to the projects list, not to the tab you
were on.

In **My Projects**, projects start collapsed. Select one and press **Space** to
expand all its tickets beneath it, grouped by status by default; Space again
collapses it. `j`/`k` or the arrow keys move through the ticket rows, and Enter
opens the selected ticket. `b` changes the grouping. Tickets load page by page
while the project is expanded. Enter on the project row opens its Overview.

| tab          | what it shows                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Overview** | status, health, lead, members, dates, progress, milestones, the latest update, the description, and the project's own comment thread |
| **Updates**  | every posted update, newest first — health, author, age, comment count                                                               |
| **Issues**   | the project's issues, the same list the drill-in used to open directly                                                               |

Status and health are separate columns because they disagree: an In Progress
project can be Off track. Status is the workspace's project flow; health is
whatever the last update declared.

| key     | action                                                                   |
| ------- | ------------------------------------------------------------------------ |
| `u`     | post a project update — pick a health, then write the body               |
| `c`     | comment: on the project (Overview) or on the selected update (Updates)   |
| `enter` | on Updates: open the update with its comment thread                      |
| `r`     | in an open update: reply to the selected comment — `tab` cycles them     |
| `o`     | open the project or update in the browser                                |
| `Y`     | copy the link to the project (Overview) or the selected update (Updates) |

Update comment threads come down with the updates list rather than on demand, so
opening one costs no request and a posted comment shows up as soon as the list
refetches.

**Project-level comments need a description.** Linear's `commentCreate` takes no
`projectId` — a project's thread is addressed by its `documentContent`, which
stays null until the project body has been touched. On a project with an empty
body the Overview renders its thread without an Add button and `c` says so
rather than failing.

### Editing

Needs a **write-scoped** key. With a read-only key these fail with a scope error
and reads keep working.

| key           | action                                                         |
| ------------- | -------------------------------------------------------------- |
| `s`           | change status (team workflow states, in board order)           |
| `a`           | change assignee (team members, plus Unassigned)                |
| `p`           | change priority                                                |
| `C` (shift+c) | assign to Current cycle or another sprint; No cycle removes it |
| `c`           | add a top-level comment                                        |
| `r`           | reply to the selected comment — `tab` cycles comments          |

In the composer, **Enter inserts a newline**; send with `⌘↵` or `ctrl+s`.
`ctrl+s` exists because `⌘↵` only arrives in terminals that speak the kitty
keyboard protocol.

Replies are threaded via `parentId`. Linear only threads one level, so replying
to a reply attaches to the thread root.

### Mouse

Mouse reporting is on. Click a sidebar entry to load it. Click a list row to
select it, click the selected row again to open it — so click-to-select and
click-to-open both work without double-click timing. The detail pane has buttons
for every edit action, each comment has a Reply button and a `⎘` that copies its
permalink, and each linked PR row opens that PR or copies its URL.

Button clicks stop at the button. They sit inside rows that have their own
handler, so without that a `⎘` click would copy the URL _and_ open the browser.

The wheel scrolls whatever the pointer is over — the issue list, the inbox, the
projects and updates lists, the sidebar, the edit picker, and the panes that are
one long document. In the row lists that means moving the cursor, a row per
event: they have no scroll offset of their own, the window follows the cursor
(see `windowFor`). So the wheel and `j`/`k` are the same gesture, paging included
— reaching the bottom asks Linear for the next page. Scrolling the sidebar loads
the view it lands on, exactly as `j` there does.

### Selecting text

**Drag across anything and it lands on your clipboard.** No cmd+c — the copy
happens when you release.

That is not a flourish, it is the price of mouse support. Mouse reporting means
the terminal forwards every drag to this app instead of drawing its own
selection, so the terminal has nothing to copy and cmd+c gives you whatever was
in the clipboard before. Any TUI that reads the mouse has this problem;
OpenTUI's answer is to track the selection itself, which it reports once per
finished drag, and this app copies it.

If you want the terminal's own selection back — to grab something spanning
panes, or to use its search — hold the modifier that bypasses mouse reporting:
**option** in iTerm2, **fn** in Terminal.app.

## Views

The sidebar is built from `viewer.teamMemberships`, so it shows the teams you
are actually a member of, in the order you arranged them in Linear's own sidebar.
To drop a team, leave it in Linear (team settings → Members); there is no local
hide list. Per team you get:

- **All Issues** — everything not completed or canceled
- **Sprint N** — the team's `activeCycle`, straight from Linear, no date math.
  Hit `g` here for a status-grouped board.
- **Projects** — status, health, progress meter, lead, target date; `enter`
  drills into the project workspace

Plus **Inbox**, **My Issues**, **My Projects** (projects you lead or belong to,
most recently updated first; completed and canceled ones are hidden), and any **saved views** you have defined in Linear.
Saved views are the escape hatch: anything expressible as a Linear issue filter
shows up here without code changes. Project-type saved views are listed but load
as issue views, so they come up empty.

The app opens on My Issues rather than the Inbox — landing there would spend a
request on startup for a view you may not have wanted, and `gn` is one chord.

## Pagination

Every issue and notification connection is fetched a page at a time (100 rows)
and the next page loads once the cursor comes within 20 rows of the end. Before
this the queries were a flat `first: 250` with no cursor, so anything past that
was dropped without a word and the `n/total` counter quietly lied about it.

The counter shows `47/100+` while more pages exist and drops the `+` on the last
one. Re-entering a view resets to page one.

Two caveats worth knowing:

- `Cycle.issues` and `Project.issues` take no `sort`, so their priority order is
  imposed client-side. Loading a page re-sorts the whole accumulated list rather
  than appending below it — rows above the fold can shift.
- Pages are deduplicated by id. Linear paginates live data, so a row edited
  between two requests can cross the cursor boundary and arrive twice.

## Layout

```
app.tsx             all state + key handling
views.ts            sidebar model, target -> query mapping, paging, grouping
theme.ts            palette, priority/state/PR glyphs, relative dates
git.ts              linked PRs and branches, out of Linear's attachment blobs
shell.ts            copy / open, through GHUI's Clipboard and BrowserOpener
ui/wheel.ts         the wheel over a list pane: one cursor row per event
edit.ts             the write path: mutations + cache invalidation
login.ts            --login / --logout
linear/queries.ts   GraphQL documents
linear/schema.ts    valibot schemas for every response
linear/client.ts    token resolution, fetch, 60s per-view cache
test/linear/linear.graphql  Linear's SDL, vendored, for query validation
ui/                 Sidebar, IssueList, NotificationList, ProjectList,
                    ProjectOverview, ProjectTabs, UpdateList, UpdateDetail,
                    IssueDetail, CommentThread, Picker, CommentBox, Button,
                    StatusBar
smoke.test.tsx      renders the real app against stubbed responses
queries.test.tsx    validates every document against Linear's schema
sidebar.test.tsx    sidebar windowing + mouse targets
git.test.ts         attachment classification, against metadata blob shapes
open-pr.test.tsx    `O` end to end, with shell.ts stubbed so no tab opens
```

Issue field selection is ported from [markmarkoh/lt](https://github.com/markmarkoh/lt)
(MIT), extended with cycles, projects, sub-issues, and comments.

## Tests

```sh
bun test test/linear
```

`fetch` is stubbed for the whole file, so the suite never reaches the network
even when a real token is present. It drives actual keystrokes through
OpenTUI's mock input and asserts on rendered frames.

Two things worth knowing if you extend it:

- Wait on wall-clock, not `waitForFrame`'s `maxPasses` — a pass is ~1ms, which
  expires long before a fetch plus a React commit land. Use the `frameWith`
  helper.
- The mock input coalesces keys sent in the same tick: `ESCAPE` immediately
  followed by another key parses as one escape sequence. Flush between them.

## Adding a view

1. Add the query to `linear/queries.ts` and a schema to `linear/schema.ts`.
2. Add a variant to `Nav`/`Target` in `views.ts`, then handle it in `buildNav`,
   `navLabel`, `targetTitle`, `cacheKey`, and `loadTarget` — TypeScript's
   exhaustiveness checks will point at each one you miss.

## Not supported

Editing titles, descriptions, labels, estimates, projects, or cycles. Creating
or deleting issues. Resolving comments. Editing a project's own fields (status,
health, dates, lead) or editing an update after posting it. Use the Linear MCP
from an agent, or the web app, for those. `IDEAS.md` tracks what is worth adding
next and why.

## Gotchas found the hard way

- **`sort` is not accepted on every issue connection.** The root `issues` query
  and `CustomView.issues` take it; `Cycle.issues`, `Project.issues`, and
  `Team.issues` do not, and `orderBy` only offers createdAt / updatedAt. Priority
  ordering for those goes through `sortByPriority()`. `queries.test.ts` validates
  every document against the vendored schema so this cannot regress silently.
- **The sidebar must window its own rows.** Spacing via `marginTop` made the
  rendered height exceed the item count and pushed the bottom border off-screen.
  Blank rows are explicit now; `sidebar.test.tsx` asserts the border survives.
- **`searchIssues` returns `IssueSearchResult`, not `Issue`.** A
  `fragment ... on Issue` will not apply to it, which is why the selection lives
  in one `ISSUE_BODY` string that two fragments are built from. It used to be
  copy-pasted, with nothing stopping the two halves from drifting.
- **`Project.state` is a deprecated string.** The live field is
  `status { name type color }`, a real ProjectStatus with two members no issue
  workflow state has (`planned`, `paused`). `state` still resolves, which is why
  the projects list rendered fine while showing less than it could.
- **`commentCreate` has no `projectId`.** Issues take `issueId`, updates take
  `projectUpdateId`, and a project's own thread takes `documentContentId` —
  which is null on a project whose body was never written.
- **A tall pane needs `overflow="hidden"` plus `flexShrink={0}` on its rows.**
  Yoga's answer to content taller than the box is to squeeze every child to
  height 0 and paint them on top of each other, not to clip. This bit the help
  overlay the moment it grew a section; it scrolls now.
