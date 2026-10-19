import { useContext, useRef, type ReactNode, type MutableRefObject } from "react"
import { githubPullRequestRoute } from "../../githubPullRequestRoute.js"
import { gitCell, gitLinks, primaryGitLink } from "../git.ts"
import type { Issue } from "../linear/schema.ts"
import { color, gitStatusStyle, priorityStyle, relativeAge, stateColor, stateGlyph } from "../theme.ts"
import { type GroupBy } from "../views.ts"
import { buildIssueRows, hasChildren, type SelectableIssueRow } from "../issueRows.js"
import { noSessions, useSpinner, type FaplexSession, type SessionsFor } from "../faplex.js"
import { gitSummary } from "../git.js"
import { CHECK_STYLE, PullRequestStatusContext, REVIEW_STYLE } from "../pullRequestStatus.ts"
import { clip, fit, windowFor } from "./layout.ts"
import { wheel } from "./wheel.ts"

/**
 * Width of the linked-PR cell: a leading gap, a status glyph, `#12345`, and the
 * `+` that says more PRs are attached. Every row pays for it, blank ones
 * included, so the column lines up down the list.
 */
const PR_COL = 9

/** The tree mark sits under the issue's priority column, two cells in from its caret. */
const PR_TREE_INDENT = 4

type Props = {
	scrollOffsetRef?: MutableRefObject<number> | undefined
	selectedRowKey?: string | null | undefined
	expanded?: ReadonlySet<string> | undefined
	/** Agent sessions per ticket, listed under its PRs when expanded. */
	sessionsFor?: SessionsFor | undefined
	onPickRow?: ((row: SelectableIssueRow) => void) | undefined
	title: string
	issues: Issue[]
	selected: number
	focused: boolean
	groupBy: GroupBy
	loading: boolean
	/** Set while a further page is in flight, so the footer can say so. */
	loadingMore?: boolean
	/** Whether Linear has more rows past what is loaded. Keeps the counter honest. */
	hasMore?: boolean
	error: string | null
	height: number
	/**
	 * Rendered above the rows, inside this pane's border. The project workspace
	 * puts its tab strip here rather than wrapping the list in a second box.
	 */
	header?: ReactNode
	/** First click selects the row, a click on the already-selected row opens it. */
	onPick: (index: number) => void
	/** The wheel moves this pane's cursor, a row per event. */
	onScroll?: (delta: number) => void
}

/**
 * Interleaves group headers into the issue sequence, preserving issue indices.
 *
 * Grouping by label puts one issue in several groups, so the same `index` can
 * appear on more than one row -- each is a real row, and selecting the issue
 * highlights all of them.
 */
export function IssueList({
	title,
	issues,
	selected,
	focused,
	groupBy,
	loading,
	loadingMore,
	hasMore,
	error,
	height,
	header,
	onPick,
	onScroll,
	selectedRowKey,
	expanded,
	sessionsFor = noSessions,
	onPickRow,
	scrollOffsetRef,
}: Props) {
	const localOffsetRef = useRef(0)
	const offsetRef = scrollOffsetRef ?? localOffsetRef
	const rows = buildIssueRows(issues, groupBy, expanded, sessionsFor)

	// 2 border rows, plus the header row and its margin when one is present.
	const viewport = Math.max(1, height - (header ? 4 : 2))
	const cursorRow = rows.findIndex((r) => (selectedRowKey ? r.key === selectedRowKey : r.t === "issue" && r.index === selected))
	offsetRef.current = windowFor(rows.length, Math.max(cursorRow, 0), viewport, offsetRef.current)
	const visible = rows.slice(offsetRef.current, offsetRef.current + viewport)

	// Counts the row on screen, not `selected` -- grouping reorders the two.
	const rowsAbove = rows.slice(0, Math.max(cursorRow, 0)).filter((r) => (expanded ? r.t !== "group" : r.t === "issue")).length
	// "+" rather than a total: past the loaded pages we do not know how many there are.
	const total = `${issues.length}${hasMore ? "+" : ""}`
	const totalRows = rows.filter((r) => r.t !== "group").length
	const counter = issues.length ? ` ${rowsAbove + 1}/${expanded ? `${totalRows} rows · ${total} issues` : total}${loadingMore ? " · loading…" : ""}` : ""

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			border
			overflow="hidden"
			borderColor={focused ? color.borderFocus : color.border}
			title={title}
			titleColor={color.accent}
			bottomTitle={counter}
			onMouseScroll={wheel(onScroll)}
		>
			{header}
			{error ? (
				<text fg={color.urgent}>{error}</text>
			) : loading ? (
				<text fg={color.dim}>Loading…</text>
			) : issues.length === 0 ? (
				<text fg={color.dim}>Nothing here.</text>
			) : (
				visible.map((row) =>
					row.t === "group" ? (
						<text key={row.key} fg={color.faint} height={1} wrapMode="none" truncate>
							{`${row.label} (${row.count})`}
						</text>
					) : row.t === "pr" ? (
						<PullRequestRow key={row.key} row={row} active={row.key === selectedRowKey} onPick={() => onPickRow?.(row)} />
					) : row.t === "session" ? (
						<SessionRow key={row.key} row={row} active={row.key === selectedRowKey} onPick={() => onPickRow?.(row)} />
					) : (
						<IssueRow
							key={row.key}
							issue={row.issue}
							expanded={expanded?.has(row.issue.id)}
							caretColumn={expanded !== undefined}
							expandable={expanded !== undefined && hasChildren(row.issue, sessionsFor)}
							session={sessionsFor(row.issue)[0]}
							active={selectedRowKey ? row.key === selectedRowKey : row.index === selected}
							focused={focused}
							onPick={() => (onPickRow ? onPickRow(row) : onPick(row.index))}
						/>
					),
				)
			)}
		</box>
	)
}

