import { memo, useMemo, useRef } from "react"
import { TextAttributes, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
import type { PullRequestComment } from "../domain.js"
import { colors } from "./colors.js"
import { commentCountText, commentMetaSegments, CommentSegmentsLine, QUOTE_HEADER_RE, stripQuoteHeader, type CommentDisplayLine, type CommentSegment } from "./comments.js"
import { truncateConversationPath } from "./DetailsPane.js"
import { MarkdownBody } from "./MarkdownBody.js"
import { centerCell, Divider, Filler, PaddedRow, PlainLine, TextLine } from "./primitives.js"
import { shortRepoName } from "./pullRequests.js"
import { commentsHeaderStatus, commentsPaneMode, type CommentLoadState } from "./comments/loadState.js"

const META_PREFIX_WIDTH = 2 // "• "
const PLACEHOLDER_KEY = "__placeholder_new_comment"

// Comments view always exposes one virtual "+ Add new comment" row at the
// bottom, so the selectable row count is comments.length + this.
const PLACEHOLDER_ROWS = 1
export const commentsViewRowCount = (count: number) => count + PLACEHOLDER_ROWS

// Cap nesting depth — deep chains otherwise eat the pane width.
const MAX_INDENT_LEVELS = 3
const REPLY_INDENT_COLS = 4

interface CommentBlock {
	readonly key: string
	readonly comment: PullRequestComment | null
	readonly meta: CommentDisplayLine
	readonly body: string
	readonly indent: number
	readonly isPlaceholder: boolean
}

const reviewContextGroups = (comment: PullRequestComment, width: number): readonly (readonly { readonly text: string; readonly fg: string }[])[] => {
	if (comment._tag !== "review-comment") return []
	const pathLabel = `${comment.path}:${comment.line}`
	const room = Math.max(8, width - META_PREFIX_WIDTH - comment.author.length - 16)
	return [[{ text: truncateConversationPath(pathLabel, room), fg: colors.inlineCode }]]
}

// GitHub doesn't thread issue comments, so `issueQuoteParent` reverse-engineers
// the parent from the `> @author wrote:` header that `quotedReplyBody` writes.
// `collapseWhitespace` makes the body comparison tolerant of the blank line
// the parent inserts between its own quote header and reply text.
const collapseWhitespace = (text: string): string =>
	text
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.join("\n")
		.trim()

const issueQuoteParent = (
	comment: PullRequestComment & { readonly _tag: "comment" },
	candidates: readonly PullRequestComment[],
	collapsedById: Map<string, string>,
): string | null => {
	const match = QUOTE_HEADER_RE.exec(comment.body)
	if (!match) return null
	const author = match[1] ?? ""
	const quoted = collapseWhitespace(
		(match[2] ?? "")
			.split("\n")
			.map((line) => line.replace(/^>\s?/, ""))
			.join("\n"),
	)
	if (quoted.length === 0) return null
	for (const candidate of candidates) {
		if (candidate.id === comment.id) continue
		if (candidate._tag !== "comment") continue
		if (candidate.author !== author) continue
		const body = collapsedById.get(candidate.id) ?? ""
		if (body.length === 0) continue
		if (body === quoted || body.startsWith(quoted) || quoted.startsWith(body)) return candidate.id
	}
	return null
}

export interface OrderedComment {
	readonly comment: PullRequestComment
	readonly indent: number
}

// Order comments so replies sit right after their parent: review threads via
// `inReplyTo`, issue-comment quote replies via the heuristic above. Roots
// preserve overall createdAt order; replies render at the parent's depth + 1
// (capped at MAX_INDENT_LEVELS so deep chains don't run off the pane).
export const orderCommentsForDisplay = (comments: readonly PullRequestComment[]): readonly OrderedComment[] => {
	const byId = new Map<string, PullRequestComment>()
	const collapsedIssueBodies = new Map<string, string>()
	for (const comment of comments) {
		byId.set(comment.id, comment)
		if (comment._tag === "comment") collapsedIssueBodies.set(comment.id, collapseWhitespace(comment.body))
	}

	const parentIdFor = (comment: PullRequestComment): string | null => {
		if (comment._tag === "review-comment") return comment.inReplyTo
		return issueQuoteParent(comment, comments, collapsedIssueBodies)
	}

	const childrenByParent = new Map<string, PullRequestComment[]>()
	const roots: PullRequestComment[] = []
	for (const comment of comments) {
		const parentId = parentIdFor(comment)
		if (parentId && byId.has(parentId)) {
			const list = childrenByParent.get(parentId) ?? []
			list.push(comment)
			childrenByParent.set(parentId, list)
		} else {
			roots.push(comment)
		}
	}

	const byTime = (left: PullRequestComment, right: PullRequestComment) => (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0)
	const ordered: { readonly comment: PullRequestComment; readonly indent: number }[] = []
	const visited = new Set<string>()
	const visit = (comment: PullRequestComment, indent: number): void => {
		if (visited.has(comment.id)) return
		visited.add(comment.id)
		ordered.push({ comment, indent: Math.min(indent, MAX_INDENT_LEVELS) })
		const children = (childrenByParent.get(comment.id) ?? []).slice().sort(byTime)
		for (const child of children) visit(child, indent + 1)
	}
	for (const root of roots) visit(root, 0)
	return ordered
}

const buildBlocks = (ordered: readonly OrderedComment[], width: number): readonly CommentBlock[] =>
	ordered.map(({ comment, indent }) => {
		const usableWidth = Math.max(8, width - indent * REPLY_INDENT_COLS)
		// Don't repeat the file path for replies — the thread root carries it.
		const groups = indent > 0 ? [] : reviewContextGroups(comment, usableWidth)
		const marker = indent > 0 ? { text: "↳", fg: colors.muted } : undefined
		const meta: CommentDisplayLine = { key: `${comment.id}:meta`, segments: commentMetaSegments({ item: comment, groups, marker }) }
		// When nested, the parent is right above — the quote header becomes noise.
		const renderedBody = indent > 0 && comment._tag === "comment" ? stripQuoteHeader(comment.body) : comment.body
		return { key: comment.id, comment, meta, body: renderedBody, indent, isPlaceholder: false }
	})

const placeholderBlock: CommentBlock = {
	key: PLACEHOLDER_KEY,
	comment: null,
	meta: { key: `${PLACEHOLDER_KEY}:meta`, segments: [] },
	body: "",
	indent: 0,
	isPlaceholder: true,
}

const withReplyIndent = (segments: readonly CommentSegment[], indent: number): readonly CommentSegment[] =>
	indent === 0 ? segments : [{ text: " ".repeat(indent * REPLY_INDENT_COLS), fg: colors.muted }, ...segments]

interface ConversationContentProps {
	readonly orderedComments: readonly OrderedComment[]
	readonly contentWidth: number
	readonly repository: string
	readonly themeKey: string
	readonly onLinkOpen?: ((url: string) => void) | undefined
	readonly selection?:
		| {
				readonly selectedId: string
				readonly select: (id: string, reveal?: boolean) => void
				readonly copyLink: () => void
				readonly registerBlock: (id: string, node: BoxRenderable | null) => void
		  }
		| undefined
}

// Keep Markdown subtrees stable during loading-spinner ticks and parent updates.
// Scrolling remains imperative on the description's existing scrollbox.
const ConversationContent = memo(({ orderedComments, contentWidth, repository, onLinkOpen, selection }: ConversationContentProps) => (
	<box flexDirection="column" flexShrink={0}>
		{buildBlocks(orderedComments, contentWidth).map((block) => (
			<box
				key={block.key}
				flexDirection="column"
				flexShrink={0}
				marginBottom={1}
				border={["left"]}
				borderStyle="heavy"
				borderColor={selection?.selectedId === block.key ? colors.accent : colors.background}
				paddingLeft={1}
				ref={(node: BoxRenderable | null) => selection?.registerBlock(block.key, node)}
			>
				<box height={1} flexDirection="row" onMouseDown={() => selection?.select(block.key, false)}>
					<box width={2} />
					<box flexShrink={1} minWidth={0}>
						<CommentSegmentsLine segments={withReplyIndent(block.meta.segments, block.indent)} selected={false} />
					</box>
					<box
						width={13}
						flexShrink={0}
						marginLeft={1}
						onMouseDown={(event) => {
							event.stopPropagation()
							selection?.select(block.key, false)
							selection?.copyLink()
						}}
					>
						<PlainLine text="[y Copy link]" fg={colors.accent} />
					</box>
				</box>
				<box marginLeft={block.indent * REPLY_INDENT_COLS + 2} flexShrink={0}>
					<MarkdownBody
						body={block.body.trim() || "(empty comment)"}
						width={Math.max(1, contentWidth - block.indent * REPLY_INDENT_COLS - 4)}
						repository={repository}
						onLinkOpen={onLinkOpen}
					/>
				</box>
			</box>
		))}
	</box>
))

/** Reading and selection view; replies reuse the existing comment editor. */
export const ConversationSection = ({
	loadState,
	loadingIndicator,
	...content
}: ConversationContentProps & {
	readonly loadState: CommentLoadState
	readonly loadingIndicator: string
}) => {
	const mode = commentsPaneMode(loadState)
	const statusText =
		loadState.status === "idle" || loadState.status === "loading"
			? `${loadingIndicator} Loading comments…`
			: loadState.status === "error"
				? `Could not load comments: ${loadState.error}. Press c, then r to retry.`
				: ""
	return (
		<box flexDirection="column" flexShrink={0} paddingLeft={1} paddingRight={1} marginTop={1}>
			<Divider width={content.contentWidth} />
			<PlainLine text={`Conversation · ${commentCountText(content.orderedComments.length)}`} fg={colors.count} />
			<PlainLine text="↑↓ select · y copy link · Enter reply · c all comments" fg={colors.muted} />
			{/* Reserve one status row so refresh/error transitions don't shift comments. */}
			<PlainLine text={statusText} fg={loadState.status === "error" ? colors.error : colors.muted} />
			{mode === "comments" ? (
				content.orderedComments.length > 0 ? (
					<ConversationContent {...content} />
				) : loadState.status === "ready" ? (
					<PlainLine text="No comments yet." fg={colors.muted} />
				) : null
			) : null}
		</box>
	)
}

export const CommentsPane = ({
	item,
	comments,
	orderedComments,
	loadState,
	selectedIndex,
	contentWidth,
	paneWidth,
	height,
	loadingIndicator,
	themeGeneration,
	showScrollbar,
	onLinkOpen,
}: {
	item: { readonly repository: string; readonly number: number }
	comments: readonly PullRequestComment[]
	orderedComments: readonly OrderedComment[]
	loadState: CommentLoadState
	selectedIndex: number
	contentWidth: number
	paneWidth: number
	height: number
	loadingIndicator: string
	themeGeneration: number
	showScrollbar: boolean
	onLinkOpen?: ((url: string) => void) | undefined
}) => {
	const realBlocks = useMemo(() => buildBlocks(orderedComments, contentWidth), [orderedComments, contentWidth, themeGeneration])
	const blocks = useMemo<readonly CommentBlock[]>(() => [...realBlocks, placeholderBlock], [realBlocks])
	const scrollboxRef = useRef<ScrollBoxRenderable | null>(null)
	const blockRefs = useRef(new Map<string, BoxRenderable>())
	const lastReveal = useRef("")
	const safeIndex = Math.max(0, Math.min(selectedIndex, blocks.length - 1))

	const headerLine = (() => {
		const repo = shortRepoName(item.repository)
		const count = commentsHeaderStatus(loadState, commentCountText(comments.length), loadingIndicator)
		const left = `Comments #${item.number}  ${repo}`
		const gap = Math.max(2, contentWidth - left.length - count.length)
		return { left, gap, count }
	})()

	// height = header (1) + body divider (1) + body (variable). The bottom
	// divider + footer live in the App-level chrome (FooterHints) so the
	// CommentsPane stays consistent with DiffPane / DetailsPane.
	const bodyHeight = Math.max(1, height - 2)

	const paneMode = commentsPaneMode(loadState)
	const error = loadState.status === "error" ? loadState.error : null
	const revealSelected = () => {
		const scrollbox = scrollboxRef.current
		if (scrollbox) scrollbox.verticalScrollBar.visible = showScrollbar && scrollbox.scrollHeight > scrollbox.viewport.height
		const key = blocks[safeIndex]?.key ?? ""
		const block = blockRefs.current.get(key)
		if (!scrollbox || !block) return
		const blockTop = block.y - scrollbox.content.y
		const blockBottom = blockTop + block.height
		const signature = `${key}:${blockTop}:${block.height}:${bodyHeight}`
		if (lastReveal.current === signature) return
		lastReveal.current = signature
		const viewportTop = scrollbox.scrollTop
		const viewportBottom = viewportTop + bodyHeight
		if (blockTop < viewportTop || block.height > bodyHeight) scrollbox.scrollTo({ x: 0, y: blockTop })
		else if (blockBottom > viewportBottom) scrollbox.scrollTo({ x: 0, y: Math.max(0, blockBottom - bodyHeight) })
	}

	const renderedBlocks = blocks.map((block, index) => {
		const isSelected = index === safeIndex
		if (block.isPlaceholder) {
			return (
				<box
					key={block.key}
					height={1}
					flexShrink={0}
					ref={(node: BoxRenderable | null) => {
						if (node) blockRefs.current.set(block.key, node)
						else blockRefs.current.delete(block.key)
					}}
				>
					<TextLine>
						<span fg={isSelected ? colors.accent : colors.muted} attributes={isSelected ? TextAttributes.BOLD : 0}>
							+ Add new comment
						</span>
					</TextLine>
				</box>
			)
		}
		return (
			<box
				key={block.key}
				flexDirection="column"
				flexShrink={0}
				marginBottom={1}
				border={["left"]}
				borderStyle="heavy"
				borderColor={isSelected ? colors.accent : colors.background}
				paddingLeft={1}
				ref={(node: BoxRenderable | null) => {
					if (node) blockRefs.current.set(block.key, node)
					else blockRefs.current.delete(block.key)
				}}
			>
				<box height={1}>
					<CommentSegmentsLine segments={withReplyIndent(block.meta.segments, block.indent)} selected={false} />
				</box>
				<box marginLeft={block.indent * REPLY_INDENT_COLS + 2} flexShrink={0}>
					<MarkdownBody
						body={block.body.trim() || "(empty comment)"}
						width={Math.max(1, contentWidth - block.indent * REPLY_INDENT_COLS - 4)}
						repository={item.repository}
						onLinkOpen={onLinkOpen}
					/>
				</box>
			</box>
		)
	})
	const errorBanner =
		error === null ? null : (
			<>
				<PlainLine text={`! Could not load comments: ${error}`} fg={colors.error} />
				<PlainLine text="  Run Refresh comments to retry." fg={colors.muted} />
			</>
		)

	return (
		<box flexDirection="column" height={height} backgroundColor={colors.background}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.accent} attributes={1}>
						{headerLine.left}
					</span>
					<span fg={colors.muted}>{" ".repeat(headerLine.gap)}</span>
					<span fg={colors.muted}>{headerLine.count}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={paneWidth} />
			<box height={bodyHeight} flexDirection="column">
				{paneMode === "loading" ? (
					<>
						<Filler rows={Math.max(0, Math.floor((bodyHeight - 1) / 2))} prefix="loading-top" />
						<PlainLine text={centerCell(`${loadingIndicator} Loading comments`, contentWidth)} fg={colors.muted} />
						<Filler rows={Math.max(0, Math.ceil((bodyHeight - 1) / 2))} prefix="loading-bottom" />
					</>
				) : paneMode === "error" ? (
					<>
						<Filler rows={Math.max(0, Math.floor((bodyHeight - 2) / 2))} prefix="error-top" />
						<PlainLine text={centerCell(`Could not load comments: ${error ?? "Unknown error"}`, contentWidth)} fg={colors.error} />
						<PlainLine text={centerCell("Run Refresh comments to retry.", contentWidth)} fg={colors.muted} />
						<Filler rows={Math.max(0, Math.ceil((bodyHeight - 2) / 2))} prefix="error-bottom" />
					</>
				) : (
					<scrollbox ref={scrollboxRef} focusable={false} flexGrow={1} minHeight={0} renderAfter={revealSelected} verticalScrollbarOptions={{ visible: showScrollbar }}>
						{errorBanner}
						{renderedBlocks}
					</scrollbox>
				)}
			</box>
		</box>
	)
}
