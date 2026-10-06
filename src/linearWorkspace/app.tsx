import { CliRenderEvents, type Selection, type SelectOption } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	addComment,
	archiveNotification,
	createProjectUpdate,
	HEALTHS,
	loadTeamWorkflow,
	PRIORITIES,
	setNotificationRead,
	unreadCount,
	updateIssue,
	type CommentAnchor,
	type Health,
} from "./edit.ts"
import { gitLabel, gitLinks, gitSummary } from "./git.ts"
import { gql, invalidateCache } from "./linear/client.ts"
import { BOOTSTRAP, ISSUE_DETAIL } from "./linear/queries.ts"
import {
	BootstrapSchema,
	IssueDetailSchema,
	type Bootstrap,
	type IssueDetail as Detail,
	type Issue,
	type Notification,
	type PageInfo,
	type Project,
	type ProjectUpdate,
} from "./linear/schema.ts"
import { copyToClipboard, openInBrowser } from "./shell.ts"
import { groupingKey, readGroupPreferences, writeGroupPreferences } from "./preferences.ts"
import { color } from "./theme.ts"
import {
	activeProjectTab,
	appendPage,
	buildNav,
	cursorOf,
	displayOrder,
	groupByLabel,
	GROUP_BY,
	hasMore,
	isSelectable,
	itemCount,
	loadTarget,
	nextProjectTab,
	projectRef,
	replyTarget,
	searchIssues,
	targetTitle,
	threadComments,
	type GroupBy,
	type Nav,
	type Payload,
	type ProjectTab,
	type Target,
} from "./views.ts"
import { CommentBox } from "./ui/CommentBox.tsx"
import { IssueDetail } from "./ui/IssueDetail.tsx"
import { IssueList } from "./ui/IssueList.tsx"
import { NotificationList } from "./ui/NotificationList.tsx"
import { Picker } from "./ui/Picker.tsx"
import { ProjectList, projectRows } from "./ui/ProjectList.tsx"
import { ProjectOverview } from "./ui/ProjectOverview.tsx"
import { ProjectTabs } from "./ui/ProjectTabs.tsx"
import { SearchBar } from "./ui/SearchBar.tsx"
import { Sidebar } from "./ui/Sidebar.tsx"
import { HelpOverlay, StatusBar } from "./ui/StatusBar.tsx"
import { UpdateDetail } from "./ui/UpdateDetail.tsx"
import { UpdateList } from "./ui/UpdateList.tsx"
import { buildIssueRows, issuePullRequests, selectableIssueRows, reconcileIssueRow, type SelectableIssueRow } from "./issueRows.js"
import { LinearLinkContext } from "./ui/Markdown.js"

const SIDEBAR_WIDTH = 26

/** "update" is one posted project update, the project workspace's leaf view. */
type Mode = "list" | "detail" | "update" | "search" | "help" | "picker" | "comment"
type Focus = "sidebar" | "list"
/**
 * "group" picks a grouping attribute rather than editing the issue, "health" is
 * the first half of posting a project update, and "pr" chooses which linked pull
 * request to open. Only the issue edit kinds go through `openPicker`.
 */
type EditPickerKind = "status" | "assignee" | "priority" | "cycle"
type PickerKind = EditPickerKind | "group" | "health" | "pr"

type PickerState = {
	kind: PickerKind
	title: string
	options: SelectOption[]
	/** Absent for "group" and "health", which do not edit an issue. */
	issueId?: string
	identifier?: string
}

/** Anything the edit bindings can act on -- a list row or the open detail. */
type Editable = Pick<Issue, "id" | "identifier" | "team">

/**
 * What the composer is about to post. One shape per surface rather than a bag
 * of optional ids, so the submit handler cannot send an issue comment to a
 * project update by forgetting to clear a field.
 */
type Compose = { kind: "comment"; label: string; anchor: CommentAnchor; parentId: string | null } | { kind: "project-update"; label: string; projectId: string; health: Health }

/** Key identity differs by terminal and kitty-protocol support; match either field. */
function is(key: { name: string; sequence: string }, ...candidates: string[]): boolean {
	return candidates.includes(key.name) || candidates.includes(key.sequence)
}

export type LinearWorkspaceProps = {
	active?: boolean
	inputBlocked?: boolean
	onCommandsChange?: (actions: import("./commandActions.js").LinearActions) => void
	width?: number
	height?: number
	onQuit?: () => void
	onNavigationLockChange?: (locked: boolean) => void
	onOpenGitHubLink?: (url: string) => boolean
	navigationNotice?: string | null
}

