import { useRef } from "react"
import type { ProjectUpdate } from "../linear/schema.ts"
import { color, healthStyle, relativeAge } from "../theme.ts"
import type { ProjectTab } from "../views.ts"
import { clip, fit, windowFor } from "./layout.ts"
import { ProjectTabs } from "./ProjectTabs.tsx"
import { wheel } from "./wheel.ts"

type Props = {
	title: string
	updates: ProjectUpdate[]
	selected: number
	focused: boolean
	loading: boolean
	loadingMore?: boolean
	hasMore?: boolean
	error: string | null
	height: number
	activeTab: ProjectTab
	onTab: (tab: ProjectTab) => void
	/** First click selects, a click on the already-selected update opens it. */
	onPick: (index: number) => void
	/** The wheel moves this pane's cursor, a row per event. */
	onScroll?: (delta: number) => void
}

/** Newlines and markdown make a one-line preview useless without this. */
function preview(body: string): string {
	return body
		.replace(/[#*_`>]/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

/**
 * The project workspace's Updates tab. One row per posted update; `enter` opens
 * it with its comment thread, which came down with the list.
 */
export function UpdateList({ title, updates, selected, focused, loading, loadingMore, hasMore, error, height, activeTab, onTab, onPick, onScroll }: Props) {
	const offsetRef = useRef(0)
	// 2 border rows, plus the tab strip and its margin.
	const viewport = Math.max(1, height - 4)
	offsetRef.current = windowFor(updates.length, selected, viewport, offsetRef.current)
	const visible = updates.slice(offsetRef.current, offsetRef.current + viewport)

	const total = `${updates.length}${hasMore ? "+" : ""}`
	const counter = updates.length ? ` ${selected + 1}/${total}${loadingMore ? " · loading…" : ""}` : ""

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
			<ProjectTabs active={activeTab} focused={focused} onPick={onTab} />

			{error ? (
				<text fg={color.urgent}>{error}</text>
			) : loading ? (
				<text fg={color.dim}>Loading…</text>
			) : updates.length === 0 ? (
				<text fg={color.dim}>No updates yet. Press u to post one.</text>
			) : (
				visible.map((u, i) => {
					const active = offsetRef.current + i === selected
					const health = healthStyle(u.health)
					const comments = u.comments?.nodes.length ?? 0
					return (
						<box
							key={u.id}
							flexDirection="row"
							height={1}
							flexShrink={0}
							{...(active ? { backgroundColor: color.selectedBg } : {})}
							onMouseDown={() => onPick(offsetRef.current + i)}
						>
							<text flexShrink={0} fg={health.fg}>{`${health.glyph} `}</text>
							<text flexShrink={0} fg={active && focused ? color.accent : color.faint}>
								{fit(clip(u.user?.displayName ?? "someone", 13), 14)}
							</text>
							<text fg={active ? color.fg : color.dim} flexGrow={1} flexShrink={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
								{preview(u.body)}
							</text>
							{/* `↳` is the reply glyph the comment thread already uses.
                  No emoji: the column math here counts code units, not cells. */}
							<text flexShrink={0} fg={color.faint}>
								{comments ? `${String(comments).padStart(4)} ↳` : "      "}
							</text>
							<text flexShrink={0} fg={color.faint}>
								{relativeAge(u.createdAt).padStart(5)}
							</text>
						</box>
					)
				})
			)}
		</box>
	)
}
