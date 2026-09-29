import { TextAttributes } from "@opentui/core"
import { gitLabel, gitLinks, gitSummary } from "../git.ts"
import type { IssueDetail as Detail } from "../linear/schema.ts"
import { color, COPY_ICON, formatDate, gitStatusStyle, priorityStyle, relativeAge, stateColor, stateGlyph } from "../theme.ts"
import { ActivityFeed } from "./ActivityFeed.tsx"
import { Button, buttonWidth } from "./Button.tsx"
import { CommentThread } from "./CommentThread.tsx"
import { Markdown } from "./Markdown.tsx"

/**
 * Linked PRs shown above the fold. These rows sit in the fixed header, so an
 * issue that links a dozen of them would push the description out of the pane.
 */
const GIT_ROWS = 5

type Props = {
	detail: Detail | null
	loading: boolean
	error: string | null
	/** Terminal width, so the action row can drop buttons that will not fit. */
	width: number
	/** Comment the reply keybinding will target; null means reply to the issue. */
	selectedCommentId: string | null
	/** Swaps the scrolling half of the pane for the activity feed. */
	showActivity: boolean
	onToggleActivity: () => void
	onAction: (action: "status" | "assignee" | "priority" | "cycle" | "comment") => void
	onReply: (commentId: string | null) => void
	onSelectComment: (commentId: string | null) => void
	onCopyBranch: () => void
	onOpenBrowser: () => void
	/** Opens the linked PR, or picks one when the issue has several. */
	onOpenPr: () => void
	/** Drills into the issue's project, the same as `enter` on a project row. */
	onOpenProject: () => void
	/** Opens one specific link -- a clicked PR row, which names its own URL. */
	onOpenLink: (url: string) => void
	/** Puts one URL on the clipboard: a PR row's or a comment's permalink. */
	onCopyLink: (url: string) => void
}

type Action = { label: string; hint: string; onPress: () => void }

/**
 * Drops trailing buttons that will not fit rather than letting the row overflow
 * -- a squeezed button paints its hint over the tail of its own label. Every
 * button has a keybinding, so a dropped one costs nothing but the click target.
 */
function fittingActions(available: number, actions: Action[]): Action[] {
	let used = 0
	return actions.filter((action) => {
		const next = used + buttonWidth(action.label, action.hint)
		if (next > available) return false
		used = next
		return true
	})
}

/**
 * `flexShrink={0}` is load-bearing: in a short pane yoga otherwise squeezes these
 * one-line rows to height 0 and they paint on top of each other.
 *
 * With `onPress` the whole row is a click target and the label is underlined, the
 * way a link reads. These rows carry no OSC 8 hyperlink; markdown bodies get
 * those from OpenTUI itself.
 */
