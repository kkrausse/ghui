import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef, type MutableRefObject } from "react"
import { dispatchCommandAtom } from "../../commands/dispatch.js"
import { registerHandoff } from "../../commands/handoffs.js"
import { conversationSelectionAtom, orderedCommentsAtom, selectedCommentKeyAtom } from "./atoms.js"

/** Selection reveal is imperative and happens only on navigation, never on render. */
export const useConversationSelection = (active: boolean, scrollRef: MutableRefObject<ScrollBoxRenderable | null>) => {
	const key = useAtomValue(selectedCommentKeyAtom)
	const ordered = useAtomValue(orderedCommentsAtom)
	const [selections, setSelections] = useAtom(conversationSelectionAtom)
	const dispatch = useAtomSet(dispatchCommandAtom)
	const blocks = useRef(new Map<string, BoxRenderable>())
	const ids = ["", ...ordered.map(({ comment }) => comment.id)]
	const stored = key ? selections[key] : null
	const selectedId = stored && ids.includes(stored) ? stored : ""
	const cursor = useRef(selectedId)
	cursor.current = selectedId

	const select = (id: string, reveal = true) => {
		if (!key) return
		cursor.current = id
		setSelections((current) => ({ ...current, [key]: id || null }))
		if (!reveal) return
		const scroll = scrollRef.current
		const block = blocks.current.get(id)
		if (!scroll || !block) return
		// The description is the first block; revealing it also reveals the header above it.
		const top = id === "" ? 0 : block.y - scroll.content.y
		const bottom = top + block.height
		if (top < scroll.scrollTop || block.height > scroll.viewport.height) scroll.scrollTo({ x: 0, y: top })
		else if (bottom > scroll.scrollTop + scroll.viewport.height) scroll.scrollTo({ x: 0, y: Math.max(0, bottom - scroll.viewport.height) })
	}
	const move = (delta: number) => {
		const scroll = scrollRef.current
		const selected = blocks.current.get(cursor.current)
		if (scroll && selected) {
			const top = selected.y - scroll.content.y
			if (top + selected.height <= scroll.scrollTop || top >= scroll.scrollTop + scroll.viewport.height) {
				const visible = ids.filter((id) => {
					const block = blocks.current.get(id)
					if (!block) return false
					const y = block.y - scroll.content.y
					return y < scroll.scrollTop + scroll.viewport.height && y + block.height > scroll.scrollTop
				})
				const nearest = delta > 0 ? visible[0] : visible.at(-1)
				if (nearest !== undefined) return select(nearest)
			}
		}
		select(ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(cursor.current) + delta))] ?? "")
	}
	useEffect(() => {
		if (!active) return
		const previous = registerHandoff("previousConversationBlock", () => move(-1))
		const next = registerHandoff("nextConversationBlock", () => move(1))
		return () => {
			previous()
			next()
		}
	})
	return {
		selectedId,
		select,
		copyLink: () => dispatch("comments.copy-link"),
		registerBlock: (id: string, node: BoxRenderable | null) => {
			if (node) blocks.current.set(id, node)
			else blocks.current.delete(id)
		},
	}
}
