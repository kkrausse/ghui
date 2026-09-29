# Ideas

Gaps found by comparing against Linear itself, [roeyazroel/linear-tui](https://github.com/roeyazroel/linear-tui)
(Go/tview), [k1-c/linear-tui](https://github.com/k1-c/linear-tui) (Rust/ratatui),
and [schpet/linear-cli](https://github.com/schpet/linear-cli).

Every API call named here was checked against the vendored `test/linear/linear.graphql`.

## Shipped

- **Inbox** — sidebar row with unread badge, `gn`, `e` archive, `u` toggle read,
  `enter` opens the issue and marks it read.
- **Pagination** — cursors on every issue and notification connection, auto-load
  within 20 rows of the end, `+` on the counter while more exist.
- **Group by any attribute** — `b` picks status / assignee / project / priority /
  cycle / label; `g` freed up as the go-prefix.
- **Project workspace** — `enter` on a project opens Overview / Updates / Issues
  on `1`/`2`/`3` and `[`/`]`. Posts updates (`u`, health then body), comments on
  a project and on an update, threaded replies in both.
- **Linked PRs** — `Issue.attachments` rides along on every list query. A status
  cell in the row (`◐#575+`), a line per PR on the detail with reviews /
  conflicts / the PR's own branch, and `O` to open one. `metadata` is an untyped
  JSONObject, so `git.ts` classifies it and `git.test.ts` pins the shape against
  real blobs.

- **Activity feed** — `t` on the detail swaps the description for the ticket's
  history, newest first, one line per change with an absolute stamp. Rides along
  on `ISSUE_DETAIL` (`Issue.history`, 50 entries, +3-13KB, no extra round trip);
  `activity.ts` fans a multi-field event out into a row each and interleaves
  comments.

Still open, roughly in the order worth doing:

## Tier 1

### Snooze

Left out of the inbox pass. `notificationUpdate` takes `snoozedUntilAt`, and
`notificationSnoozeAll` does the whole thread. Linear binds it to `h`. Needs a
duration picker (an hour, tomorrow, next week), which is why it was deferred.

### Create an issue

`issueCreate` exists; both other TUIs bind `n`/`c`. Right now this is a read+edit
client, so any new work starts in the browser. Minimum viable: title + team +
optional description, defaults from the current view (team from sidebar, project
when drilled in, cycle when on a sprint).

### Multi-select and bulk edit

`issueBatchUpdate` exists. Linear: shift-arrow to extend, `⌘A` for all. Bind `x`
to toggle a mark, then `s`/`a`/`p` apply to every marked row.

**Explicitly declined** — noted here so it doesn't get re-proposed. Reconsider
only if sprint grooming from the terminal becomes a real habit.

## Tier 2 — fields already displayed but not editable

`openPicker` already generalizes over "load options, call `issueUpdate`". Each of
these is one `UpdateInput` variant plus an options loader:

| key       | field                   | input        | notes                                                   |
| --------- | ----------------------- | ------------ | ------------------------------------------------------- |
| `l`       | labels                  | `labelIds`   | `team.labels` / root `issueLabels`; multi-select picker |
| `e`       | estimate                | `estimate`   | `team.issueEstimationType` decides the scale            |
| `shift+d` | due date                | `dueDate`    | needs a date input, not a picker                        |
| `shift+p` | project                 | `projectId`  | `team.projects` already queried for the projects view   |
| `shift+c` | cycle                   | `cycleId`    | `team.cycles`                                           |
| `i` / `u` | assign to me / unassign | `assigneeId` | no picker at all — `viewer.id` is in `boot`             |

`i` and `u` are the cheapest lines in this file and are the two Linear shortcuts
you'd miss most.

Also: `commentResolve` / `commentUnresolve` exist. The detail pane already renders
`✓ resolved`, so it reads resolution state but can't set it.

## Tier 3 — a TUI can beat the web app here

### Branch → issue

`issueVcsBranchSearch(branchName:)` maps a git branch back to its issue. Launch
with no argument inside a repo and open the issue you're on. Nobody's web app
does this.

### `issue start`

schpet's headline feature: pick from your assigned issues, move to In Progress,
`git checkout -b $branchName`, one keystroke. You already fetch `branchName` and
already shell out in `shell.ts`.

### Hand the issue to Claude

roeyazroel's TUI spawns a Claude or Cursor agent on the selected issue from
`prompts.json` templates and streams output back. Given how this workspace runs,
a key that shells `claude "<issue body> — see BACKEND-1234"` in the repo the issue
maps to is a bigger lever here than any read feature. Linear also has first-class
`AgentSession` delegation now if you'd rather it run server-side.

## Tier 4 — navigation and display

- **Command palette** (`:` or `ctrl+k`). Both other TUIs and Linear have one. It's
  also the pressure valve for the keybinding budget — rare actions get discovered
  by name instead of by another single letter.
- **More `g` destinations.** The prefix exists now and only spends `gg`, `gi`,
  `gn`. Linear also has `ga` active, `gb` backlog, `gp` projects, `gt` triage.
- **Sort within a group.** Grouping is done; ordering inside each group is still
  whatever the view returned. Linear lets you set both independently.
- **Collapsible groups.** With grouping by project or assignee the list gets long;
  Linear collapses a group to its header. Needs a per-group open/closed set and
  `displayOrder` to skip collapsed members.
- **Local filter.** `/` is server-side full-text over all issues, in its own
  scope. Most of the time you want to narrow the 200 rows already on screen.
  Two different keys.
- **Filter panel** (`f`). By assignee, label, state, project. Cheap client-side
  over the loaded payload; saved views only cover filters you predefined in the
  web app. Search now has a header of its own, so its filters (only mine, one
  team, sort) can go there without costing the rest of the app anything.
- **Sort toggle.** Priority is hardcoded everywhere. Linear's display options let
  you flip to updated/created; k1-c and roeyazroel both expose it.
- **Back stack.** `esc` unwinds one level of project drill-in. A real history
  stack (Linear's `⌘[`) would make search → detail → back-to-where-I-was work.
- **Labels aren't rendered in list rows.** They're fetched, colored, and dropped
  on the floor. Colored chips when the terminal is wide enough.
- **Auto-refresh.** The 60s cache only helps if you press `r`. A sprint board left
  open all day shows morning's data.
- **Config file.** Both other TUIs have one (`~/.linear-tui/config.json`): default
  team/view, cache TTL, theme, density, keybindings. Everything here is
  hardcoded — `SIDEBAR_WIDTH`, the 60s TTL, the page sizes.
- **Triage.** Linear's `g t` plus `1`/`2`/`3` for accept/decline/duplicate. Only
  worth it if any of your teams actually run triage.
- **Copy menu.** `y` copies the branch name only. Linear has separate copies for
  identifier, URL, and title-as-markdown-link. `y` then a second key.

## Improvements to what's already here

Not features. These are defects and rough edges in the existing code, worst
first. Two were fixed while adding the inbox and are marked as such.

### The cursor tracks an array index, not an issue

`listSelected` is a number. Change an issue's priority, `refresh()` refetches,
the list re-sorts by priority, and the cursor is now on a _different_ issue at
the same index. Press `s` again and you edit the wrong ticket.

Pagination makes this worse: appending a page to a client-sorted view
(`Cycle.issues`, `Project.issues`) re-sorts everything already on screen.

Fix: track the selected issue's `id`, derive the index for rendering. Every
`setListSelected(n)` becomes a lookup.

### Fixed while adding link buttons

- **Terminal selection was simply gone.** Mouse reporting forwards drags to the
  app, so highlight-and-cmd+c copied nothing and looked like a bug in the
  terminal. OpenTUI tracks its own selection over selectable text and emits it on
  drag end; the app copies that now.

### Fixed while adding linked PRs

- **Every comment and reply failed.** `commentCreate` names three anchors and the
  app passed `null` for the two that did not apply; Linear counts a null as
  defined and rejected the call. The input is one object built from the anchor
  union now, and the stub enforces "exactly one" so this cannot go green again.
- **Replying to a reply was refused.** `r` sent the selected comment's own id as
  `parentId`, which Linear rejects past one level of threading. `replyTarget()`
  resolves it to the thread root; the mouse Reply button always did this, which
  is why only the keyboard path broke.

### `G` never fires

Shifted letters arrive as `name: "g"` with `sequence: "G"`, and `is()` matches
either field. The go-prefix branch (`is(key, "g")`) therefore swallows shift+g
and returns before the `G` handler below it ever runs — so jump-to-last-row is
dead in the sidebar and the list, while the README and the help overlay both
advertise it. Found while adding `O`, which works only because it sits above
every bare-`o` branch.

Fix: `if (is(key, "g") && !key.shift)` on the prefix branch. Worth a test that
presses `G` — nothing covered it, which is why this sat here.

### Errors auto-dismiss after three seconds

`notify()` carries both "copied branch" and "Linear rejected the update —
read-only key". The message you _must_ read is the one that vanishes while
you're still looking at the list. Errors should stick until the next keypress;
only successes should time out.

### `invalidateCache()` clears everything on every write

`edit.ts`. Change one priority and the team-workflow cache goes too — the one
whose own comment says it changes "on the order of weeks". Now that pages are
cached per cursor, one write also throws away every page you had scrolled
through. Wants key-scoped invalidation.

### Refresh blanks the list

`setListLoading(true)` makes `IssueList` drop every row for "Loading…". Pressing
`r` on a full board flashes empty. Keep the stale rows and dim them — the data is
right there.

### No optimistic update

`s` costs a round trip for the mutation, then a second one to refetch, before the
row changes. Linear's whole feel is optimistic. Patch local state first and
reconcile.

### The mode/focus ref pairs want a reducer

`app.tsx` keeps `useState` + `useRef` for both `mode` and `focus` because the key
handler needs a synchronous read — the comment there says as much. The `g`-prefix
work added a third such ref. `useReducer` gives synchronous access to previous
state and deletes all of them. Worth doing before the next mode lands.

### Detail fetches bypass the cache

`fetchDetail` calls `gql` directly while every other read path goes through
`cached()`. Open an issue, `esc`, open it again — that's two requests.

### Fixed in the inbox pass

- **`notify()` leaked timers.** Each call scheduled a new `setTimeout` without
  clearing the last, so two notifications 100ms apart left the second on screen
  for 100ms instead of 3s. One ref.
- **`SEARCH_ISSUES` duplicated the whole field selection** because `searchIssues`
  returns `IssueSearchResult`, not `Issue`, and a `fragment on Issue` cannot
  apply. Both fragments are now built from one `ISSUE_BODY` string.

## Follow-ons to the project workspace

Cheap now that the panes and the health picker exist:

- **Edit the project itself.** `projectUpdate` takes `statusId`, `leadId`,
  `targetDate`, `priority`. The Overview renders all four read-only, and
  `openPicker` already generalizes over "load options, mutate". `projectStatuses`
  is a root query.
- **Edit or archive your own update.** `projectUpdateUpdate` and
  `projectUpdateArchive` exist; the pane can already tell `isMe`.
- **Milestones as a drill-in.** `ProjectMilestone.issues` exists, so a milestone
  row could become a fourth tab's worth of issues.
- **Initiative rollup.** `Project.initiatives` is fetched by nothing. An
  initiative view would be the same three panes one level up —
  `initiativeUpdate` and `initiativeUpdateCreate` mirror the project ones, and
  `commentCreate` already takes `initiativeUpdateId`.

## Not worth it

`archivedAt` filtering, reactions (`reactionCreate`), issue relations
(`issueRelationCreate`), templates, documents, releases/diffs, customer requests.
All exist in the API and none of them are things you'd reach for from a terminal
— that's what the web app and the MCP are for.

Project status updates were on this list. They came off it: glancing at what a
project declared last week, and posting this week's, is exactly the kind of thing
you want without opening the app.
