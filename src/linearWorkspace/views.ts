/**
 * View model: turns the bootstrap payload into a flat navigable sidebar, and
 * maps the selected entry to the query that fills the issue list.
 *
 * Flat list (with inert header rows) rather than a tree -- j/k over one array
 * needs no expand/collapse state, and every destination is one keypress deep.
 */
import * as R from "remeda"
import { cached, gql } from "./linear/client.ts"
import * as Q from "./linear/queries.ts"
import {
	CustomViewIssuesSchema,
	CycleIssuesSchema,
	MyIssuesSchema,
	MyProjectsSchema,
	NotificationsSchema,
	ProjectDetailSchema,
	ProjectIssuesSchema,
	ProjectUpdatesSchema,
	SearchIssuesSchema,
	TeamIssuesSchema,
	TeamProjectsSchema,
	type Bootstrap,
	type Comment,
	type Cycle,
	type Issue,
	type Notification,
	type PageInfo,
	type Project,
	type ProjectDetail,
	type ProjectUpdate,
	type Team,
} from "./linear/schema.ts"

export type Nav =
	| { kind: "header"; label: string }
	| { kind: "inbox" }
	| { kind: "my-issues" }
	| { kind: "my-projects" }
	| { kind: "team"; team: Team }
	| { kind: "cycle"; team: Team; cycle: Cycle }
	| { kind: "projects"; team: Team }
	| { kind: "custom"; id: string; name: string }

/**
 * The three panes of a project, mirroring Linear's own project page. Each is a
 * separate query, so the tab is part of the target rather than a render flag.
 */
export const PROJECT_TABS = ["overview", "updates", "issues"] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]

export function projectTabLabel(tab: ProjectTab): string {
	return tab === "overview" ? "Overview" : tab === "updates" ? "Updates" : "Issues"
}

export function nextProjectTab(tab: ProjectTab, delta: number): ProjectTab {
	const i = PROJECT_TABS.indexOf(tab)
	return PROJECT_TABS[(i + delta + PROJECT_TABS.length) % PROJECT_TABS.length]!
}

/** A project drilled into from the projects list. Not a sidebar row. */
export type Target = Exclude<Nav, { kind: "header" }> | { kind: "project"; project: Project; tab: ProjectTab }

/**
 * An issue names only its project's id and name. Every project pane refetches by
 * id, so the columns missing here are never read -- only the list pane paints
 * them, and it comes from TEAM_PROJECTS.
 */
export function projectRef(p: { id: string; name: string }): Project {
	return {
		id: p.id,
		name: p.name,
		description: null,
		progress: null,
		targetDate: null,
		health: null,
		status: null,
		lead: null,
	}
}

export function isSelectable(n: Nav): boolean {
	return n.kind !== "header"
}

export function buildNav(boot: Bootstrap): Nav[] {
	const items: Nav[] = [{ kind: "header", label: "MINE" }, { kind: "inbox" }, { kind: "my-issues" }, { kind: "my-projects" }]

	// Linear's sidebar order, not the API's alphabetical one.
	const teams = R.sortBy(boot.viewer.teamMemberships.nodes, (m) => m.sortOrder).map((m) => m.team)
	for (const team of teams) {
		items.push({ kind: "header", label: team.key })
		items.push({ kind: "team", team })
		if (team.activeCycle) items.push({ kind: "cycle", team, cycle: team.activeCycle })
		items.push({ kind: "projects", team })
	}

	if (boot.customViews.nodes.length) {
		items.push({ kind: "header", label: "SAVED VIEWS" })
		for (const cv of boot.customViews.nodes) {
			items.push({ kind: "custom", id: cv.id, name: cv.name })
		}
	}

	return items
}

export function navLabel(n: Nav): string {
	switch (n.kind) {
		case "header":
			return n.label
		case "inbox":
			return "Inbox"
		case "my-issues":
			return "My Issues"
		case "my-projects":
			return "My Projects"
		case "team":
			return "All Issues"
		case "cycle":
			return n.cycle.name?.trim() || `Cycle ${n.cycle.number}`
		case "projects":
			return "Projects"
		case "custom":
			return n.name
	}
}

