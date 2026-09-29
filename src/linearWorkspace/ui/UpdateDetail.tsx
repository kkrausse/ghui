import type { ProjectUpdate } from "../linear/schema.ts"
import { color, formatDate, healthStyle, relativeAge } from "../theme.ts"
import { Button, buttonWidth } from "./Button.tsx"
import { CommentThread } from "./CommentThread.tsx"
import { Markdown } from "./Markdown.tsx"

type Props = {
	/** Project name, for the pane title -- an update has no identifier of its own. */
	projectName: string
	update: ProjectUpdate | null
	/** True while the updates payload is still in flight -- opening from the inbox. */
	loading?: boolean
	/** Terminal width, so the action row can drop buttons that will not fit. */
	width: number
	selectedCommentId: string | null
	onComment: () => void
	onReply: (commentId: string) => void
	onSelectComment: (commentId: string) => void
	/** Puts a comment's permalink on the clipboard. */
	onCopyLink: (url: string) => void
	onOpenBrowser: () => void
}

/**
 * One posted project update, with its comment thread.
 *
 * Rendered straight from the list payload -- `PROJECT_UPDATES` brings the
 * comments down with each update, so opening one costs no request and a posted
 * comment appears as soon as the list refetches.
 */
export function UpdateDetail({ projectName, update, loading, width, selectedCommentId, onComment, onReply, onSelectComment, onCopyLink, onOpenBrowser }: Props) {
	if (!update) {
		return (
			<box border borderColor={color.border} flexGrow={1} title="update">
				<text fg={color.dim}>{loading ? "Loading…" : "That update is no longer in the list."}</text>
			</box>
		)
	}

	const health = healthStyle(update.health)
	const actions = [
		{ label: "Comment", hint: "c", onPress: onComment },
		{ label: "Open", hint: "o", onPress: onOpenBrowser },
	]
	let used = 0
	const fitting = actions.filter((a) => {
		const next = used + buttonWidth(a.label, a.hint)
		if (next > width - 2) return false
		used = next
		return true
	})

	return (
		<box
			flexDirection="column"
			flexGrow={1}
			overflow="hidden"
			border
			borderColor={color.borderFocus}
			title={`${projectName} · update`}
			titleColor={color.accent}
			bottomTitle=" tab cycles comments · r reply · esc back "
		>
			<box flexDirection="row" flexShrink={0} height={1}>
				<text flexShrink={0} fg={health.fg}>{`${health.glyph} ${health.label}`}</text>
				<text flexShrink={0} fg={color.low}>{` · ${update.user?.displayName ?? "someone"}`}</text>
				<text flexShrink={0} fg={color.faint}>
					{` · ${formatDate(update.createdAt)} (${relativeAge(update.createdAt)} ago)`}
				</text>
				{update.editedAt ? <text fg={color.faint}>{" · edited"}</text> : null}
				{update.isStale ? <text fg={color.medium}>{" · stale"}</text> : null}
			</box>

			<box flexDirection="row" marginTop={1} marginBottom={1} flexShrink={0} height={1} overflow="hidden">
				{fitting.map((a) => (
					<Button key={a.label} label={a.label} hint={a.hint} onPress={a.onPress} />
				))}
			</box>

			<scrollbox focused flexGrow={1} flexShrink={1} minHeight={0} scrollY contentOptions={{ flexDirection: "column" }}>
				<Markdown content={update.body} />

				<CommentThread
					comments={update.comments?.nodes ?? []}
					selectedId={selectedCommentId}
					heading="COMMENTS"
					onAdd={onComment}
					onReply={onReply}
					onSelect={onSelectComment}
					onCopyLink={onCopyLink}
				/>
			</scrollbox>
		</box>
	)
}
