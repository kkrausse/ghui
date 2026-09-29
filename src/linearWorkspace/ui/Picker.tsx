import type { SelectOption, SelectRenderable } from "@opentui/core"
import { useRef } from "react"
import { color } from "../theme.ts"
import { wheel } from "./wheel.ts"

type Props = {
	title: string
	options: SelectOption[]
	onSelect: (option: SelectOption) => void
	busy: boolean
}

/**
 * Modal chooser for the edit bindings. `<select>` owns j/k and enter; escape is
 * handled by the app's global key handler so cancel behaves the same everywhere.
 */
export function Picker({ title, options, onSelect, busy }: Props) {
	// `<select>` has no wheel handling of its own, and the assignee list is long
	// enough to need one. Its own moveUp/moveDown keep the scroll indicator honest.
	const list = useRef<SelectRenderable>(null)

	return (
		<box
			flexDirection="column"
			border
			borderColor={color.accent}
			title={` ${title} `}
			titleColor={color.accent}
			bottomTitle=" ↵ apply · esc cancel "
			padding={1}
			flexGrow={1}
			onMouseScroll={wheel((delta) => {
				if (delta < 0) list.current?.moveUp(1)
				else list.current?.moveDown(1)
			})}
		>
			{busy ? (
				<text fg={color.dim}>Applying…</text>
			) : options.length === 0 ? (
				<text fg={color.dim}>Nothing to choose from.</text>
			) : (
				<select
					ref={list}
					focused
					flexGrow={1}
					options={options}
					showDescription
					showScrollIndicator
					wrapSelection
					backgroundColor="transparent"
					textColor={color.dim}
					focusedTextColor={color.fg}
					selectedTextColor={color.fg}
					selectedBackgroundColor={color.selectedBg}
					descriptionColor={color.faint}
					onSelect={(_index: number, option: SelectOption | null) => {
						if (option) onSelect(option)
					}}
				/>
			)}
		</box>
	)
}