function IssueRow({
	issue,
	active,
	focused,
	onPick,
	caretColumn,
	expandable,
	expanded,
	session,
}: {
	issue: Issue
	active: boolean
	focused: boolean
	onPick: () => void
	/** Reserve the ▸/▾ cell on every row, so rows without PRs line up with rows that have them. */
	caretColumn?: boolean
	expandable?: boolean
	expanded?: boolean | undefined
	/** The ticket's most relevant agent session, if it has one. */
	session?: FaplexSession | undefined
}) {
	const prio = priorityStyle(issue.priority)
	const age = relativeAge(issue.updatedAt ?? issue.createdAt)
	const assignee = issue.assignee?.displayName ?? ""
	const fg = active ? color.fg : color.dim

	// The most relevant linked PR -- a PR before a bare branch push, in-flight
	// before merged. See primaryGitLink().
	const links = gitLinks(issue)
	const pr = primaryGitLink(issue)

	return (
		<box flexDirection="row" height={1} {...(active ? { backgroundColor: color.selectedBg } : {})} onMouseDown={onPick}>
			<text flexShrink={0} fg={stateColor(issue.state?.type, issue.state?.color)}>
				{`${stateGlyph(issue.state?.type)} `}
			</text>
			{caretColumn ? (
				<text flexShrink={0} fg={color.faint}>
					{expandable ? (expanded ? "▾ " : "▸ ") : "  "}
				</text>
			) : null}
			<text flexShrink={0} fg={prio.fg}>
				{prio.glyph}
			</text>
			<text flexShrink={0} fg={active && focused ? color.accent : color.faint}>
				{fit(issue.identifier, 13)}
			</text>
			<text fg={fg} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{issue.title}
			</text>
			{/* Expanded, the PR rows below say this; the blank cell keeps the column. */}
			<text flexShrink={0} fg={pr ? gitStatusStyle(pr.status).fg : color.faint}>
				{fit(pr && !expanded ? ` ${gitCell(pr, links.length > 1)}` : "", PR_COL)}
			</text>
			{session && !expanded ? (
				<box flexShrink={0} flexDirection="row">
					<text> </text>
					<SessionMark session={session} />
				</box>
			) : (
				<text flexShrink={0}>{"   "}</text>
			)}
			<text flexShrink={0} fg={color.faint}>{` ${fit(clip(assignee, 12), 12)}`}</text>
			<text flexShrink={0} fg={color.faint}>
				{age.padStart(4)}
			</text>
		</box>
	)
}

/**
 * A linked PR under its expanded issue. The tree sits under the title column so
 * PR status reads as its own column, apart from the issue status at the left
 * edge. Only the glyph carries the status color; review trouble turns the
 * detail red.
 */
