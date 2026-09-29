import type { ProjectDetail } from "../linear/schema.ts"
import { color, COPY_ICON, formatDate, healthStyle, milestoneStyle, projectStatusGlyph, relativeAge, stateColor } from "../theme.ts"
import type { ProjectTab } from "../views.ts"
import { Button, buttonWidth } from "./Button.tsx"
import { CommentThread } from "./CommentThread.tsx"
import { Markdown } from "./Markdown.tsx"
import { clip, meter } from "./layout.ts"
import { ProjectTabs } from "./ProjectTabs.tsx"

type Props = {
	title: string
	project: ProjectDetail | null
	loading: boolean
	error: string | null
	focused: boolean
	/** Terminal width, so the action row can drop buttons that will not fit. */
	width: number
	activeTab: ProjectTab
	onTab: (tab: ProjectTab) => void
	selectedCommentId: string | null
	onNewUpdate: () => void
	onComment: () => void
	onReply: (commentId: string) => void
	onSelectComment: (commentId: string) => void
	/** Puts a permalink on the clipboard: the project's own, or a comment's. */
	onCopyLink: (url: string) => void
	onOpenBrowser: () => void
}

type Action = { label: string; hint: string; onPress: () => void }

/** Same rule as the issue detail: drop trailing buttons rather than squeeze them. */
function fittingActions(available: number, actions: Action[]): Action[] {
	let used = 0
	return actions.filter((action) => {
		const next = used + buttonWidth(action.label, action.hint)
		if (next > available) return false
		used = next
		return true
	})
}