export function targetTitle(t: Target): string {
	switch (t.kind) {
		case "inbox":
			return "Inbox"
		case "my-issues":
			return "My Issues"
		case "my-projects":
			return "My Projects"
		case "team":
			return `${t.team.key} · All Issues`
		case "cycle":
			return `${t.team.key} · ${t.cycle.name?.trim() || `Cycle ${t.cycle.number}`}`
		case "projects":
			return `${t.team.key} · Projects`
		case "custom":
			return t.name
		case "project":
			return t.project.name
	}
}

/** Not folded into `targetTitle` -- the tab strip already names the active tab. */
export function activeProjectTab(t: Target | null): ProjectTab | null {
	return t?.kind === "project" ? t.tab : null
}

/** Cache key must distinguish every distinct query, or views bleed into each other. */
function cacheKey(t: Target): string {
	switch (t.kind) {
		case "inbox":
			return "inbox"
		case "my-issues":
			return "my-issues"
		case "my-projects":
			return "my-projects"
		case "team":
			return `team:${t.team.id}`
		case "cycle":
			return `cycle:${t.cycle.id}`
		case "projects":
			return `projects:${t.team.id}`
		case "custom":
			return `custom:${t.id}`
		case "project":
			return `project:${t.project.id}:${t.tab}`
	}
}

export type Payload =
	| { type: "issues"; issues: Issue[]; page: PageInfo }
	| { type: "notifications"; notifications: Notification[]; page: PageInfo }
	| { type: "projects"; projects: Project[] }
	| { type: "overview"; project: ProjectDetail }
	| { type: "updates"; updates: ProjectUpdate[]; page: PageInfo }

/** A connection with no `pageInfo` -- an unpaginated query, a stubbed test response -- is one page. */
const ONE_PAGE: PageInfo = { hasNextPage: false, endCursor: null }

function pageOf(info: PageInfo | null | undefined): PageInfo {
	return info ?? ONE_PAGE
}

/** The two unpaginated payloads: both are a single request with no cursor. */
function paged(p: Payload | null): { page: PageInfo } | null {
	return p && p.type !== "projects" && p.type !== "overview" ? p : null
}

export function hasMore(p: Payload | null): boolean {
	const it = paged(p)
	return it != null && it.page.hasNextPage === true && it.page.endCursor != null
}

export function cursorOf(p: Payload | null): string | null {
	return paged(p)?.page.endCursor ?? null
}

/** Rows in a payload, for cursor clamping and the "load the next page" trigger. */
export function itemCount(p: Payload): number {
	switch (p.type) {
		case "issues":
			return p.issues.length
		case "notifications":
			return p.notifications.length
		case "projects":
			return p.projects.length
		case "updates":
			return p.updates.length
		case "overview":
			return 0
	}
}

/** True where the server cannot sort for us and sortByPriority has to run client-side. */
function clientSorted(t: Target): boolean {
	return t.kind === "cycle" || t.kind === "project"
}

/**
 * Appends a freshly fetched page onto what is already on screen.
 *
 * Deduplicates by id: Linear paginates a live dataset, so a row edited between
 * two requests can cross the cursor boundary and arrive twice. Client-sorted
 * views re-sort the whole accumulated list rather than appending below it --
 * their order is ours to impose, not the server's to preserve.
 */
