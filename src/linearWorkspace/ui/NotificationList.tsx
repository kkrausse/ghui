import { useRef } from "react"
import type { Notification } from "../linear/schema.ts"
import { color, relativeAge, stateColor, stateGlyph } from "../theme.ts"
import { clip, fit, windowFor } from "./layout.ts"
import { wheel } from "./wheel.ts"

type Props = {
	title: string
	notifications: Notification[]
	selected: number
	focused: boolean
	loading: boolean
	loadingMore?: boolean
	hasMore?: boolean
	error: string | null
	height: number
	/** First click selects the row, a click on the already-selected row opens it. */
	onPick: (index: number) => void
	/** The wheel moves this pane's cursor, a row per event. */
	onScroll?: (delta: number) => void
}

/**
 * Linear's notification `type` is a lowerCamelCase verb like `issueCommentMention`
 * or `issueAssignedToYou`. The prefix is almost always the entity, which the row
 * already shows, so strip it and space out the rest.
 */
export function notificationKind(type: string): string {
	const trimmed = type.replace(/^(issue|project|document|comment|initiative|post|customerNeed)/, "")
	const words = (trimmed || type)
		.replace(/([A-Z])/g, " $1")
		.trim()
		.toLowerCase()
	return words || type
}

export function NotificationList({ title, notifications, selected, focused, loading, loadingMore, hasMore, error, height, onPick, onScroll }: Props) {
	const offsetRef = useRef(0)

	const viewport = Math.max(1, height - 2)
	offsetRef.current = windowFor(notifications.length, selected, viewport, offsetRef.current)
	const visible = notifications.slice(offsetRef.current, offsetRef.current + viewport)

	const unread = notifications.filter((n) => !n.readAt).length
	const total = `${notifications.length}${hasMore ? "+" : ""}`
	const counter = notifications.length ? ` ${selected + 1}/${total} · ${unread} unread${loadingMore ? " · loading…" : ""}` : ""

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
			{error ? (
				<text fg={color.urgent} wrapMode="word">
					{error}
				</text>
			) : loading ? (
				<text fg={color.dim}>Loading…</text>
			) : notifications.length === 0 ? (
				<text fg={color.dim}>Inbox zero.</text>
			) : (
				visible.map((n, i) => (
					<NotificationRow key={n.id} notification={n} active={offsetRef.current + i === selected} focused={focused} onPick={() => onPick(offsetRef.current + i)} />
				))
			)}
		</box>
	)
}

function NotificationRow({ notification, active, focused, onPick }: { notification: Notification; active: boolean; focused: boolean; onPick: () => void }) {
	const unread = !notification.readAt
	const issue = notification.issue
	// Unread is the only thing worth a column of its own -- everything else is text.
	const dot = unread ? "●" : " "
	const who = notification.actor?.displayName ?? ""
	/**
	 * `title` is the subject (usually the issue title) and `subtitle` is what
	 * happened -- a comment preview, a status change. One truncating cell rather
	 * than two flexible ones, so the tail is cut cleanly instead of both halves
	 * being squeezed.
	 */
	const subtitle = notification.subtitle?.trim()
	const body = subtitle ? `${notification.title} · ${subtitle}` : notification.title

	return (
		<box flexDirection="row" height={1} {...(active ? { backgroundColor: color.selectedBg } : {})} onMouseDown={onPick}>
			<text flexShrink={0} fg={unread ? color.accent : color.faint}>{`${dot} `}</text>
			{issue ? (
				<>
					<text flexShrink={0} fg={stateColor(issue.state?.type, issue.state?.color)}>
						{`${stateGlyph(issue.state?.type)} `}
					</text>
					<text flexShrink={0} fg={active && focused ? color.accent : color.faint}>
						{fit(issue.identifier, 13)}
					</text>
				</>
			) : (
				<text flexShrink={0} fg={color.faint}>
					{fit(notificationKind(notification.type), 15)}
				</text>
			)}
			<text fg={active || unread ? color.fg : color.dim} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
				{body}
			</text>
			<text flexShrink={0} fg={color.faint}>{` ${fit(clip(who, 12), 12)}`}</text>
			<text flexShrink={0} fg={color.faint}>
				{relativeAge(notification.createdAt).padStart(4)}
			</text>
		</box>
	)
}
