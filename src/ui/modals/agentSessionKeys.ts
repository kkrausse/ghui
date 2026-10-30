import { backspace, deleteToLineStart, deleteWordBackward, insertText, moveLeft, moveLineEnd, moveLineStart, moveRight } from "../commentEditor.js"
import { printableKeyText } from "../singleLineInput.js"
import type { AgentSessionModalState } from "./types.js"

type Key = { name: string; sequence: string; ctrl: boolean; meta: boolean; shift: boolean }

/**
 * The agent session modal's keys for a view outside the host keymap (Linear),
 * matching the GitHub bindings: ↑↓ pick where, enter writes instructions then
 * starts in the background, ctrl+o starts and opens, esc backs out.
 */
export const agentSessionKey = (state: AgentSessionModalState, key: Key): { state: AgentSessionModalState; action?: "start" | "open" | "cancel" } => {
	const edit = (transform: (value: { body: string; cursor: number }) => { body: string; cursor: number }) => ({ state: { ...state, ...transform(state) } })
	if (key.ctrl && key.name === "o") return { state, action: "open" }
	if (state.focus === "action") {
		if (key.name === "escape") return { state, action: "cancel" }
		if (key.name === "return") return { state: { ...state, focus: "body" } }
		if (key.name === "down" || key.name === "j") return { state: { ...state, selectedIndex: Math.min(state.targets.length - 1, state.selectedIndex + 1) } }
		if (key.name === "up" || key.name === "k") return { state: { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) } }
		return { state }
	}
	if (key.name === "escape") return { state: { ...state, focus: "action" } }
	if (key.name === "return") return key.shift ? edit((v) => insertText(v, "\n")) : { state, action: "start" }
	if (key.name === "backspace") return edit(key.meta ? deleteWordBackward : backspace)
	if (key.ctrl && key.name === "w") return edit(deleteWordBackward)
	if (key.ctrl && key.name === "u") return edit(deleteToLineStart)
	if (key.name === "left" || (key.ctrl && key.name === "b")) return edit(moveLeft)
	if (key.name === "right" || (key.ctrl && key.name === "f")) return edit(moveRight)
	if (key.name === "home" || (key.ctrl && key.name === "a")) return edit(moveLineStart)
	if (key.name === "end" || (key.ctrl && key.name === "e")) return edit(moveLineEnd)
	const text = printableKeyText(key)
	return text ? edit((v) => insertText(v, text)) : { state }
}
