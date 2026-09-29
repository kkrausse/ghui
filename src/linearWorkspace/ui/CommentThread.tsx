import { COPY_ICON } from "../theme.ts"
import type { Comment } from "../linear/schema.ts"
import { color, relativeAge } from "../theme.ts"
import { threadComments } from "../views.ts"
import { Button } from "./Button.tsx"
import { Markdown } from "./Markdown.tsx"

type Props = {
	comments: Comment[]
	/** The comment `r` will reply to. Null means reply at the top level. */
	selectedId: string | null
	/** Heading above the thread, e.g. "COMMENTS". Its count is appended. */
	heading: string
	/** Null hides the add button -- a surface that cannot be commented on. */
	onAdd: (() => void) | null
	onReply: (commentId: string) => void
	onSelect: (commentId: string) => void
	/** Puts the comment's permalink on the clipboard. */
	onCopyLink: (url: string) => void
}

/**
 * Shared by the issue detail, the project overview, and a project update. All
 * three get flat comment lists with a `parent { id }` back-reference and are
 * rebuilt into one-deep threads the same way.
 */
export function CommentThread({ comments, selectedId, heading, onAdd, onReply, onSelect, onCopyLink }: Props) {
	const threads = threadComments(comments)

	return (
		<box flexDirection="column" marginTop={1}>
			<box flexDirection="row">
				<text fg={color.faint}>{`${heading} (${comments.length}) `}</text>
				{onAdd ? <Button label="Add" hint="c" onPress={onAdd} /> : null}
			</box>

			{threads.length === 0 ? (
				<text fg={color.faint}>No comments yet.</text>
			) : (
				threads.map(({ comment, replies }) => (
					<box key={comment.id} flexDirection="column" marginTop={1}>
						<CommentBlock
							comment={comment}
							selected={comment.id === selectedId}
							indent={0}
							onReply={() => onReply(comment.id)}
							onSelect={() => onSelect(comment.id)}
							onCopyLink={onCopyLink}
						/>
						{replies.map((reply) => (
							<CommentBlock
								key={reply.id}
								comment={reply}
								selected={reply.id === selectedId}
								indent={3}
								// Linear threads one level deep, so a reply-to-a-reply still
								// attaches to the thread root.
								onReply={() => onReply(comment.id)}
								onSelect={() => onSelect(reply.id)}
								onCopyLink={onCopyLink}
							/>
						))}
					</box>
				))
			)}
		</box>
	)
}

function CommentBlock({
	comment,
	selected,
	indent,
	onReply,
	onSelect,
	onCopyLink,
}: {
	comment: Comment
	selected: boolean
	indent: number
	onReply: () => void
	onSelect: () => void
	onCopyLink: (url: string) => void
}) {
	return (
		<box flexDirection="column" marginLeft={indent} marginTop={indent ? 1 : 0} {...(selected ? { backgroundColor: color.selectedBg } : {})} onMouseDown={onSelect}>
			<box flexDirection="row">
				<text fg={selected ? color.accent : color.low}>{`${indent ? "↳ " : ""}${comment.user?.displayName ?? "someone"}`}</text>
				<text fg={color.faint}>{` · ${relativeAge(comment.createdAt)} ago `}</text>
				{comment.resolvedAt ? <text fg={color.ok}>{"✓ resolved "}</text> : null}
				<Button label="Reply" hint="r" onPress={onReply} />
				{/* Linear gives each comment a permalink; without one there is nothing to copy. */}
				{comment.url ? <Button label={COPY_ICON} compact onPress={() => onCopyLink(comment.url!)} /> : null}
			</box>
			<Markdown content={comment.body} />
		</box>
	)
}
