import { useRef } from "react"
import { color } from "../theme.ts"
import { navLabel, type Nav } from "../views.ts"
import { fit, meter, windowFor } from "./layout.ts"
import { wheel } from "./wheel.ts"

type Props = {
	items: Nav[]
	selected: number
	focused: boolean
	width: number
	height: number
	/** Unread inbox count. Null when Linear declined to report it -- no badge then. */
	unread?: number | null
	onPick: (index: number) => void
	/**
	 * The wheel moves the sidebar's cursor, which loads that view -- the same
	 * thing j/k do here, cache and all.
	 */
	onScroll?: (delta: number) => void
}

/**
 * One rendered line per entry, including the blank separators.
 *
 * Spacing used to come from `marginTop` on headers, which made the rendered
 * height larger than the item count and overflowed the box on small terminals.
 * Blank rows are explicit here so the windowing math matches what is drawn.
 */
type Row = { kind: "blank" } | { kind: "header"; label: string } | { kind: "item"; index: number }

function buildRows(items: Nav[]): Row[] {
	const rows: Row[] = []
	items.forEach((item, index) => {
		if (item.kind === "header") {
			if (rows.length) rows.push({ kind: "blank" })
			rows.push({ kind: "header", label: item.label })
		} else {
			rows.push({ kind: "item", index })
		}
	})
	return rows
}

export function Sidebar({ items, selected, focused, width, height, unread, onPick, onScroll }: Props) {
	const offsetRef = useRef(0)
	const inner = width - 2

	const rows = buildRows(items)
	const viewport = Math.max(1, height - 2) // minus the border
	const cursor = rows.findIndex((r) => r.kind === "item" && r.index === selected)
	offsetRef.current = windowFor(rows.length, Math.max(cursor, 0), viewport, offsetRef.current)
	const visible = rows.slice(offsetRef.current, offsetRef.current + viewport)

	const more = rows.length > viewport
	const atTop = offsetRef.current === 0
	const atBottom = offsetRef.current + viewport >= rows.length

	return (
		<box
			flexDirection="column"
			width={width}
			flexShrink={0}
			border
			overflow="hidden"
			borderColor={focused ? color.borderFocus : color.border}
			title="linear"
			titleColor={color.accent}
			bottomTitle={more ? ` ${atTop ? "" : "↑"}${atBottom ? "" : "↓"} ` : ""}
			onMouseScroll={wheel(onScroll)}
		>
			{visible.map((row, i) => {
				if (row.kind === "blank") return <text key={`b${i}`}>{""}</text>

				if (row.kind === "header") {
					return (
						<text key={`h${i}`} fg={color.faint}>
							{fit(row.label, inner)}
						</text>
					)
				}

				const item = items[row.index]
				if (!item) return null
				const active = row.index === selected
				const label = navLabel(item)
				// Cycles carry a progress meter -- the one number you want off a sprint at
				// a glance -- and the inbox carries its unread count for the same reason.
				const suffix = item.kind === "cycle" && item.cycle.progress != null ? ` ${meter(item.cycle.progress, 6)}` : item.kind === "inbox" && unread ? ` ${unread}` : ""
				const text = fit(`  ${label}`, Math.max(0, inner - suffix.length)) + suffix
				const badge = item.kind === "inbox" && !!unread

				return (
					<box key={`n${row.index}`} onMouseDown={() => onPick(row.index)}>
						<text fg={active ? color.fg : badge ? color.accent : color.dim} {...(active ? { bg: color.selectedBg } : {})} attributes={active || badge ? 1 : 0}>
							{text}
						</text>
					</box>
				)
			})}
		</box>
	)
}