export function PullRequestRow({ row, active, onPick }: { row: Extract<SelectableIssueRow, { t: "pr" }>; active: boolean; onPick?: () => void }) {
	const github = useContext(PullRequestStatusContext)(githubPullRequestRoute(row.link.url)?.url ?? row.link.url)
	// GitHub's review decision supersedes Linear's verdict tally once it arrives.
	const link = github ? { ...row.link, approvals: 0, changesRequested: 0 } : row.link
	const style = gitStatusStyle(link.status)
	const checks = github && CHECK_STYLE[github.checks]
	const review = github && REVIEW_STYLE[github.review]
	const trouble = link.changesRequested > 0 || link.hasConflicts
	return (
		<box flexDirection="row" height={1} {...(active ? { backgroundColor: color.selectedBg } : {})} {...(onPick ? { onMouseDown: onPick } : {})}>
			<text flexShrink={0} fg={color.faint}>{`${" ".repeat(PR_TREE_INDENT)}${row.last ? "└" : "├"} `}</text>
			<text flexShrink={0} fg={style.fg}>{`${style.glyph} `}</text>
			<text flexShrink={0} fg={active ? color.fg : color.dim}>{`#${link.number} `}</text>
			{checks ? <text flexShrink={0} fg={checks.fg}>{`${checks.glyph} `}</text> : null}
			{review ? <text flexShrink={0} fg={review.fg}>{`${review.label} `}</text> : null}
			<text fg={trouble ? color.urgent : color.dim} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{` ${gitSummary(link, row.issue.branchName).replace(`${style.glyph} `, "")}`}
			</text>
		</box>
	)
}

// faplex's list, mark for mark and color for color (faplex/src/list.tsx, theme.ts).
const SESSION_COLOR = { working: "#fde047", needs: "#f59e0b", failed: "#ef4444", other: "#a1a1aa" }
const HARNESS_COLOR: Record<string, string> = { claude: "#d97757", codex: "#e4e4e7", opencode: "#a78bfa", "opencode-mini": "#a78bfa" }
const HARNESS_SHORT: Record<string, string> = { claude: "clau", opencode: "oc", "opencode-mini": "ocm" }

const sessionColor = (status: FaplexSession["status"]) => (status === "working" || status === "needs" || status === "failed" ? SESSION_COLOR[status] : SESSION_COLOR.other)

/** faplex's gutter: a spinner while working, `!` needs input, `×` failed, `-` interrupted, blank otherwise. */
function SessionMark({ session }: { session: Pick<FaplexSession, "status" | "background"> }) {
	const mark = session.status === "working" ? <Spinner /> : session.status === "needs" ? "!" : session.status === "failed" ? "×" : session.status === "interrupted" ? "-" : " "
	const also = session.background?.kind === "agent" ? "⑂" : session.background?.kind === "shell" ? "$" : " "
	return (
		<text flexShrink={0} fg={sessionColor(session.status)}>
			{mark}
			{also}
		</text>
	)
}

/** Its own component, so the 80ms tick re-renders only working marks. */
function Spinner() {
	return <>{useSpinner()}</>
}

/**
 * An agent session under its expanded issue, laid out like faplex's list row:
 * status mark, `host·harness`, title, then the status line in the status color.
 */
export function SessionRow({ row, active, onPick }: { row: Extract<SelectableIssueRow, { t: "session" }>; active: boolean; onPick?: () => void }) {
	const { session } = row
	const status = session.status === "failed" || session.status === "interrupted" ? session.status : ""
	return (
		<box flexDirection="row" height={1} {...(active ? { backgroundColor: color.selectedBg } : {})} {...(onPick ? { onMouseDown: onPick } : {})}>
			<text flexShrink={0} fg={color.faint}>{`${" ".repeat(PR_TREE_INDENT)}${row.last ? "└" : "├"} `}</text>
			<SessionMark session={session} />
			<text flexShrink={0} fg={session.hostColor ?? color.dim}>
				{session.host ?? session.machine}
			</text>
			<text flexShrink={0} fg={HARNESS_COLOR[session.harness] ?? color.dim}>{`·${HARNESS_SHORT[session.harness] ?? session.harness}  `}</text>
			<text flexShrink={0} fg={active || session.open ? color.fg : color.dim}>
				{clip(session.title, 48)}
			</text>
			<text fg={sessionColor(session.status)} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{`  ${(session.detail || status).split("\n")[0]}`}
			</text>
			<text flexShrink={0} fg={color.faint}>
				{relativeAge(new Date(session.updatedAt).toISOString()).padStart(5)}
			</text>
		</box>
	)
}
