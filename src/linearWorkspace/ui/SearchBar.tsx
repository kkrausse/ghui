import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { color } from "../theme.ts"

type Props = {
	/** The query the rows below came from. Empty before the first search runs. */
	term: string
	/** True while the input owns the keyboard, false while the results do. */
	editing: boolean
	/** Rows loaded, and whether Linear has more past them. */
	count: number
	hasMore: boolean
	loading: boolean
	onSubmit: (term: string) => void
	/** Click the query to retype it -- the same thing `/` does. */
	onEdit: () => void
}

/**
 * Search's header, and the reason search hides the sidebar: results are a scope
 * of their own, not a filter applied to whichever view the sidebar had selected.
 * With the sidebar up, a highlighted "Sprint 42" beside search results reads as
 * "these are the sprint's matches", which they never were.
 *
 * One row on purpose: the list underneath needs the height, and its own title
 * already names the scope. Search-only controls belong here -- an assignee
 * toggle, a team filter -- where they cost the rest of the app no keybindings
 * and no screen space.
 */
export function SearchBar({ term, editing, count, hasMore, loading, onSubmit, onEdit }: Props) {
	const input = useRef<InputRenderable | null>(null)

	// The input mounts holding the previous query with its caret at column 0, so
	// typing would prepend and backspace would do nothing at all. Put the caret
	// after the text, which is what re-opening `/` is for.
	useEffect(() => {
		if (editing) input.current?.setCursor(0, term.length)
	}, [editing, term])

	return (
		<box flexDirection="row" height={1} flexShrink={0} paddingLeft={1} paddingRight={1}>
			<text fg={color.accent} flexShrink={0}>
				{"/ "}
			</text>
			{editing ? (
				<input
					ref={input}
					focused
					value={term}
					flexGrow={1}
					placeholder="text to search across every issue"
					// OpenTUI's JSX namespace extends React's, so DOM `input` props merge
					// in and onSubmit types as an intersection. OpenTUI passes the string.
					onSubmit={(value: string | object) => onSubmit(typeof value === "string" ? value : "")}
				/>
			) : (
				<box flexDirection="row" flexGrow={1} minWidth={0} onMouseDown={onEdit}>
					<text fg={color.fg} flexGrow={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
						{term}
					</text>
					<text fg={color.faint} flexShrink={0}>
						{loading ? " searching…" : ` ${count}${hasMore ? "+" : ""} found · / edit · esc exit`}
					</text>
				</box>
			)}
		</box>
	)
}