export function appendPage(prev: Payload, next: Payload, target: Target): Payload {
	if (prev.type === "issues" && next.type === "issues") {
		const seen = new Set(prev.issues.map((i) => i.id))
		const merged = [...prev.issues, ...next.issues.filter((i) => !seen.has(i.id))]
		return {
			type: "issues",
			issues: clientSorted(target) ? sortByPriority(merged) : merged,
			page: next.page,
		}
	}
	if (prev.type === "notifications" && next.type === "notifications") {
		const seen = new Set(prev.notifications.map((n) => n.id))
		return {
			type: "notifications",
			notifications: [...prev.notifications, ...next.notifications.filter((n) => !seen.has(n.id))],
			page: next.page,
		}
	}
	if (prev.type === "updates" && next.type === "updates") {
		const seen = new Set(prev.updates.map((u) => u.id))
		// Re-sorted, not appended: `projectUpdates` paginates by createdAt in the
		// server's direction, and the pane reads newest first regardless.
		return {
			type: "updates",
			updates: newestFirst([...prev.updates, ...next.updates.filter((u) => !seen.has(u.id))]),
			page: next.page,
		}
	}
	return next
}

/**
 * Mirrors Linear's "priority descending": Urgent(1) first, No priority(0) last.
 * Applied to connections that reject a `sort` argument -- Cycle.issues and
 * Project.issues -- so every view lands in the same order.
 */
export function sortByPriority(issues: Issue[]): Issue[] {
	return R.sortBy(issues, (i) => (i.priority ? i.priority : 5))
}

