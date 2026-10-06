import { useRef } from "react"
import type { Issue, Project } from "../linear/schema.ts"
import { color, formatDate, healthStyle, projectStatusGlyph, stateColor, stateGlyph } from "../theme.ts"
import { type GroupBy } from "../views.ts"
import { buildIssueRows, issuePullRequests, type SelectableIssueRow } from "../issueRows.js"
import { PullRequestRow } from "./IssueList.tsx"
import { clip, fit, meter, windowFor } from "./layout.ts"
import { wheel } from "./wheel.ts"

type Props = {
	title: string
	projects: Project[]
	selected: number
	selectedIssueId?: string | null
	selectedRowKey?: string | null | undefined
	expandedIssues?: ReadonlySet<string> | undefined
	expandedProjectId?: string | null
	expandable?: boolean
	focused: boolean
	loading: boolean
	error: string | null
	height: number
	preview?: { id: string; issues: Issue[]; loading: boolean; error: string | null } | null
	groupBy?: GroupBy
	/** First click selects, a click on the already-selected project drills in. */
	onPick: (index: number) => void
	onPickIssue?: (projectIndex: number, issue: Issue) => void
	onPickIssueRow?: ((projectIndex: number, row: SelectableIssueRow) => void) | undefined
	/** The wheel moves this pane's cursor, a row per event. */
	onScroll?: (delta: number) => void
}

export type ProjectRow =
	| { kind: "project"; project: Project; index: number }
	| { kind: "group" | "message"; text: string }
	| { kind: "issue" | "pr"; issue: Issue; projectIndex: number; row: SelectableIssueRow }

/** Shared by drawing and keyboard navigation: headers are deliberately not selectable. */
export function projectRows(
	projects: Project[],
	expandedProjectId: string | null,
	preview: Props["preview"],
	groupBy: GroupBy,
	expandedIssues?: ReadonlySet<string>,
): ProjectRow[] {
	const rows: ProjectRow[] = []
	for (const [index, project] of projects.entries()) {
		rows.push({ kind: "project", project, index })
		if (project.id !== expandedProjectId) continue
		if (!preview || preview.id !== project.id) {
			rows.push({ kind: "message", text: "  Loading tickets…" })
			continue
		}
		if (preview.error) rows.push({ kind: "message", text: `  ${preview.error}` })
		else {
			for (const row of buildIssueRows(preview.issues, groupBy, expandedIssues)) {
				if (row.t === "group") rows.push({ kind: "group", text: `  ${row.label} (${row.count})` })
				else rows.push({ kind: row.t, issue: row.issue, projectIndex: index, row })
			}
			if (preview.loading) rows.push({ kind: "message", text: "  Loading tickets…" })
			else if (!preview.issues.length) rows.push({ kind: "message", text: "  No tickets." })
		}
	}
	return rows
}

export function ProjectList({
	title,
	projects,
	selected,
	selectedIssueId,
	selectedRowKey,
	expandedIssues,
	expandedProjectId = null,
	expandable = false,
	focused,
	loading,
	error,
	height,
	preview,
	groupBy = "status",
	onPick,
	onPickIssue,
	onPickIssueRow,
	onScroll,
}: Props) {
	const offsetRef = useRef(0)
	const viewport = Math.max(1, height - 2)
	const rows = projectRows(projects, expandedProjectId, preview, groupBy, expandedIssues)
	const isActive = (row: ProjectRow) =>
		selectedIssueId
			? (row.kind === "issue" || row.kind === "pr") && (selectedRowKey ? row.row.key === selectedRowKey : row.kind === "issue" && row.issue.id === selectedIssueId)
			: row.kind === "project" && row.index === selected
	const selectedRow = rows.findIndex(isActive)
	offsetRef.current = windowFor(rows.length, Math.max(0, selectedRow), viewport, offsetRef.current)
	const visible = rows.slice(offsetRef.current, offsetRef.current + viewport)
	const selectable = rows.filter((row) => row.kind === "project" || row.kind === "issue" || row.kind === "pr")
	const position = selectable.findIndex(isActive)

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			border
			overflow="hidden"
			borderColor={focused ? color.borderFocus : color.border}
			title={title}
			titleColor={color.accent}
			bottomTitle={projects.length ? ` ${position + 1}/${selectable.length}` : ""}
			onMouseScroll={wheel(onScroll)}
		>
			{error ? (
				<text fg={color.urgent}>{error}</text>
			) : loading ? (
				<text fg={color.dim}>Loading…</text>
			) : projects.length === 0 ? (
				<text fg={color.dim}>No projects.</text>
			) : (
				visible.map((row, i) => {
					if (row.kind === "group" || row.kind === "message")
						return (
							<text key={`heading-${offsetRef.current + i}`} fg={color.faint} height={1} wrapMode="none" truncate>
								{row.text}
							</text>
						)
					if (row.kind === "issue" || row.kind === "pr") {
						const active = isActive(row)
						return (
							<box
								key={`${row.projectIndex}-${row.row.key}`}
								flexDirection="row"
								height={1}
								{...(active ? { backgroundColor: color.selectedBg } : {})}
								onMouseDown={() => (onPickIssueRow ? onPickIssueRow(row.projectIndex, row.row) : onPickIssue?.(row.projectIndex, row.issue))}
							>
								{row.row.t === "pr" ? (
									<PullRequestRow row={row.row} active={active} />
								) : (
									<>
										<text fg={stateColor(row.issue.state?.type, row.issue.state?.color)} flexShrink={0}>
											{`  ${stateGlyph(row.issue.state?.type)} `}
										</text>
										<text fg={active && focused ? color.accent : color.faint} flexShrink={0}>
											{expandedIssues && issuePullRequests(row.issue).length ? (expandedIssues.has(row.issue.id) ? "▾ " : "▸ ") : "  "}
											{fit(row.issue.identifier, 13)}
										</text>
										<text fg={active ? color.fg : color.dim} flexGrow={1} wrapMode="none" truncate>
											{row.issue.title}
										</text>
									</>
								)}
							</box>
						)
					}
					if (row.kind !== "project") return null
					const p = row.project
					const active = row.index === selected && !selectedIssueId
					const health = healthStyle(p.health)
					return (
						<box key={p.id} flexDirection="row" height={1} {...(active ? { backgroundColor: color.selectedBg } : {})} onMouseDown={() => onPick(row.index)}>
							<text flexShrink={0} fg={active ? color.accent : color.faint}>
								{expandable ? (p.id === expandedProjectId ? "▾ " : "▸ ") : active ? "▸ " : "  "}
							</text>
							{/* Status is the workflow; health is what the last update said. */}
							<text flexShrink={0} fg={stateColor(p.status?.type, p.status?.color)}>
								{`${projectStatusGlyph(p.status?.type)} `}
							</text>
							<text flexShrink={0} fg={health.fg}>{`${health.glyph} `}</text>
							<text fg={active ? color.fg : color.dim} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
								{p.name}
							</text>
							<text flexShrink={0} fg={color.faint}>
								{` ${meter(p.progress ?? 0, 10)} ${String(Math.round((p.progress ?? 0) * 100)).padStart(3)}%`}
							</text>
							<text flexShrink={0} fg={color.faint}>
								{` ${fit(clip(p.lead?.displayName ?? "", 12), 12)}`}
							</text>
							<text flexShrink={0} fg={color.faint}>{` ${fit(formatDate(p.targetDate), 12)}`}</text>
						</box>
					)
				})
			)}
		</box>
	)
}