function Field({ label, value, fg, onPress, onCopy }: { label: string; value: string; fg?: string; onPress?: () => void; onCopy?: () => void }) {
	return (
		<box flexDirection="row" flexShrink={0} height={1} {...(onPress ? { onMouseDown: onPress } : {})}>
			<text fg={onPress ? color.low : color.faint} attributes={onPress ? TextAttributes.UNDERLINE : 0} flexShrink={0}>
				{label.padEnd(10)}
			</text>
			{onCopy ? <Button label={COPY_ICON} compact onPress={onCopy} /> : null}
			<text fg={fg ?? color.fg} flexGrow={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{value}
			</text>
		</box>
	)
}

export function IssueDetail({
	detail,
	loading,
	error,
	width,
	selectedCommentId,
	showActivity,
	onToggleActivity,
	onAction,
	onReply,
	onSelectComment,
	onCopyBranch,
	onOpenBrowser,
	onOpenPr,
	onOpenProject,
	onOpenLink,
	onCopyLink,
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
	if (loading || !detail) {
		return (
			<box border borderColor={color.border} flexGrow={1} title="loading">
				<text fg={color.dim}>Loading…</text>
			</box>
		)
	}

	const prio = priorityStyle(detail.priority)
	const labels = detail.labels?.nodes ?? []
	const children = detail.children?.nodes ?? []
	const links = gitLinks(detail)
	const hiddenLinks = Math.max(0, links.length - GIT_ROWS)

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			overflow="hidden"
			border
			borderColor={color.borderFocus}
			title={detail.identifier}
			titleColor={color.accent}
			bottomTitle={showActivity ? " t back to the description · esc back " : " tab cycles comments · r reply · t activity · esc back "}
		>
			<text fg={color.fg} attributes={1} wrapMode="word" flexShrink={0}>
				{detail.title}
			</text>

			<box flexDirection="row" marginTop={1} flexShrink={0} height={1} overflow="hidden">
				{fittingActions(width - 2, [
					{ label: "Status", hint: "s", onPress: () => onAction("status") },
					{ label: "Assign", hint: "a", onPress: () => onAction("assignee") },
					{ label: "Priority", hint: "p", onPress: () => onAction("priority") },
					{ label: "Cycle", hint: "C", onPress: () => onAction("cycle") },
					{ label: "Comment", hint: "c", onPress: () => onAction("comment") },
					{
						label: showActivity ? "Details" : "Activity",
						hint: "t",
						onPress: onToggleActivity,
					},
					...(links.length ? [{ label: "PR", hint: "O", onPress: onOpenPr }] : []),
					...(detail.project ? [{ label: "Project", hint: "P", onPress: onOpenProject }] : []),
					{ label: "Branch", hint: "y", onPress: onCopyBranch },
					{ label: "Open", hint: "o", onPress: onOpenBrowser },
					// Same ⎘ as the PR and comment rows: it copies this thing's link.
					{ label: COPY_ICON, hint: "Y", onPress: () => onCopyLink(detail.url) },
				]).map((action) => (
					<Button key={action.label} label={action.label} hint={action.hint} onPress={action.onPress} />
				))}
			</box>

			<Field label="Status" value={`${stateGlyph(detail.state?.type)} ${detail.state?.name ?? "—"}`} fg={stateColor(detail.state?.type, detail.state?.color)} />
			<Field label="Priority" value={prio.label} fg={prio.fg} />
			<Field label="Assignee" value={detail.assignee?.displayName ?? "Unassigned"} />
			{detail.project ? <Field label="Project" value={detail.project.name} onPress={onOpenProject} /> : null}
			<Field label="Cycle" value={detail.cycle ? detail.cycle.name?.trim() || `Cycle ${detail.cycle.number}` : "No cycle"} onPress={() => onAction("cycle")} />
			{detail.estimate != null ? <Field label="Estimate" value={String(detail.estimate)} /> : null}
			{labels.length ? <Field label="Labels" value={labels.map((l) => l.name).join(", ")} /> : null}
			{detail.parent ? <Field label="Parent" value={`${detail.parent.identifier} ${detail.parent.title}`} /> : null}
			<Field label="Created" value={`${formatDate(detail.createdAt)} · updated ${relativeAge(detail.updatedAt)} ago`} fg={color.dim} />
			{detail.branchName ? <Field label="Branch" value={detail.branchName} fg={color.low} /> : null}
			{links.slice(0, GIT_ROWS).map((link) => (
				<Field
					key={link.id}
					label={gitLabel(link)}
					value={gitSummary(link, detail.branchName)}
					fg={gitStatusStyle(link.status).fg}
					onPress={() => onOpenLink(link.url)}
					onCopy={() => onCopyLink(link.url)}
				/>
			))}
			{hiddenLinks ? <Field label="" value={`+${hiddenLinks} more linked`} fg={color.faint} /> : null}

			<scrollbox focused flexGrow={1} flexShrink={1} minHeight={0} marginTop={1} scrollY contentOptions={{ flexDirection: "column" }}>
				{showActivity ? (
					<ActivityFeed detail={detail} />
				) : (
					<box flexDirection="column">
						{detail.description ? <Markdown content={detail.description} /> : <text fg={color.faint}>No description.</text>}

						{children.length ? (
							<box flexDirection="column" marginTop={1}>
								<text fg={color.faint}>{`SUB-ISSUES (${children.length})`}</text>
								{children.map((c) => (
									<text key={c.identifier} fg={color.dim} wrapMode="none" truncate>
										{`  ${stateGlyph(c.state?.type)} ${c.identifier}  ${c.title}`}
									</text>
								))}
							</box>
						) : null}

						<CommentThread
							comments={detail.comments?.nodes ?? []}
							selectedId={selectedCommentId}
							heading="COMMENTS"
							onAdd={() => onAction("comment")}
							onReply={onReply}
							onSelect={onSelectComment}
							onCopyLink={onCopyLink}
						/>
					</box>
				)}
			</scrollbox>
		</box>
	)
}