/** `flexShrink={0}` keeps yoga from collapsing one-line rows in a short pane. */
function Field({ label, value, fg }: { label: string; value: string; fg?: string }) {
	return (
		<box flexDirection="row" flexShrink={0} height={1}>
			<text fg={color.faint} flexShrink={0}>
				{label.padEnd(11)}
			</text>
			<text fg={fg ?? color.fg} flexGrow={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{value}
			</text>
		</box>
	)
}

/** "Jul 1, 2026 → Sep 1, 2026", collapsing to one side when only one is set. */
function dateRange(start: string | null | undefined, target: string | null | undefined): string {
	if (!start && !target) return "—"
	if (!start) return `→ ${formatDate(target)}`
	if (!target) return `${formatDate(start)} →`
	return `${formatDate(start)} → ${formatDate(target)}`
}

/**
 * The project workspace's first tab: everything Linear puts above the fold on a
 * project page, plus the project's own comment thread.
 *
 * Project-level comments hang off `documentContent`, which Linear leaves null
 * until a project's body has been touched. When it is null the thread renders
 * without an Add button rather than offering a `c` that would fail.
 */
export function ProjectOverview({
	title,
	project,
	loading,
	error,
	focused,
	width,
	activeTab,
	onTab,
	selectedCommentId,
	onNewUpdate,
	onComment,
	onReply,
	onSelectComment,
	onCopyLink,
	onOpenBrowser,
}: Props) {
	if (error) {
		return (
			<box border borderColor={color.urgent} flexGrow={1} title="error">
				<text fg={color.urgent} wrapMode="word">
					{error}
				</text>
			</box>
		)
	}

	const health = healthStyle(project?.health)
	const milestones = project?.projectMilestones?.nodes ?? []
	const members = project?.members?.nodes ?? []
	const last = project?.lastUpdate
	const body = project?.content?.trim() || project?.description?.trim() || ""
	const canComment = project?.documentContent?.id != null

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			overflow="hidden"
			border
			borderColor={focused ? color.borderFocus : color.border}
			title={title}
			titleColor={color.accent}
			bottomTitle=" 1/2/3 or [ ] switch tab · u new update · esc back "
		>
			<ProjectTabs active={activeTab} focused={focused} onPick={onTab} />

			{loading || !project ? (
				<text fg={color.dim}>Loading…</text>
			) : (
				<>
					<box flexDirection="row" flexShrink={0} height={1} marginBottom={1} overflow="hidden">
						{fittingActions(width - 2, [
							{ label: "New update", hint: "u", onPress: onNewUpdate },
							...(canComment ? [{ label: "Comment", hint: "c", onPress: onComment }] : []),
							{ label: "Open", hint: "o", onPress: onOpenBrowser },
							...(project.url ? [{ label: COPY_ICON, hint: "Y", onPress: () => onCopyLink(project.url!) }] : []),
						]).map((action) => (
							<Button key={action.label} label={action.label} hint={action.hint} onPress={action.onPress} />
						))}
					</box>

					<Field label="Status" value={`${projectStatusGlyph(project.status?.type)} ${project.status?.name ?? "—"}`} fg={stateColor(project.status?.type, project.status?.color)} />
					<Field
						label="Health"
						value={project.healthUpdatedAt ? `${health.glyph} ${health.label} · set ${relativeAge(project.healthUpdatedAt)} ago` : `${health.glyph} ${health.label}`}
						fg={health.fg}
					/>
					<Field label="Lead" value={project.lead?.displayName ?? "Unassigned"} />
					{members.length ? <Field label="Members" value={members.map((m) => m.displayName).join(", ")} fg={color.dim} /> : null}
					<Field label="Dates" value={dateRange(project.startDate, project.targetDate)} />
					<Field
						label="Progress"
						value={`${meter(project.progress ?? 0, 16)} ${Math.round((project.progress ?? 0) * 100)}%` + (project.scope ? ` · scope ${project.scope}` : "")}
						fg={color.dim}
					/>

					<scrollbox focused={focused} flexGrow={1} flexShrink={1} minHeight={0} marginTop={1} scrollY contentOptions={{ flexDirection: "column" }}>
						{milestones.length ? (
							<box flexDirection="column" flexShrink={0}>
								<text fg={color.faint}>{`MILESTONES (${milestones.length})`}</text>
								{milestones.map((m) => {
									const style = milestoneStyle(m.status)
									return (
										<box key={m.id} flexDirection="row" height={1} flexShrink={0}>
											<text flexShrink={0} fg={style.fg}>{`  ${style.glyph} `}</text>
											<text fg={color.fg} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
												{m.name}
											</text>
											<text flexShrink={0} fg={color.faint}>
												{` ${String(Math.round((m.progress ?? 0) * 100)).padStart(3)}%  ${formatDate(m.targetDate)}`}
											</text>
										</box>
									)
								})}
							</box>
						) : null}

						<box flexDirection="column" marginTop={milestones.length ? 1 : 0} flexShrink={0}>
							<text fg={color.faint}>LATEST UPDATE</text>
							{last ? (
								<box flexDirection="column" flexShrink={0}>
									<box flexDirection="row" flexShrink={0} height={1}>
										<text flexShrink={0} fg={healthStyle(last.health).fg}>
											{`${healthStyle(last.health).glyph} ${healthStyle(last.health).label}`}
										</text>
										<text flexShrink={0} fg={color.low}>
											{` · ${last.user?.displayName ?? "someone"}`}
										</text>
										<text flexShrink={0} fg={color.faint}>
											{` · ${relativeAge(last.createdAt)} ago`}
										</text>
									</box>
									{/* The full body lives on the Updates tab; this is the teaser. */}
									<text fg={color.dim} wrapMode="word">
										{clip(last.body.replace(/\s+/g, " ").trim(), 400)}
									</text>
								</box>
							) : (
								<text fg={color.faint}>Nobody has posted one. Press u.</text>
							)}
						</box>

						{body ? (
							<box flexDirection="column" marginTop={1} flexShrink={0}>
								<text fg={color.faint}>DESCRIPTION</text>
								<Markdown content={body} />
							</box>
						) : null}

						<CommentThread
							comments={project.comments?.nodes ?? []}
							selectedId={selectedCommentId}
							heading="PROJECT COMMENTS"
							onAdd={canComment ? onComment : null}
							onReply={onReply}
							onSelect={onSelectComment}
							onCopyLink={onCopyLink}
						/>
					</scrollbox>
				</>
			)}
		</box>
	)
}