/** Latest update on top, the way Linear's project page reads. */
export function newestFirst(updates: ProjectUpdate[]): ProjectUpdate[] {
	return [...updates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/** Completed and canceled projects sink below the live ones. */
export function finishedProject(p: Project): boolean {
	return p.status?.type === "completed" || p.status?.type === "canceled"
}

/**
 * Fetches one page. `after` null is the first page, and it alone is cached under
 * the plain view key -- later pages get an entry keyed by cursor, so re-entering
 * a view costs one request instead of replaying every page you had scrolled to.
 */
export async function loadTarget(t: Target, after: string | null = null): Promise<Payload> {
	return cached(after ? `${cacheKey(t)}@${after}` : cacheKey(t), async (): Promise<Payload> => {
		switch (t.kind) {
			case "inbox": {
				const d = await gql(Q.NOTIFICATIONS, { after }, NotificationsSchema)
				return {
					type: "notifications",
					notifications: d.notifications.nodes,
					page: pageOf(d.notifications.pageInfo),
				}
			}
			case "my-issues": {
				const d = await gql(Q.MY_ISSUES, { after }, MyIssuesSchema)
				return { type: "issues", issues: d.issues.nodes, page: pageOf(d.issues.pageInfo) }
			}
			case "my-projects": {
				// Server order is most recently updated first -- kept as is. Finished
				// projects are dropped, not sunk: every project you ever led would
				// otherwise outnumber the live ones.
				const d = await gql(Q.MY_PROJECTS, {}, MyProjectsSchema)
				return {
					type: "projects",
					projects: d.projects.nodes.filter((p) => !finishedProject(p)),
				}
			}
			case "team": {
				const d = await gql(Q.TEAM_ISSUES, { teamId: t.team.id, after }, TeamIssuesSchema)
				return { type: "issues", issues: d.issues.nodes, page: pageOf(d.issues.pageInfo) }
			}
			case "cycle": {
				const d = await gql(Q.CYCLE_ISSUES, { cycleId: t.cycle.id, after }, CycleIssuesSchema)
				return {
					type: "issues",
					issues: sortByPriority(d.cycle?.issues.nodes ?? []),
					page: pageOf(d.cycle?.issues.pageInfo),
				}
			}
			case "projects": {
				const d = await gql(Q.TEAM_PROJECTS, { teamId: t.team.id }, TeamProjectsSchema)
				const projects = d.team?.projects.nodes ?? []
				// Live projects first, then by nearest target date -- backlog noise sinks.
				return {
					type: "projects",
					projects: R.sortBy(
						projects,
						(p) => (finishedProject(p) ? 1 : 0),
						(p) => p.targetDate ?? "9999",
					),
				}
			}
			case "project": {
				const projectId = t.project.id
				if (t.tab === "overview") {
					const d = await gql(Q.PROJECT_OVERVIEW, { projectId }, ProjectDetailSchema)
					if (!d.project) throw new Error("that project is not visible to this API key")
					return { type: "overview", project: d.project }
				}
				if (t.tab === "updates") {
					const d = await gql(Q.PROJECT_UPDATES, { projectId, after }, ProjectUpdatesSchema)
					return {
						type: "updates",
						// Linear's own project page reads newest first; `projectUpdates`
						// orders by createdAt ascending.
						updates: newestFirst(d.project?.projectUpdates.nodes ?? []),
						page: pageOf(d.project?.projectUpdates.pageInfo),
					}
				}
				const d = await gql(Q.PROJECT_ISSUES, { projectId, after }, ProjectIssuesSchema)
				return {
					type: "issues",
					issues: sortByPriority(d.project?.issues.nodes ?? []),
					page: pageOf(d.project?.issues.pageInfo),
				}
			}
			case "custom": {
				const d = await gql(Q.CUSTOM_VIEW_ISSUES, { viewId: t.id, after }, CustomViewIssuesSchema)
				return {
					type: "issues",
					issues: d.customView?.issues.nodes ?? [],
					page: pageOf(d.customView?.issues.pageInfo),
				}
			}
		}
	})
}

/** Search bypasses the cache -- the term changes on every keystroke-submit. */
export async function searchIssues(term: string, after: string | null = null): Promise<{ issues: Issue[]; page: PageInfo }> {
	const d = await gql(Q.SEARCH_ISSUES, { term, after }, SearchIssuesSchema)
	return { issues: d.searchIssues.nodes, page: pageOf(d.searchIssues.pageInfo) }
}

/**
 * Rebuilds comment threads. `Issue.comments` returns replies flat alongside
 * top-level comments, each carrying `parent { id }`, so one request has the whole
 * tree. Depth is capped at 1 for rendering: Linear only threads one level deep,
 * and an orphaned reply (parent outside the fetched page) is promoted to a root
 * rather than dropped.
 */
export type CommentNode = { comment: Comment; replies: Comment[] }

/**
 * What `parentId` must be to reply to `commentId`.
 *
 * Linear threads exactly one level: replying to a reply attaches to the thread
 * root, and passing the reply's own id is refused with "Parent comment must be a
 * top level comment". The thread pane lets you select a reply -- that is the
 * comment you are answering -- so the id has to be mapped here rather than at
 * selection time.
 */
export function replyTarget(comments: Comment[], commentId: string | null): string | null {
	if (!commentId) return null
	const parentId = comments.find((c) => c.id === commentId)?.parent?.id
	// An unknown parent means the root is off this page; the id we have is the best
	// available, and Linear will judge it.
	return parentId && comments.some((c) => c.id === parentId) ? parentId : commentId
}

export function threadComments(comments: Comment[]): CommentNode[] {
	const byId = new Set(comments.map((c) => c.id))
	const roots = comments.filter((c) => !c.parent || !byId.has(c.parent.id))
	const repliesByParent = R.groupBy(
		comments.filter((c) => c.parent && byId.has(c.parent.id)),
		(c) => c.parent!.id,
	)
	const oldestFirst = (a: Comment, b: Comment) => Date.parse(a.createdAt) - Date.parse(b.createdAt)

	return [...roots].sort(oldestFirst).map((comment) => ({
		comment,
		replies: [...(repliesByParent[comment.id] ?? [])].sort(oldestFirst),
	}))
}

// ---- grouping ----

/** Cycled by `b`, in this order. "none" is a flat list. */
export const GROUP_BY = ["none", "status", "assignee", "project", "priority", "cycle", "label"] as const

export type GroupBy = (typeof GROUP_BY)[number]

export type Group = { label: string; issues: Issue[] }

export function groupByLabel(by: GroupBy): string {
	return by === "none" ? "flat" : by
}

export function nextGroupBy(by: GroupBy, delta: number): GroupBy {
	const i = GROUP_BY.indexOf(by)
	return GROUP_BY[(i + delta + GROUP_BY.length) % GROUP_BY.length]!
}

/**
 * Bucket for issues with no value for the grouping attribute. Always sorted
 * last, the way Linear does it.
 */
const EMPTY: Record<Exclude<GroupBy, "none">, string> = {
	status: "No status",
	assignee: "Unassigned",
	project: "No project",
	priority: "No priority",
	cycle: "No cycle",
	label: "No labels",
}

/**
 * Sprint boards read best grouped by status in workflow order, which is what
 * `state.type` encodes. Within a group, Linear's priority sort is preserved.
 */
const STATE_ORDER = ["triage", "started", "unstarted", "backlog", "completed", "canceled", "duplicate"]

/** Linear priority is 0=none, 1=urgent .. 4=low, and reads Urgent first. */
const PRIORITY_LABEL: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" }

/**
 * The groups one issue belongs to. Only `label` returns more than one: an issue
 * carrying three labels appears under each, which is what Linear does. The list
 * renders it once per group against a single selection index, so selecting it
 * highlights every copy.
 */
function keysFor(issue: Issue, by: Exclude<GroupBy, "none">): string[] {
	switch (by) {
		case "status":
			return [issue.state?.name ?? EMPTY.status]
		case "assignee":
			return [issue.assignee?.displayName ?? EMPTY.assignee]
		case "project":
			return [issue.project?.name ?? EMPTY.project]
		case "priority":
			return [PRIORITY_LABEL[issue.priority ?? 0] ?? EMPTY.priority]
		case "cycle":
			return [issue.cycle ? issue.cycle.name?.trim() || `Cycle ${issue.cycle.number}` : EMPTY.cycle]
		case "label": {
			const names = issue.labels?.nodes.map((l) => l.name) ?? []
			return names.length ? names : [EMPTY.label]
		}
	}
}

/**
 * Status follows the workflow, priority runs Urgent..Low, everything else is
 * alphabetical. The empty bucket sinks to the bottom in all of them.
 */
function rankOf(by: Exclude<GroupBy, "none">, g: Group): [number, string] {
	if (g.label === EMPTY[by]) return [Number.MAX_SAFE_INTEGER, ""]
	switch (by) {
		case "status": {
			const idx = STATE_ORDER.indexOf(g.issues[0]?.state?.type ?? "")
			return [idx === -1 ? STATE_ORDER.length : idx, g.label.toLowerCase()]
		}
		case "priority": {
			const idx = Object.values(PRIORITY_LABEL).indexOf(g.label)
			return [idx === -1 ? 9 : idx, ""]
		}
		default:
			return [0, g.label.toLowerCase()]
	}
}

export function groupIssues(issues: Issue[], by: GroupBy): Group[] {
	if (by === "none") return [{ label: "", issues }]

	const buckets = new Map<string, Issue[]>()
	for (const issue of issues) {
		for (const key of keysFor(issue, by)) {
			const bucket = buckets.get(key)
			if (bucket) bucket.push(issue)
			else buckets.set(key, [issue])
		}
	}

	const groups = [...buckets].map(([label, members]) => ({ label, issues: members }))
	return R.sortBy(
		groups,
		(g) => rankOf(by, g)[0],
		(g) => rankOf(by, g)[1],
	)
}

/**
 * Row order on screen, as indices into `issues`. Grouping reorders rows while
 * selection stays an index into the payload, so j/k must step through this --
 * `selected + 1` is the next issue on screen only in the ungrouped view.
 *
 * Grouping by label repeats an issue across groups, so an index can appear more
 * than once here. That is intended: each repeat is a real row you can land on.
 */
export function displayOrder(issues: Issue[], by: GroupBy): number[] {
	if (by === "none") return issues.map((_, i) => i)
	const positionOf = new Map(issues.map((issue, i) => [issue.id, i]))
	return groupIssues(issues, by).flatMap((g) => g.issues.map((issue) => positionOf.get(issue.id) ?? 0))
}