/** Native workspace; never creates a renderer or starts another CLI. */
export function App({
	active = true,
	inputBlocked = false,
	onCommandsChange,
	width: hostWidth,
	height: hostHeight,
	onQuit,
	onNavigationLockChange,
	onOpenGitHubLink,
	navigationNotice,
}: LinearWorkspaceProps = {}) {
	const renderer = useRenderer()
	const dimensions = useTerminalDimensions()
	const height = hostHeight ?? dimensions.height
	const width = hostWidth ?? dimensions.width

	const [boot, setBoot] = useState<Bootstrap | null>(null)
	const [fatal, setFatal] = useState<string | null>(null)

	const [navSelected, setNavSelected] = useState(0)

	/**
	 * `focus` and `mode` gate the key handler's branching, and several bindings
	 * change one then immediately depend on the new value (`l` then enter). React
	 * has not re-rendered by then, so the handler's closure would still hold the
	 * old value -- these refs are written synchronously and are what it reads.
	 */
	const [focus, setFocusState] = useState<Focus>("sidebar")
	const focusRef = useRef<Focus>("sidebar")
	const setFocus = useCallback((next: Focus) => {
		focusRef.current = next
		setFocusState(next)
	}, [])

	const [mode, setModeState] = useState<Mode>("list")
	const modeRef = useRef<Mode>("list")
	const setMode = useCallback(
		(next: Mode) => {
			modeRef.current = next
			onNavigationLockChange?.(next === "comment" || next === "search" || next === "picker")
			setModeState(next)
		},
		[onNavigationLockChange],
	)

	/** Where cancel/apply returns to: the list, or the detail it was opened from. */
	const returnModeRef = useRef<Mode>("list")

	const [target, setTarget] = useState<Target | null>(null)
	/** Set when drilled into a project, so esc restores the projects list behind it. */
	const [parentTarget, setParentTarget] = useState<Target | null>(null)
	const [payload, setPayload] = useState<Payload | null>(null)
	const [listLoading, setListLoading] = useState(false)
	const [listError, setListError] = useState<string | null>(null)
	const [listSelected, setListSelected] = useState(0)
	const [expandedIssues, setExpandedIssues] = useState<ReadonlySet<string>>(new Set())
	const [issueRowKey, setIssueRowKeyState] = useState<string | null>(null)
	const issueRowKeyRef = useRef<string | null>(null)
	const issueRowTargetRef = useRef<Target | null>(null)
	const issueRowSearchRef = useRef<string | null>(null)
	const expandedIssuesRef = useRef<ReadonlySet<string>>(expandedIssues)
	const issueListOffsetRef = useRef(0)
	const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
	const [projectIssueSelectedId, setProjectIssueSelectedId] = useState<string | null>(null)

	/**
	 * The search scope, or null when not searching. Its own state rather than a
	 * `Target` variant: while it is set the sidebar is not rendered at all, so
	 * there is no nav row for a target to correspond to.
	 *
	 * Paginated like any other view, so `hasMore` and the cursor travel with it,
	 * and the term rides along so the header and title need no second state.
	 */
	const [search, setSearch] = useState<{ term: string; issues: Issue[]; page: PageInfo } | null>(null)
	const searchTerm = search?.term ?? null
	const setIssueRowKey = useCallback(
		(key: string | null) => {
			issueRowTargetRef.current = target
			issueRowSearchRef.current = searchTerm
			issueRowKeyRef.current = key
			setIssueRowKeyState(key)
		},
		[target, searchTerm],
	)
	const [loadingMore, setLoadingMore] = useState(false)

	const [detail, setDetail] = useState<Detail | null>(null)
	const detailIssueIdRef = useRef<string | undefined>(undefined)
	const [detailLoading, setDetailLoading] = useState(false)
	const [detailError, setDetailError] = useState<string | null>(null)

	/** `t`: the detail pane's scrolling half shows the activity feed instead. */
	const [showActivity, setShowActivity] = useState(false)

	const [picker, setPicker] = useState<PickerState | null>(null)
	const [compose, setCompose] = useState<Compose | null>(null)
	const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null)
	const [editBusy, setEditBusy] = useState(false)
	useEffect(() => {
		onNavigationLockChange?.(mode === "comment" || mode === "search" || mode === "picker" || editBusy)
	}, [mode, editBusy, onNavigationLockChange])

	/**
	 * The open project update, tracked by id rather than by value: the list
	 * refetches after a comment lands, and the pane has to follow the new object.
	 */
	const [openUpdateId, setOpenUpdateId] = useState<string | null>(null)

	const [groupPreferences, setGroupPreferences] = useState(readGroupPreferences)
	const [flash, setFlash] = useState<string | null>(null)

	/** Unread badge for the sidebar. Null when Linear would not tell us the count. */
	const [unread, setUnread] = useState<number | null>(null)

	/**
	 * Half-typed `g` chord. A ref, not state: the key handler reads it on the very
	 * next keystroke, before React would have re-rendered.
	 */
	const prefixRef = useRef<string | null>(null)

	const nav: Nav[] = useMemo(() => (boot ? buildNav(boot) : []), [boot])

	/**
	 * One timer, cleared on each call. Without the ref the previous timeout
	 * survives and wipes the *next* message early -- two notifications 100ms apart
	 * left the second one on screen for 100ms.
	 */
	const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const notify = useCallback((msg: string) => {
		if (flashTimer.current) clearTimeout(flashTimer.current)
		setFlash(msg)
		flashTimer.current = setTimeout(() => setFlash(null), 3000)
	}, [])

	/**
	 * Drag-to-copy, because the terminal's own selection is gone.
	 *
	 * Mouse reporting sends every drag to this app instead of the terminal, so
	 * highlight-and-cmd+c selects nothing -- there is nothing for the terminal to
	 * copy. OpenTUI tracks its own selection over selectable text, and emits this
	 * once per finished drag (not per mouse move), so copying here costs one
	 * `pbcopy` per selection.
	 *
	 * The terminal's native selection is still reachable by holding the modifier
	 * that bypasses mouse reporting: option in iTerm2, fn in Terminal.app.
	 */
	useEffect(() => {
		if (!active) return
		const onSelection = (selection: Selection) => {
			const text = selection.getSelectedText()
			if (!text.trim()) return
			void copyToClipboard(text)
			const lines = text.split("\n").length
			notify(`copied ${text.length} chars${lines > 1 ? ` over ${lines} lines` : ""}`)
		}
		renderer.on(CliRenderEvents.SELECTION, onSelection)
		return () => {
			renderer.off(CliRenderEvents.SELECTION, onSelection)
		}
	}, [active, notify, renderer])

	useEffect(() => {
		gql(BOOTSTRAP, {}, BootstrapSchema)
			.then((b) => {
				setBoot(b)
				// Open on My Issues rather than the first selectable row, which is now the
				// Inbox -- landing there would spend a request on startup for a view you
				// may not have wanted, and it is one `gn` away regardless.
				const items = buildNav(b)
				const mine = items.findIndex((n) => n.kind === "my-issues")
				const first = mine === -1 ? items.findIndex(isSelectable) : mine
				setNavSelected(first === -1 ? 0 : first)
			})
			.catch((e: unknown) => setFatal(e instanceof Error ? e.message : String(e)))
	}, [])

	/** Sidebar selection is the source of truth for `target` until a drill-down overrides it. */
	useEffect(() => {
		const item = nav[navSelected]
		if (!item || item.kind === "header") return
		setTarget(item)
		setParentTarget(null)
	}, [nav, navSelected])

	useEffect(() => {
		if (!target) return
		let stale = false
		setListLoading(true)
		setListError(null)
		loadTarget(target)
			.then((p) => {
				if (stale) return
				// The previous payload can remain visible while this target loads.
				// Do not carry its occurrence key into the newly sorted ticket list.
				setIssueRowKey(null)
				setPayload(p)
				setListSelected((i) => Math.min(i, Math.max(0, itemCount(p) - 1)))
			})
			.catch((e: unknown) => !stale && setListError(e instanceof Error ? e.message : String(e)))
			.finally(() => !stale && setListLoading(false))
		return () => {
			stale = true
		}
	}, [target])

	// Searching replaces the body; the loaded view stays in `payload` for the
	// return trip but none of its panes are on screen.
	const showingProjects = !search && payload?.type === "projects"
	const showingInbox = !search && payload?.type === "notifications"
	const showingUpdates = !search && payload?.type === "updates"
	const showingOverview = !search && payload?.type === "overview"
	/** True for every pane whose rows are not issues. */
	const showingIssues = !showingProjects && !showingInbox && !showingUpdates && !showingOverview
	const groupKey = groupingKey(target, search !== null)
	const groupBy: GroupBy = groupPreferences[groupKey] ?? (target?.kind === "my-projects" ? "status" : "none")

	/** Fetch the expanded project's tickets, never every project on startup. */
	const selectedProject = target?.kind === "my-projects" && showingProjects ? (payload.projects.find((project) => project.id === expandedProjectId) ?? null) : null
	const [projectPreview, setProjectPreview] = useState<{ id: string; issues: Issue[]; loading: boolean; error: string | null } | null>(null)
	useEffect(() => {
		if (!selectedProject) {
			setProjectPreview(null)
			return
		}
		let stale = false
		const id = selectedProject.id
		setProjectPreview({ id, issues: [], loading: true, error: null })
		void (async () => {
			try {
				let page = await loadTarget({ kind: "project", project: selectedProject, tab: "issues" })
				if (page.type !== "issues") return
				let all = page.issues
				const cursors = new Set<string>()
				while (hasMore(page)) {
					if (stale) return
					const after = cursorOf(page)!
					if (cursors.has(after)) break
					cursors.add(after)
					page = await loadTarget({ kind: "project", project: selectedProject, tab: "issues" }, after)
					if (page.type !== "issues") break
					const seen = new Set(all.map((issue) => issue.id))
					all = [...all, ...page.issues.filter((issue) => !seen.has(issue.id))]
					if (!stale) setProjectPreview({ id, issues: all, loading: true, error: null })
				}
				if (!stale) setProjectPreview({ id, issues: all, loading: false, error: null })
			} catch (e) {
				if (!stale) setProjectPreview({ id, issues: [], loading: false, error: e instanceof Error ? e.message : String(e) })
			}
		})()
		return () => {
			stale = true
		}
	}, [selectedProject?.id, target])

	const issues: Issue[] = search?.issues ?? (payload?.type === "issues" ? payload.issues : [])
	const projects: Project[] = showingProjects ? payload.projects : []
	const projectListRows = target?.kind === "my-projects" ? projectRows(projects, expandedProjectId, projectPreview, groupBy, expandedIssues) : []
	const projectSelectableRows = projectListRows.filter((row) => row.kind === "project" || row.kind === "issue" || row.kind === "pr")
	const selectedProjectIssue = projectSelectableRows.find((row) => row.kind === "issue" && row.issue.id === projectIssueSelectedId)
	const projectIssue = selectedProjectIssue?.kind === "issue" ? selectedProjectIssue.issue : null
	const notifications: Notification[] = showingInbox ? payload.notifications : []
	const updates: ProjectUpdate[] = showingUpdates ? payload.updates : []
	const overview = showingOverview ? payload.project : null

	const currentIssue = issues[listSelected]
	const currentNotification = notifications[listSelected]
	/** Follows the payload, so a refetch after a comment lands re-renders the pane. */
	const openUpdate = updates.find((u) => u.id === openUpdateId) ?? null

	/**
	 * Park the cursor on whichever update is open. A no-op when the pane was opened
	 * from the list, and what leaves `esc` on the right row when it was opened from
	 * an inbox notification, which sets the id before the updates payload exists.
	 */
	useEffect(() => {
		if (!showingUpdates || !openUpdateId) return
		const at = updates.findIndex((u) => u.id === openUpdateId)
		if (at !== -1) setListSelected(at)
	}, [openUpdateId, showingUpdates, updates])

	/** The project tab strip, or null when the current view is not a project. */
	const projectTab = activeProjectTab(target)
	const projectName = target?.kind === "project" ? target.project.name : ""
	/**
	 * Which project pane to draw. Driven by the target rather than by the payload
	 * so the tab strip is never a request behind the tab you just pressed --
	 * search shadows it, the same way it shadows every other view.
	 */
	const inProject: ProjectTab | null = search ? null : projectTab

	/** Grouping only applies to issue rows; every other pane renders flat. */
	const effectiveGroupBy: GroupBy = showingIssues ? groupBy : "none"

	/** Screen order of the issue rows; selection stays an index into `issues`. */
	const issueOrder = useMemo(() => displayOrder(issues, effectiveGroupBy), [issues, effectiveGroupBy])
	const nestedIssues = showingIssues
	const previewIssues = showingProjects && target?.kind === "my-projects"
	const prDropdowns = nestedIssues || previewIssues
	const dropdownIssues = previewIssues ? (projectPreview?.id === expandedProjectId ? projectPreview.issues : []) : issues
	const dropdownGroupBy = previewIssues ? groupBy : effectiveGroupBy
	const dropdownIndex = previewIssues ? dropdownIssues.findIndex((issue) => issue.id === projectIssueSelectedId) : listSelected
	const nestedRows = useMemo(() => selectableIssueRows(buildIssueRows(dropdownIssues, dropdownGroupBy, expandedIssues)), [dropdownIssues, dropdownGroupBy, expandedIssues])
	// A row key follows refresh/grouping within a view, not unrelated lists that
	// happen to contain the same ticket. New views retain their issue-index cursor.
	const issueRowInScope = issueRowTargetRef.current === target && issueRowSearchRef.current === searchTerm
	const selectedIssueRow = prDropdowns && (!previewIssues || projectIssueSelectedId) ? reconcileIssueRow(nestedRows, issueRowInScope ? issueRowKey : null, dropdownIndex) : null
	const liveNestedRows = () => selectableIssueRows(buildIssueRows(dropdownIssues, dropdownGroupBy, expandedIssuesRef.current))
	const liveIssueRow = () =>
		prDropdowns && (!previewIssues || projectIssueSelectedId) ? reconcileIssueRow(liveNestedRows(), issueRowInScope ? issueRowKeyRef.current : null, dropdownIndex) : null
	useEffect(() => {
		if (!prDropdowns || (previewIssues && !projectIssueSelectedId)) return
		setIssueRowKey(selectedIssueRow?.key ?? null)
		if (selectedIssueRow && !previewIssues) setListSelected(selectedIssueRow.index)
	}, [prDropdowns, previewIssues, projectIssueSelectedId, selectedIssueRow?.key, selectedIssueRow?.index, setIssueRowKey])
	const selectIssueRow = useCallback(
		(row: SelectableIssueRow) => {
			setIssueRowKey(row.key)
			if (previewIssues) setProjectIssueSelectedId(row.issue.id)
			else setListSelected(row.index)
		},
		[previewIssues, setIssueRowKey],
	)

	const rowCount = showingProjects ? projects.length : showingInbox ? notifications.length : showingUpdates ? updates.length : showingOverview ? 0 : issues.length

	const moveList = useCallback(
		(delta: number) => {
			if (nestedIssues) {
				const rows = liveNestedRows()
				const current = liveIssueRow()
				const at = rows.findIndex((row) => row.key === current?.key)
				const row = rows[Math.max(0, Math.min(rows.length - 1, at + delta))]
				if (row) selectIssueRow(row)
				return
			}
			// The overview is one scrolling document; its scrollbox owns j/k.
			if (showingOverview) return
			if (target?.kind === "my-projects") {
				const at = projectSelectableRows.findIndex((row) =>
					projectIssueSelectedId ? (row.kind === "issue" || row.kind === "pr") && row.row.key === selectedIssueRow?.key : row.kind === "project" && row.index === listSelected,
				)
				const next = projectSelectableRows[Math.max(0, Math.min(projectSelectableRows.length - 1, at + delta))]
				if (next?.kind === "issue" || next?.kind === "pr") {
					setListSelected(next.projectIndex)
					selectIssueRow(next.row)
				} else if (next?.kind === "project") {
					setListSelected(next.index)
					setProjectIssueSelectedId(null)
				}
				return
			}
			setListSelected((cur) => {
				if (!showingIssues) return Math.max(0, Math.min(rowCount - 1, cur + delta))
				const at = issueOrder.indexOf(cur)
				const next = Math.max(0, Math.min(issueOrder.length - 1, (at === -1 ? 0 : at) + delta))
				return issueOrder[next] ?? cur
			})
		},
		[
			issueOrder,
			listSelected,
			projectIssueSelectedId,
			projectSelectableRows,
			rowCount,
			showingIssues,
			showingOverview,
			target,
			nestedIssues,
			nestedRows,
			selectedIssueRow,
			selectIssueRow,
		],
	)

	/** Jump to the first or last row *as drawn*, which grouping reorders. */
	const jumpList = useCallback(
		(edge: "top" | "bottom") => {
			if (nestedIssues) {
				const row = edge === "top" ? nestedRows[0] : nestedRows.at(-1)
				if (row) selectIssueRow(row)
				return
			}
			if (showingOverview) return
			if (target?.kind === "my-projects") {
				const row = edge === "top" ? projectSelectableRows[0] : projectSelectableRows.at(-1)
				if (row?.kind === "issue" || row?.kind === "pr") {
					setListSelected(row.projectIndex)
					selectIssueRow(row.row)
				} else if (row?.kind === "project") {
					setListSelected(row.index)
					setProjectIssueSelectedId(null)
				}
				return
			}
			if (!showingIssues) {
				setListSelected(edge === "top" ? 0 : Math.max(0, rowCount - 1))
				return
			}
			const at = edge === "top" ? issueOrder[0] : issueOrder[issueOrder.length - 1]
			if (at != null) setListSelected(at)
		},
		[issueOrder, projectSelectableRows, rowCount, showingIssues, showingOverview, target, nestedIssues, nestedRows, selectIssueRow],
	)

	/** Whether Linear has rows past what is loaded, for both search and normal views. */
	const morePages = search ? search.page.hasNextPage === true && search.page.endCursor != null : hasMore(payload)

	const fetchDetail = useCallback((issueId: string) => {
		detailIssueIdRef.current = issueId
		setDetailError(null)
		setDetailLoading(true)
		gql(ISSUE_DETAIL, { issueId }, IssueDetailSchema)
			.then((d) => setDetail(d.issue ?? null))
			.catch((e: unknown) => setDetailError(e instanceof Error ? e.message : String(e)))
			.finally(() => setDetailLoading(false))
	}, [])

	const openDetail = useCallback(
		(issue: Issue) => {
			setMode("detail")
			setDetail(null)
			setSelectedCommentId(null)
			// Each issue opens on its description; the feed is something you ask for.
			setShowActivity(false)
			fetchDetail(issue.id)
		},
		[fetchDetail, setMode],
	)

	/**
	 * The one way out of search, from the input or from the results. The view that
	 * was loaded before is still in `payload`, so leaving costs no request.
	 */
	const exitSearch = useCallback(() => {
		setSearch(null)
		setListSelected(0)
		setListError(null)
		setMode("list")
		setFocus("list")
	}, [setFocus, setMode])

	/** `/`: opens the query input, prefilled, whether or not results are up. */
	const startSearch = useCallback(() => {
		setListError(null)
		setMode("search")
	}, [setMode])

	/**
	 * Runs a query and shows its rows. Deliberately does not touch `mode`: this is
	 * also the refresh path, and an edit made from the detail pane must not close
	 * it.
	 */
	const runSearch = useCallback((term: string) => {
		const trimmed = term.trim()
		if (!trimmed) return
		// Keep the term on screen while the request is out, so the header does not
		// blank between submitting and the first page landing.
		setSearch((prev) => ({ term: trimmed, issues: prev?.issues ?? [], page: {} }))
		setListLoading(true)
		setListError(null)
		searchIssues(trimmed)
			.then((r) => {
				setSearch({ term: trimmed, ...r })
				setListSelected(0)
			})
			.catch((e: unknown) => setListError(e instanceof Error ? e.message : String(e)))
			.finally(() => setListLoading(false))
	}, [])

	/** Submitting the header's input. An empty query leaves the scope. */
	const submitSearch = useCallback(
		(term: string) => {
			if (!term.trim()) {
				exitSearch()
				return
			}
			setMode("list")
			setFocus("list")
			runSearch(term)
		},
		[exitSearch, runSearch, setFocus, setMode],
	)

	/** Re-pull whatever is on screen. Called after a write lands. */
	const refresh = useCallback(
		(detailIssueId?: string) => {
			// In search, re-run the query. Dropping the scope after every edit ejected
			// you from your own results, which the sidebar used to disguise as a return.
			if (search) runSearch(search.term)
			else setTarget((t) => (t ? { ...t } : t)) // new identity retriggers the load effect
			if (detailIssueId) fetchDetail(detailIssueId)
		},
		[fetchDetail, runSearch, search],
	)

	/**
	 * Drills into a project, landing on the Overview the way Linear's project page
	 * does. `parentTarget` is what `esc` and `h` unwind to.
	 */
	const openProject = useCallback(
		(project: Project, tab: ProjectTab = "overview") => {
			setParentTarget(target)
			setTarget({ kind: "project", project, tab })
			setListSelected(0)
		},
		[target],
	)

	/**
	 * Jumps from an issue to the project it belongs to -- the same drill-down a
	 * project row does, so `esc` unwinds back to the issue list. Leaves detail
	 * mode, since the project's panes replace the list underneath it.
	 */
	const openIssueProject = useCallback(
		(issue: Issue | Detail | null) => {
			if (!issue?.project) {
				notify("no project on this issue")
				return
			}
			setMode("list")
			openProject(projectRef(issue.project))
		},
		[notify, openProject, setMode],
	)

	/**
	 * Each tab is its own query, so switching one is a target change. It must not
	 * touch `parentTarget` -- esc still has to unwind to the projects list, not to
	 * the tab you were on a moment ago.
	 */
	const setProjectTab = useCallback((tab: ProjectTab) => {
		setTarget((t) => (t?.kind === "project" && t.tab !== tab ? { ...t, tab } : t))
		setListSelected(0)
		setOpenUpdateId(null)
	}, [])

	/**
	 * Pulls the next page and appends it.
	 *
	 * Guarded on `loadingMore` because the trigger is the cursor nearing the end of
	 * the list, which j-held-down fires on every keystroke -- without the guard a
	 * fast scroll launches a dozen identical requests.
	 */
	const loadMore = useCallback(() => {
		if (loadingMore) return

		if (search) {
			const after = search.page.endCursor
			if (!after || search.page.hasNextPage !== true) return
			setLoadingMore(true)
			searchIssues(search.term, after)
				.then((r) =>
					setSearch((prev) => {
						if (!prev) return prev
						const seen = new Set(prev.issues.map((i) => i.id))
						return {
							term: prev.term,
							issues: [...prev.issues, ...r.issues.filter((i) => !seen.has(i.id))],
							page: r.page,
						}
					}),
				)
				.catch((e: unknown) => notify(e instanceof Error ? e.message : String(e)))
				.finally(() => setLoadingMore(false))
			return
		}

		const after = cursorOf(payload)
		if (!target || !after || !hasMore(payload)) return
		setLoadingMore(true)
		loadTarget(target, after)
			.then((next) => setPayload((prev) => (prev ? appendPage(prev, next, target) : next)))
			.catch((e: unknown) => notify(e instanceof Error ? e.message : String(e)))
			.finally(() => setLoadingMore(false))
	}, [loadingMore, notify, payload, search, target])

	/**
	 * Fetch the next page before the cursor actually hits the end, so scrolling
	 * does not stall on a round trip.
	 */
	useEffect(() => {
		if (!morePages || loadingMore) return
		if (rowCount - listSelected <= 20) loadMore()
	}, [listSelected, loadMore, loadingMore, morePages, rowCount])

	/** Sidebar badge. Refreshed whenever a write invalidates the caches. */
	const refreshUnread = useCallback(() => {
		void unreadCount().then(setUnread)
	}, [])

	useEffect(refreshUnread, [refreshUnread])

	const moveNav = useCallback(
		(delta: number) => {
			setNavSelected((cur) => {
				let i = cur
				for (let step = 0; step < nav.length; step++) {
					i += delta
					if (i < 0 || i >= nav.length) return cur
					const item = nav[i]
					if (item && isSelectable(item)) return i
				}
				return cur
			})
		},
		[nav],
	)

	/**
	 * Submitting the query. Leaves search mode's editing state for its results,
	 * and an empty query leaves the scope entirely -- there is nothing to show.
	 */
	// ---- edit bindings ----

	const openPicker = useCallback(
		async (kind: EditPickerKind, issue: Editable) => {
			returnModeRef.current = modeRef.current === "detail" ? "detail" : "list"

			if (kind === "priority") {
				setPicker({
					kind,
					title: `Priority · ${issue.identifier}`,
					issueId: issue.id,
					identifier: issue.identifier,
					options: PRIORITIES.map((p) => ({ name: p.label, description: "", value: p.value })),
				})
				setMode("picker")
				return
			}

			const teamId = issue.team?.id
			if (!teamId) {
				notify("that issue has no team, so there is nothing to pick from")
				return
			}

			setMode("picker")
			setPicker({ kind, title: "Loading…", issueId: issue.id, identifier: issue.identifier, options: [] })

			try {
				const wf = await loadTeamWorkflow(teamId)
				if (!wf) {
					notify("could not load that team's workflow")
					setMode(returnModeRef.current)
					return
				}
				setPicker(
					kind === "status"
						? {
								kind,
								title: `Status · ${issue.identifier}`,
								issueId: issue.id,
								identifier: issue.identifier,
								options: wf.states.nodes.map((s) => ({
									name: s.name,
									description: s.type,
									value: s.id,
								})),
							}
						: kind === "assignee"
							? {
									kind,
									title: `Assignee · ${issue.identifier}`,
									issueId: issue.id,
									identifier: issue.identifier,
									options: [
										{ name: "Unassigned", description: "", value: null },
										...wf.members.nodes.map((m) => ({
											name: m.displayName,
											description: m.isMe ? "you" : "",
											value: m.id,
										})),
									],
								}
							: {
									kind,
									title: `Cycle · ${issue.identifier}`,
									options: [
										{ name: "No cycle", description: "remove from sprint", value: null },
										...(wf.activeCycle
											? [
													{
														name: "Current cycle",
														description: wf.activeCycle.name?.trim() || `Cycle ${wf.activeCycle.number}`,
														value: wf.activeCycle.id,
													},
												]
											: []),
										...wf.cycles.nodes
											.filter((cycle) => cycle.id !== wf.activeCycle?.id)
											.map((cycle) => ({
												name: cycle.name?.trim() || `Cycle ${cycle.number}`,
												description: `Cycle ${cycle.number}`,
												value: cycle.id,
											})),
									],
									issueId: issue.id,
									identifier: issue.identifier,
								},
				)
			} catch (e: unknown) {
				notify(e instanceof Error ? e.message : String(e))
				setMode(returnModeRef.current)
			}
		},
		[notify, setMode],
	)

	/** Grouping is a view setting, so it applies locally with no request and no refresh. */
	const openGroupPicker = useCallback(() => {
		returnModeRef.current = "list"
		setPicker({
			kind: "group",
			title: "Group by",
			options: GROUP_BY.map((g) => ({
				name: groupByLabel(g),
				description: g === groupBy ? "current" : "",
				value: g,
			})),
		})
		setMode("picker")
	}, [groupBy, setMode])

	/** Copy button on a comment or a PR row. One line of feedback, no refetch. */
	const copyLink = useCallback(
		(url: string) => {
			void copyToClipboard(url)
			notify(`copied ${url}`)
		},
		[notify],
	)
	const openLink = useCallback(
		(url: string) => {
			if (!onOpenGitHubLink?.(url)) void openInBrowser(url)
		},
		[onOpenGitHubLink],
	)
	const pickNestedRow = useCallback(
		(row: SelectableIssueRow) => {
			setFocus("list")
			if (row.key !== selectedIssueRow?.key) selectIssueRow(row)
			else if (row.t === "pr") openLink(row.link.url)
			else openDetail(row.issue)
		},
		[selectedIssueRow, selectIssueRow, setFocus, openLink, openDetail],
	)

	/**
	 * `O` on an issue. A single linked PR opens straight away; with several,
	 * picking is better than guessing which of five you meant.
	 */
	const openPr = useCallback(
		(issue: (Pick<Issue, "attachments"> & { identifier: string }) | null | undefined) => {
			if (!issue) return
			const links = gitLinks(issue)
			if (!links.length) {
				notify(`${issue.identifier} has no linked pull request`)
				return
			}
			if (links.length === 1) {
				openLink(links[0]!.url)
				return
			}
			returnModeRef.current = modeRef.current === "detail" ? "detail" : "list"
			setPicker({
				kind: "pr",
				title: `Open · ${issue.identifier}`,
				options: links.map((link) => ({
					name: `${gitLabel(link)}  ${link.repo}`,
					description: gitSummary(link, null, false),
					value: link.url,
				})),
			})
			setMode("picker")
		},
		[notify, setMode, openLink],
	)

	/**
	 * Posting a project update is two steps, the way Linear's composer is: pick a
	 * health, then write the body. The picker hands off to the composer rather
	 * than writing anything itself.
	 */
	const startProjectUpdate = useCallback(() => {
		if (target?.kind !== "project") return
		returnModeRef.current = "list"
		setPicker({
			kind: "health",
			title: `Health · ${target.project.name}`,
			options: HEALTHS.map((h) => ({ name: h.label, description: "", value: h.value })),
		})
		setMode("picker")
	}, [setMode, target])

	const applyPick = useCallback(
		async (option: SelectOption) => {
			if (!picker) return

			if (picker.kind === "group") {
				const next = option.value as GroupBy
				const updated = { ...groupPreferences, [groupKey]: next }
				setGroupPreferences(updated)
				try {
					writeGroupPreferences(updated)
				} catch (e) {
					notify(`could not save grouping: ${e instanceof Error ? e.message : String(e)}`)
				}
				notify(next === "none" ? "grouping off" : `grouped by ${next}`)
				setMode("list")
				setPicker(null)
				return
			}

			if (picker.kind === "health") {
				setPicker(null)
				if (target?.kind !== "project") {
					setMode("list")
					return
				}
				setCompose({
					kind: "project-update",
					label: target.project.name,
					projectId: target.project.id,
					health: option.value as Health,
				})
				setMode("comment")
				return
			}

			if (picker.kind === "pr") {
				setPicker(null)
				setMode(returnModeRef.current)
				openLink(option.value as string)
				return
			}

			const issueId = picker.issueId
			if (!issueId) return

			setEditBusy(true)
			try {
				const input =
					picker.kind === "status"
						? { stateId: option.value as string }
						: picker.kind === "assignee"
							? { assigneeId: (option.value as string | null) ?? null }
							: picker.kind === "priority"
								? { priority: option.value as number }
								: { cycleId: (option.value as string | null) ?? null }
				await updateIssue(issueId, input)
				notify(`${picker.identifier} → ${option.name}`)
				setMode(returnModeRef.current)
				refresh(returnModeRef.current === "detail" ? issueId : undefined)
			} catch (e: unknown) {
				notify(e instanceof Error ? e.message : String(e))
				setMode(returnModeRef.current)
			} finally {
				setEditBusy(false)
				setPicker(null)
			}
		},
		[groupKey, groupPreferences, notify, picker, refresh, setMode, target, openLink],
	)

	// ---- inbox ----

	/**
	 * Opening a notification marks it read, the way Linear's inbox does, and lands
	 * on the thing itself: an issue in the detail pane, a project in its
	 * workspace, one posted update in the update pane. Only the types that name
	 * neither -- documents, initiatives -- still fall back to the browser.
	 */
	const openNotification = useCallback(
		(n: Notification) => {
			if (!n.readAt) {
				void setNotificationRead(n.id, true)
					.then(refreshUnread)
					.catch(() => {
						/* opening still works; the badge just stays stale */
					})
			}
			if (n.issue) {
				setMode("detail")
				setDetail(null)
				setSelectedCommentId(null)
				fetchDetail(n.issue.id)
				return
			}
			if (n.project) {
				const updateId = n.projectUpdate?.id ?? null
				openProject(n.project, updateId ? "updates" : "overview")
				// The updates payload is a request away; the pane latches onto this id
				// once it lands, and renders as loading until then.
				setOpenUpdateId(updateId)
				setSelectedCommentId(null)
				setMode(updateId ? "update" : "list")
				return
			}
			void openInBrowser(n.url)
		},
		[fetchDetail, openProject, refreshUnread, setMode],
	)

	const inboxAction = useCallback(
		async (n: Notification, action: "archive" | "toggle-read") => {
			try {
				if (action === "archive") {
					await archiveNotification(n.id)
					notify("archived")
				} else {
					await setNotificationRead(n.id, !n.readAt)
					notify(n.readAt ? "marked unread" : "marked read")
				}
				refreshUnread()
				refresh()
			} catch (e: unknown) {
				notify(e instanceof Error ? e.message : String(e))
			}
		},
		[notify, refresh, refreshUnread],
	)

	/** One submit path for all four things the composer can post. */
	const submitCompose = useCallback(
		async (body: string) => {
			if (!compose) return
			setEditBusy(true)
			try {
				if (compose.kind === "project-update") {
					await createProjectUpdate(compose.projectId, body, compose.health)
					notify(`posted an update on ${compose.label}`)
				} else {
					await addComment(compose.anchor, body, compose.parentId)
					notify(compose.parentId ? `replied on ${compose.label}` : `commented on ${compose.label}`)
				}
				setMode(returnModeRef.current)
				// Only the issue detail is fetched separately; every other surface
				// renders from the list payload that `refresh` re-pulls.
				const issueId = returnModeRef.current === "detail" && compose.kind === "comment" ? ("issueId" in compose.anchor ? compose.anchor.issueId : undefined) : undefined
				refresh(issueId)
			} catch (e: unknown) {
				notify(e instanceof Error ? e.message : String(e))
				setMode(returnModeRef.current)
			} finally {
				setEditBusy(false)
				setCompose(null)
			}
		},
		[compose, notify, refresh, setMode],
	)

	/**
	 * Flat comment order as rendered: each root followed by its replies. Tracks
	 * whichever pane is open, since `tab` cycles comments in both.
	 */
	const activeComments = useMemo(() => (mode === "update" ? (openUpdate?.comments?.nodes ?? []) : (detail?.comments?.nodes ?? [])), [detail, mode, openUpdate])

	const commentIds = useMemo(() => threadComments(activeComments).flatMap((t) => [t.comment.id, ...t.replies.map((r) => r.id)]), [activeComments])

	const cycleComment = useCallback(
		(delta: number) => {
			if (!commentIds.length) return
			const cur = selectedCommentId ? commentIds.indexOf(selectedCommentId) : -1
			const next = cur === -1 ? (delta > 0 ? 0 : commentIds.length - 1) : (cur + delta + commentIds.length) % commentIds.length
			setSelectedCommentId(commentIds[next] ?? null)
		},
		[commentIds, selectedCommentId],
	)

	/** Comment on a project update, from either the updates list or the open one. */
	const startUpdateComment = useCallback(
		(update: ProjectUpdate, commentId: string | null) => {
			returnModeRef.current = modeRef.current === "update" ? "update" : "list"
			setCompose({
				kind: "comment",
				label: `${projectName} update`,
				anchor: { projectUpdateId: update.id },
				parentId: replyTarget(update.comments?.nodes ?? [], commentId),
			})
			setSelectedCommentId(commentId)
			setMode("comment")
		},
		[projectName, setMode],
	)

	/**
	 * Opens the composer against whatever pane is up. `commentId` null posts at
	 * the top level rather than threading.
	 */
	const startReply = useCallback(
		(commentId: string | null) => {
			if (modeRef.current === "update") {
				if (openUpdate) startUpdateComment(openUpdate, commentId)
				return
			}
			if (modeRef.current === "detail") {
				if (!detail) return
				returnModeRef.current = "detail"
				setCompose({
					kind: "comment",
					label: detail.identifier,
					anchor: { issueId: detail.id },
					parentId: replyTarget(detail.comments?.nodes ?? [], commentId),
				})
			} else {
				// The project overview. A project's own thread hangs off its document
				// content, which Linear leaves null until the body has been touched.
				const contentId = overview?.documentContent?.id
				if (!contentId) {
					notify("this project has no comment thread yet — give it a description in Linear first")
					return
				}
				returnModeRef.current = "list"
				setCompose({
					kind: "comment",
					label: overview?.name ?? projectName,
					anchor: { documentContentId: contentId },
					parentId: replyTarget(overview?.comments?.nodes ?? [], commentId),
				})
			}
			setSelectedCommentId(commentId)
			setMode("comment")
		},
		[detail, notify, openUpdate, overview, projectName, setMode, startUpdateComment],
	)

	const detailAction = useCallback(
		(action: EditPickerKind | "comment") => {
			if (!detail) return
			if (action === "comment") {
				startReply(null)
				return
			}
			void openPicker(action, detail)
		},
		[detail, openPicker, startReply],
	)

	// ---- mouse ----

	const pickNav = useCallback(
		(index: number) => {
			const item = nav[index]
			if (!item || item.kind === "header") return
			setNavSelected(index)
			setFocus("list")
		},
		[nav, setFocus],
	)

	/** Click selects; clicking the already-selected row is the "open" gesture. */
	const pickIssue = useCallback(
		(index: number) => {
			setFocus("list")
			if (index !== listSelected) {
				setListSelected(index)
				return
			}
			const issue = issues[index]
			if (issue) openDetail(issue)
		},
		[issues, listSelected, openDetail, setFocus],
	)

	const pickNotification = useCallback(
		(index: number) => {
			setFocus("list")
			if (index !== listSelected) {
				setListSelected(index)
				return
			}
			const n = notifications[index]
			if (n) openNotification(n)
		},
		[listSelected, notifications, openNotification, setFocus],
	)

	const pickProject = useCallback(
		(index: number) => {
			setFocus("list")
			if (index !== listSelected || projectIssueSelectedId) {
				setListSelected(index)
				setProjectIssueSelectedId(null)
				return
			}
			const project = projects[index]
			if (project) openProject(project)
		},
		[listSelected, openProject, projectIssueSelectedId, projects, setFocus],
	)

	const pickProjectIssue = useCallback(
		(index: number, issue: Issue) => {
			setFocus("list")
			if (projectIssueSelectedId === issue.id) openDetail(issue)
			else {
				setListSelected(index)
				setProjectIssueSelectedId(issue.id)
			}
		},
		[openDetail, projectIssueSelectedId, setFocus],
	)

	const openUpdatePane = useCallback(
		(u: ProjectUpdate) => {
			setOpenUpdateId(u.id)
			setSelectedCommentId(null)
			setMode("update")
		},
		[setMode],
	)

	const pickUpdate = useCallback(
		(index: number) => {
			setFocus("list")
			if (index !== listSelected) {
				setListSelected(index)
				return
			}
			const u = updates[index]
			if (u) openUpdatePane(u)
		},
		[listSelected, openUpdatePane, setFocus, updates],
	)

	/** Bindings shared by the list and the detail pane. Returns true if consumed. */
	const handleEditKey = useCallback(
		(key: { name: string; sequence: string }, issue: Editable | null | undefined): boolean => {
			if (!issue) return false
			if (is(key, "s")) {
				void openPicker("status", issue)
				return true
			}
			if (is(key, "a")) {
				void openPicker("assignee", issue)
				return true
			}
			if (is(key, "p")) {
				void openPicker("priority", issue)
				return true
			}
			// Shift+C must precede bare c because terminals report it as name=c,
			// sequence=C; `is()` intentionally accepts either representation.
			if (is(key, "C")) {
				void openPicker("cycle", issue)
				return true
			}
			if (is(key, "c")) {
				returnModeRef.current = modeRef.current === "detail" ? "detail" : "list"
				setCompose({
					kind: "comment",
					label: issue.identifier,
					anchor: { issueId: issue.id },
					parentId: null,
				})
				setMode("comment")
				return true
			}
			return false
		},
		[openPicker, setMode],
	)

	const setAllPrsExpanded = (expand?: boolean) => {
		const linkedIssues = dropdownIssues.filter((issue) => issuePullRequests(issue).length > 0)
		const shouldExpand = expand ?? !linkedIssues.every((issue) => expandedIssuesRef.current.has(issue.id))
		const next = new Set(expandedIssuesRef.current)
		for (const issue of linkedIssues) {
			if (shouldExpand) next.add(issue.id)
			else next.delete(issue.id)
		}
		expandedIssuesRef.current = next
		setExpandedIssues(next)
		const row = liveIssueRow()
		if (row) selectIssueRow(row)
		notify(shouldExpand ? "expanded all linked PRs" : "collapsed all linked PRs")
	}
	const refreshCurrentView = () => {
		prefixRef.current = null
		invalidateCache()
		refresh(modeRef.current === "detail" ? detailIssueIdRef.current : undefined)
		refreshUnread()
		notify("refreshing…")
	}
	const goTo = (kind: "my-issues" | "inbox") => {
		const at = nav.findIndex((n) => n.kind === kind)
		if (at !== -1) {
			prefixRef.current = null
			setSearch(null)
			setParentTarget(null)
			setMode("list")
			setNavSelected(at)
			setFocus("list")
		}
	}
	// Publish live implementations, not synthetic keystrokes or a second palette.
	// The host registers them in its existing Effect command registry.
	useEffect(() => {
		const actions: import("./commandActions.js").LinearActions = {}
		if (active && boot && !fatal && !editBusy && (mode === "list" || mode === "detail" || mode === "update")) {
			actions.myIssues = () => goTo("my-issues")
			actions.inbox = () => goTo("inbox")
			actions.refresh = refreshCurrentView
			actions.help = () => setMode("help")
			if (mode === "list") {
				actions.search = startSearch
				if (showingIssues || target?.kind === "my-projects") actions.group = openGroupPicker
				if (prDropdowns) {
					actions.toggleAllPrs = () => setAllPrsExpanded()
					actions.expandAllPrs = () => setAllPrsExpanded(true)
					actions.collapseAllPrs = () => setAllPrsExpanded(false)
				}
			}
		}
		for (const action of Object.keys(actions) as import("./commandActions.js").LinearAction[]) {
			const run = actions[action]!
			actions[action] = () => {
				// A composer/picker can open before the next render republishes availability.
				if (modeRef.current === "list" || modeRef.current === "detail" || modeRef.current === "update") run()
			}
		}
		onCommandsChange?.(actions)
	})

	useKeyboard((key) => {
		if (!active || inputBlocked || key.defaultPrevented || (key.ctrl && (is(key, "tab") || is(key, "left", "right")))) return
		// Text fields and the picker own their keystrokes; only cancel is global.
		// The input owns its keystrokes; escape is the only one taken from it.
		if (modeRef.current === "search") {
			if (is(key, "escape")) exitSearch()
			return
		}
		if (modeRef.current === "comment") {
			if (is(key, "escape")) setMode(returnModeRef.current)
			return
		}
		if (modeRef.current === "picker") {
			if (is(key, "escape")) {
				setMode(returnModeRef.current)
				setPicker(null)
			}
			return
		}

		if (is(key, "q") || (key.ctrl && is(key, "c"))) {
			if (onQuit) {
				onQuit()
				return
			}
			renderer.destroy()
			process.exit(0)
		}

		if (is(key, "?")) {
			setMode(modeRef.current === "help" ? "list" : "help")
			return
		}

		if (modeRef.current === "help") {
			if (is(key, "escape")) setMode("list")
			return
		}

		// Handle Shift+R before detail's bare r, which also matches a shifted name.
		if (is(key, "R") || (modeRef.current === "list" && is(key, "r"))) {
			refreshCurrentView()
			return
		}

		if (modeRef.current === "detail") {
			if (is(key, "escape", "h", "left")) {
				setMode("list")
				return
			}
			if (is(key, "tab")) {
				cycleComment(key.shift ? -1 : 1)
				return
			}
			if (is(key, "r")) {
				startReply(selectedCommentId)
				return
			}
			if (is(key, "t")) {
				setShowActivity((on) => !on)
				return
			}
			// Above `handleEditKey`, whose bare `p` (priority) would otherwise swallow
			// shift+p -- see the note below on how `is()` matches shifted keys.
			if (is(key, "P")) {
				openIssueProject(detail)
				return
			}
			if (handleEditKey(key, detail)) return
			// Shifted letters arrive as the lowercase `name` with the uppercase
			// `sequence`, and `is()` matches either -- so every shifted binding has to
			// sit above its bare twin, or the twin swallows it. (This is exactly how
			// `G` came to be dead; see IDEAS.md.)
			if (is(key, "Y") && detail?.url) {
				copyLink(detail.url)
				return
			}
			if (is(key, "y") && detail?.branchName) {
				void copyToClipboard(detail.branchName)
				notify(`copied ${detail.branchName}`)
				return
			}
			if (is(key, "O")) {
				openPr(detail)
				return
			}
			if (is(key, "o") && detail?.url) void openInBrowser(detail.url)
			return // scrollbox handles j/k itself
		}

		// A single project update. Same shape as the issue detail: tab cycles its
		// comments, r replies to the selected one, c posts at the top level.
		if (modeRef.current === "update") {
			if (is(key, "escape", "h", "left")) {
				setMode("list")
				setOpenUpdateId(null)
				return
			}
			if (is(key, "tab")) {
				cycleComment(key.shift ? -1 : 1)
				return
			}
			if (is(key, "r")) {
				startReply(selectedCommentId)
				return
			}
			if (is(key, "c")) {
				startReply(null)
				return
			}
			if (is(key, "Y") && openUpdate?.url) {
				copyLink(openUpdate.url)
				return
			}
			if (is(key, "o") && openUpdate?.url) void openInBrowser(openUpdate.url)
			return // scrollbox handles j/k itself
		}

		// ---- list mode ----
		const page = Math.max(1, Math.floor((height - 4) / 2))
		const liveSelectedIssueRow = liveIssueRow()
		const activeListIssue = liveSelectedIssueRow?.issue ?? currentIssue

		/** Opens whatever the selected row points at. Shared by enter and `l`/right. */
		const openSelected = () => {
			const row = liveIssueRow()
			if (row?.t === "pr") {
				openLink(row.link.url)
				return
			}
			if (row?.t === "issue") {
				openDetail(row.issue)
				return
			}
			if (showingInbox) {
				if (currentNotification) openNotification(currentNotification)
				return
			}
			if (showingProjects) {
				if (target?.kind === "my-projects" && projectIssue) {
					openDetail(projectIssue)
					return
				}
				const project = projects[listSelected]
				if (project) openProject(project)
				return
			}
			if (showingUpdates) {
				const u = updates[listSelected]
				if (u) openUpdatePane(u)
				return
			}
			if (showingOverview) return
			if (currentIssue) openDetail(currentIssue)
		}

		// GHUI owns digits. Linear project tabs use brackets or mouse clicks.
		if (projectTab) {
			if (is(key, "]")) {
				setProjectTab(nextProjectTab(projectTab, 1))
				return
			}
			if (is(key, "[")) {
				setProjectTab(nextProjectTab(projectTab, -1))
				return
			}
			if (is(key, "u")) {
				startProjectUpdate()
				return
			}
			if (is(key, "c") && showingOverview) {
				startReply(null)
				return
			}
			if (is(key, "c") && showingUpdates) {
				const u = updates[listSelected]
				if (u) startUpdateComment(u, null)
				return
			}
		}

		// The mirror of `h`/left, one step in rather than one step out: from the
		// sidebar into the list, and from a list row into what it points at. Not
		// gated on `search`, which only takes the sidebar away, never the rows.
		if (is(key, "l", "right")) {
			if (focusRef.current === "sidebar") setFocus("list")
			else openSelected()
			return
		}

		// Search has no sidebar, so the keys that reach for one do nothing there --
		// `h` used to focus a pane that was not on screen, which looked like a freeze.
		// Escape is the way out.
		if (!search) {
			if (is(key, "tab")) {
				setFocus(focusRef.current === "sidebar" ? "list" : "sidebar")
				return
			}
			if (is(key, "h", "left")) {
				if (focusRef.current === "list" && parentTarget) {
					setTarget(parentTarget)
					setParentTarget(null)
				} else {
					setFocus("sidebar")
				}
				return
			}
		}

		if (is(key, "escape")) {
			if (prefixRef.current) {
				prefixRef.current = null
			} else if (search) {
				exitSearch()
			} else if (parentTarget) {
				setTarget(parentTarget)
				setParentTarget(null)
			}
			return
		}

		// `g` is a go-prefix, matching Linear (gi my issues, gn inbox) and vim (gg top).
		if (prefixRef.current === "g") {
			prefixRef.current = null
			if (is(key, "g")) {
				if (focusRef.current === "sidebar") setNavSelected(nav.findIndex(isSelectable))
				else jumpList("top")
				return
			}
			const jumpTo = is(key, "i") ? "my-issues" : is(key, "n") ? "inbox" : null
			if (jumpTo) {
				goTo(jumpTo)
			}
			return
		}

		if (is(key, "g")) {
			prefixRef.current = "g"
			return
		}

		if (is(key, "G")) {
			if (focusRef.current === "sidebar") {
				setNavSelected(nav.length - 1 - [...nav].reverse().findIndex(isSelectable))
			} else {
				jumpList("bottom")
			}
			return
		}

		// Grouping moved off `g` when that became the go-prefix. It only means
		// anything over issue rows.
		if (is(key, "b") && (showingIssues || target?.kind === "my-projects")) {
			openGroupPicker()
			return
		}

		if (key.shift && is(key, "space", " ") && prDropdowns) {
			setAllPrsExpanded()
			return
		}

		if (is(key, "space", " ") && prDropdowns && focusRef.current === "list" && liveSelectedIssueRow) {
			const id = liveIssueRow()?.issue.id
			if (!id) return
			const next = new Set(expandedIssuesRef.current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			expandedIssuesRef.current = next
			setExpandedIssues(next)
			const row = liveIssueRow()
			if (row) selectIssueRow(row)
			return
		}
		if (is(key, "space", " ") && target?.kind === "my-projects" && focusRef.current === "list") {
			const id = projects[listSelected]?.id
			if (id) {
				setExpandedProjectId(expandedProjectId === id ? null : id)
				setProjectIssueSelectedId(null)
			}
			return
		}

		if (is(key, "/")) {
			startSearch()
			return
		}

		const step = is(key, "j", "down") ? 1 : is(key, "k", "up") ? -1 : 0
		const jump = key.ctrl && is(key, "d") ? page : key.ctrl && is(key, "u") ? -page : 0
		const delta = jump || step

		if (delta !== 0) {
			if (focusRef.current === "sidebar") moveNav(delta > 0 ? 1 : -1)
			else moveList(delta)
			return
		}

		if (is(key, "return", "enter")) {
			if (focusRef.current === "sidebar") setFocus("list")
			else openSelected()
			return
		}

		// A child is a navigation row, never an implicit Linear edit target.
		if (liveSelectedIssueRow?.t === "pr" && focusRef.current === "list") {
			if (is(key, "O", "o")) openLink(liveSelectedIssueRow.link.url)
			if (is(key, "Y", "y")) copyLink(liveSelectedIssueRow.link.url)
			return
		}
		// Inbox rows are notifications, not issues, so they take their own bindings
		// before the issue ones get a chance at `e`/`u`/`o`.
		if (showingInbox && focusRef.current === "list") {
			if (!currentNotification) return
			if (is(key, "e")) {
				void inboxAction(currentNotification, "archive")
				return
			}
			if (is(key, "u")) {
				void inboxAction(currentNotification, "toggle-read")
				return
			}
			if (is(key, "o")) void openInBrowser(currentNotification.url)
			return
		}

		// Edit bindings only apply to an issue row, so they must not steal `s`/`a`
		// from a projects, updates, or overview pane.
		// Above `handleEditKey` for the same reason as in detail mode: bare `p` is
		// the priority picker and would match shift+p first.
		if (is(key, "P") && (projectIssue ?? (showingIssues ? activeListIssue : null))) {
			openIssueProject((projectIssue ?? activeListIssue)!)
			return
		}
		if ((showingIssues || projectIssue) && focusRef.current === "list" && handleEditKey(key, projectIssue ?? activeListIssue)) return

		if (is(key, "o") && showingUpdates) {
			const u = updates[listSelected]
			if (u?.url) void openInBrowser(u.url)
			return
		}
		if (is(key, "o") && showingOverview && overview?.url) {
			void openInBrowser(overview.url)
			return
		}

		// Above the bare `y`, which shift+y would otherwise match -- see detail mode.
		// In a project, `Y` copies what `o` would open.
		if (is(key, "Y") && showingOverview) {
			if (overview?.url) copyLink(overview.url)
			return
		}
		if (is(key, "Y") && showingUpdates) {
			const u = updates[listSelected]
			if (u?.url) copyLink(u.url)
			return
		}
		if (is(key, "Y") && (projectIssue ?? (showingIssues ? currentIssue : null))) {
			copyLink((projectIssue ?? currentIssue)!.url)
			return
		}
		if (is(key, "y") && (projectIssue ?? (showingIssues ? currentIssue : null))?.branchName) {
			const branch = (projectIssue ?? currentIssue)!.branchName!
			void copyToClipboard(branch)
			notify(`copied ${branch}`)
			return
		}
		if (is(key, "O") && (showingIssues || projectIssue) && (projectIssue ?? activeListIssue)) {
			openPr(projectIssue ?? activeListIssue)
			return
		}
		if (is(key, "o") && (projectIssue ?? (showingIssues ? currentIssue : null))) void openInBrowser((projectIssue ?? currentIssue)!.url)
	})

	if (!active) return null

	if (fatal) {
		return (
			<box flexDirection="column" padding={1}>
				<text fg={color.urgent} wrapMode="word">
					{fatal}
				</text>
			</box>
		)
	}

	if (!boot) {
		return (
			<box padding={1}>
				<text fg={color.dim}>Connecting to Linear…</text>
			</box>
		)
	}

	const baseTitle = search ? `Search · "${search.term}"` : target ? targetTitle(target) : "Linear"
	// The grouping is not visible from the rows alone once it is anything but status.
	const title = effectiveGroupBy === "none" ? baseTitle : `${baseTitle} · by ${effectiveGroupBy}`
	const bodyHeight = height - 1
	/**
	 * Search is a scope, not a filter: the sidebar comes off the screen for both
	 * halves of it -- typing the query, and moving through the results.
	 */
	const searching = mode === "search" || search !== null

	return (
		<LinearLinkContext.Provider value={openLink}>
			<box flexDirection="column" width={width} height={height}>
				{mode === "help" ? (
					<HelpOverlay />
				) : mode === "picker" && picker ? (
					<Picker title={picker.title} options={picker.options} onSelect={applyPick} busy={editBusy} />
				) : mode === "comment" && compose ? (
					<CommentBox
						title={compose.kind === "project-update" ? `update on ${compose.label} · ${healthLabel(compose.health)}` : `comment on ${compose.label}`}
						placeholder={compose.kind === "project-update" ? "What happened this week? Markdown is fine." : "Markdown is fine. Enter makes a new line."}
						onSubmit={submitCompose}
						busy={editBusy}
					/>
				) : mode === "update" ? (
					<UpdateDetail
						projectName={projectName}
						update={openUpdate}
						// Opened from the inbox, the update is named before its project's
						// updates have been fetched -- that gap is loading, not a dead row.
						loading={listLoading || !showingUpdates}
						width={width}
						selectedCommentId={selectedCommentId}
						onComment={() => startReply(null)}
						onReply={startReply}
						onSelectComment={setSelectedCommentId}
						onCopyLink={copyLink}
						onOpenBrowser={() => {
							if (openUpdate?.url) void openInBrowser(openUpdate.url)
						}}
					/>
				) : mode === "detail" ? (
					<IssueDetail
						detail={detail}
						loading={detailLoading}
						error={detailError}
						width={width}
						selectedCommentId={selectedCommentId}
						showActivity={showActivity}
						onToggleActivity={() => setShowActivity((on) => !on)}
						onAction={detailAction}
						onReply={startReply}
						onSelectComment={setSelectedCommentId}
						onCopyBranch={() => {
							if (detail?.branchName) {
								void copyToClipboard(detail.branchName)
								notify(`copied ${detail.branchName}`)
							}
						}}
						onOpenBrowser={() => {
							if (detail?.url) void openInBrowser(detail.url)
						}}
						onOpenPr={() => openPr(detail)}
						onOpenProject={() => openIssueProject(detail)}
						onOpenLink={openLink}
						onCopyLink={copyLink}
					/>
				) : searching ? (
					<box flexDirection="column" flexGrow={1}>
						<SearchBar
							term={search?.term ?? ""}
							editing={mode === "search"}
							count={issues.length}
							hasMore={morePages}
							loading={listLoading}
							onSubmit={submitSearch}
							onEdit={startSearch}
						/>
						<IssueList
							title={title}
							expanded={expandedIssues}
							scrollOffsetRef={issueListOffsetRef}
							selectedRowKey={selectedIssueRow?.key}
							onPickRow={pickNestedRow}
							issues={issues}
							selected={listSelected}
							focused={mode !== "search"}
							groupBy={effectiveGroupBy}
							loading={listLoading}
							loadingMore={loadingMore}
							hasMore={morePages}
							error={listError}
							height={bodyHeight - 1}
							onPick={pickIssue}
							onScroll={moveList}
						/>
					</box>
				) : (
					<box flexDirection="row" flexGrow={1}>
						<Sidebar
							items={nav}
							selected={navSelected}
							focused={focus === "sidebar"}
							width={SIDEBAR_WIDTH}
							height={bodyHeight}
							unread={unread}
							onPick={pickNav}
							onScroll={moveNav}
						/>
						{showingInbox ? (
							<NotificationList
								title={title}
								notifications={notifications}
								selected={listSelected}
								focused={focus === "list"}
								loading={listLoading}
								loadingMore={loadingMore}
								hasMore={morePages}
								error={listError}
								height={bodyHeight}
								onPick={pickNotification}
								onScroll={moveList}
							/>
						) : showingProjects ? (
							<ProjectList
								title={title}
								projects={projects}
								selected={listSelected}
								focused={focus === "list"}
								loading={listLoading}
								error={listError}
								height={bodyHeight}
								onPick={pickProject}
								onPickIssue={pickProjectIssue}
								onScroll={moveList}
								selectedIssueId={target?.kind === "my-projects" ? projectIssueSelectedId : null}
								selectedRowKey={selectedIssueRow?.key}
								expandedIssues={previewIssues ? expandedIssues : undefined}
								onPickIssueRow={
									previewIssues
										? (index, row) => {
												setListSelected(index)
												pickNestedRow(row)
											}
										: undefined
								}
								expandedProjectId={target?.kind === "my-projects" ? expandedProjectId : null}
								expandable={target?.kind === "my-projects"}
								preview={target?.kind === "my-projects" ? projectPreview : null}
								groupBy={groupBy}
							/>
						) : inProject === "overview" ? (
							<ProjectOverview
								title={title}
								project={overview}
								// The payload lags the tab by one request; until it catches up the
								// pane is loading, even when `listLoading` has not been set yet.
								loading={listLoading || !showingOverview}
								error={listError}
								focused={focus === "list"}
								width={width - SIDEBAR_WIDTH}
								activeTab="overview"
								onTab={setProjectTab}
								selectedCommentId={selectedCommentId}
								onNewUpdate={startProjectUpdate}
								onComment={() => startReply(null)}
								onReply={startReply}
								onSelectComment={setSelectedCommentId}
								onCopyLink={copyLink}
								onOpenBrowser={() => {
									if (overview?.url) void openInBrowser(overview.url)
								}}
							/>
						) : inProject === "updates" ? (
							<UpdateList
								title={title}
								updates={updates}
								selected={listSelected}
								focused={focus === "list"}
								loading={listLoading || !showingUpdates}
								loadingMore={loadingMore}
								hasMore={morePages}
								error={listError}
								height={bodyHeight}
								activeTab="updates"
								onTab={setProjectTab}
								onPick={pickUpdate}
								onScroll={moveList}
							/>
						) : (
							<IssueList
								title={title}
								expanded={nestedIssues ? expandedIssues : undefined}
								scrollOffsetRef={nestedIssues ? issueListOffsetRef : undefined}
								selectedRowKey={nestedIssues ? selectedIssueRow?.key : undefined}
								onPickRow={nestedIssues ? pickNestedRow : undefined}
								issues={issues}
								selected={listSelected}
								focused={focus === "list"}
								groupBy={effectiveGroupBy}
								loading={inProject === "issues" ? listLoading || !showingIssues : listLoading}
								loadingMore={loadingMore}
								hasMore={morePages}
								error={listError}
								height={bodyHeight}
								header={inProject ? <ProjectTabs active="issues" focused={focus === "list"} onPick={setProjectTab} /> : undefined}
								onPick={pickIssue}
								onScroll={moveList}
							/>
						)}
					</box>
				)}

				<StatusBar flash={navigationNotice ?? flash} who={boot.viewer.displayName} width={width} />
			</box>
		</LinearLinkContext.Provider>
	)
}

function healthLabel(health: Health): string {
	return HEALTHS.find((h) => h.value === health)?.label ?? health
}
