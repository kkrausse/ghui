/** Column helpers. Terminal cells are the unit, so plain code-unit length is fine here. */

export function fit(s: string, width: number): string {
	if (width <= 0) return ""
	if (s.length <= width) return s.padEnd(width)
	return width <= 1 ? s.slice(0, width) : `${s.slice(0, width - 1)}…`
}

export function clip(s: string, width: number): string {
	if (width <= 0) return ""
	return s.length <= width ? s : width <= 1 ? s.slice(0, width) : `${s.slice(0, width - 1)}…`
}

/**
 * Keeps `selected` inside a `height`-tall window without re-centering on every
 * move -- the viewport only shifts when the cursor would leave it.
 */
export function windowFor(total: number, selected: number, height: number, prevOffset: number): number {
	if (total <= height) return 0
	const max = total - height
	let offset = Math.min(prevOffset, max)
	if (selected < offset) offset = selected
	else if (selected >= offset + height) offset = selected - height + 1
	return Math.max(0, Math.min(offset, max))
}

/** Single-line progress meter for cycles and projects. */
export function meter(fraction: number, width: number): string {
	const pct = Math.max(0, Math.min(1, fraction))
	const filled = Math.round(pct * width)
	return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`
}
