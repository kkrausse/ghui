import type { KeyEvent } from "@opentui/core"
import { DV_KEY } from "./dvNative.js"

const specialKeys: Record<string, number> = {
	return: DV_KEY.enter,
	enter: DV_KEY.enter,
	escape: DV_KEY.escape,
	tab: DV_KEY.tab,
	backspace: DV_KEY.backspace,
	up: DV_KEY.up,
	down: DV_KEY.down,
	left: DV_KEY.left,
	right: DV_KEY.right,
	pageup: DV_KEY.pageup,
	pagedown: DV_KEY.pagedown,
	home: DV_KEY.home,
	end: DV_KEY.end,
	delete: DV_KEY.delete,
}

type KeyLike = Pick<KeyEvent, "name" | "sequence" | "ctrl" | "meta" | "shift">

/** dv's key code for an OpenTUI key: a Unicode scalar or one of DV_KEY. */
export const dvKeyCode = (key: KeyLike): number | null => {
	if (key.name === "tab" && key.shift) return DV_KEY.backtab
	const special = specialKeys[key.name]
	if (special !== undefined) return special
	if (key.name === "space") return 0x20
	// The sequence carries shifted characters ("G", "{"); with ctrl/meta it is a control byte.
	if (!key.ctrl && !key.meta && key.sequence) {
		const cp = key.sequence.codePointAt(0)
		if (cp !== undefined && cp >= 0x20 && String.fromCodePoint(cp) === key.sequence) return cp
	}
	return key.name.length === 1 ? key.name.codePointAt(0)! : null
}

/** Keys GHUI keeps while dv has focus: the palette, quitting, tabs, review, left arrow (back), and Esc once dv has nothing to clear. */
export const hostOwnsKey = (key: KeyLike, dv: { wantsEscape(): boolean; textInput(): boolean }) => {
	if (dv.textInput()) return false
	if (key.ctrl && ["p", "c", "left", "right", "tab"].includes(key.name)) return true
	if (key.meta && key.name === "k") return true
	if (key.name === "escape") return !dv.wantsEscape()
	// Left goes back to the PR, as everywhere in GHUI; dv still pans with h/l.
	if (key.name === "left" && !key.ctrl && !key.meta && !key.shift) return true
	return !key.ctrl && !key.meta && ["q", "?", "R", "Y"].includes(key.sequence)
}
