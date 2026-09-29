import type { MouseEvent } from "@opentui/core"
import { useState } from "react"
import { color } from "../theme.ts"

type Props = {
	label: string
	hint?: string
	onPress: () => void
	tone?: string
	/** Drops the side padding, for a one-glyph icon that should not read as a slab. */
	compact?: boolean
}

/**
 * One row tall on purpose: a bordered button costs three rows, and the detail
 * pane needs its vertical space for the description. Hover comes from
 * onMouseOver/onMouseOut so the target is obvious before you commit to a click.
 *
 * The click stops here. Mouse events bubble, and these buttons sit inside rows
 * that have their own handler -- a PR row opens the PR, a comment block selects
 * the comment -- so without this, clicking Link both copied the URL *and* opened
 * the browser.
 */
export function Button({ label, hint, onPress, tone, compact }: Props) {
	const [hover, setHover] = useState(false)
	const accent = tone ?? color.accent
	const pad = compact ? 0 : 1

	return (
		<box
			flexDirection="row"
			flexShrink={0}
			height={1}
			marginRight={1}
			paddingLeft={pad}
			paddingRight={pad}
			backgroundColor={hover ? accent : color.selectedBg}
			onMouseDown={(event: MouseEvent) => {
				event.stopPropagation()
				onPress()
			}}
			onMouseOver={() => setHover(true)}
			onMouseOut={() => setHover(false)}
		>
			<text flexShrink={0} fg={hover ? "#11151c" : color.fg}>
				{label}
			</text>
			{hint ? <text flexShrink={0} fg={hover ? "#11151c" : color.faint}>{` ${hint}`}</text> : null}
		</box>
	)
}

/** Cells a `Button` occupies: both paddings, the gap before the hint, the margin. */
export function buttonWidth(label: string, hint?: string, compact = false): number {
	return label.length + (hint ? hint.length + 1 : 0) + (compact ? 1 : 3)
}
