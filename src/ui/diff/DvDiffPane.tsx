import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type BoxRenderable, type KeyEvent, type MouseEvent, type OptimizedBuffer, RGBA } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { Effect } from "effect"
import { useEffect, useMemo, useRef, useState } from "react"
import type { PullRequestItem, PullRequestReviewComment } from "../../domain.js"
import { resolveRepoPath } from "../../editorCommand.js"
import { loadStoredEditorConfig } from "../../themeStore.js"
import { colors } from "../colors.js"
import { pullRequestDiffKey } from "../diff.js"
import { activeModalAtom } from "../modals/atoms.js"
import { initialCommentModalState, Modal } from "../modals/types.js"
import { shortRepoName } from "../pullRequests.js"
import { diffCommentThreadsAtom, diffMarkdownPreviewAtom } from "./atoms.js"
import { dvKeyCode, hostOwnsKey } from "./dvKeys.js"
import { DV_ACTION, DV_PENDING, DV_REDRAW, type DvAction, type DvMouseKind, type DvRun, DvView } from "./dvNative.js"

interface KeyInputListeners {
	prependListener(event: "keypress", handler: (event: KeyEvent) => void): void
	off(event: "keypress", handler: (event: KeyEvent) => void): void
}

// Each thread takes its location from its first comment, as GHUI's thread map
// does, so a reply whose own path/line differs still lands in its thread.
const reviewCommentsJson = (threads: Record<string, readonly PullRequestReviewComment[]>, diffKey: string) =>
	JSON.stringify(
		Object.entries(threads)
			.filter(([key, comments]) => key.startsWith(`${diffKey}:`) && comments.length > 0)
			.flatMap(([, comments]) => {
				const { path, line, side } = comments[0]!
				return comments.map((c) => ({ id: c.id, path, line, side, author: c.author, body: c.body, createdAt: c.createdAt?.getTime() ?? null, inReplyTo: c.inReplyTo }))
			}),
	)

const rgbaCache = new Map<number, RGBA>()
const rgba = (value: number, fallback: string) => {
	if (value === 0) return RGBA.fromHex(fallback)
	let color = rgbaCache.get(value)
	if (!color) {
		color = RGBA.fromInts(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
		rgbaCache.set(value, color)
	}
	return color
}

const mouseKind = (event: MouseEvent): DvMouseKind | null => {
	switch (event.type) {
		case "down":
			return event.button === 0 ? "down" : null
		case "up":
		case "drag-end":
			return "up"
		case "drag":
			return "drag"
		case "move":
			return "move"
		case "scroll":
			return event.scroll ? `scroll-${event.scroll.direction}` : null
		default:
			return null
	}
}

export interface DvDiffPaneProps {
	readonly pullRequest: PullRequestItem
	readonly patch: string
	readonly width: number
	readonly height: number
}

/**
 * The diff pane drawn by dv (Rust, via FFI). dv gets every key except the few in
 * `hostOwnsKey` while no modal is open, and its comment/reply requests open
 * GHUI's comment modal, so posting and optimistic updates stay in GHUI.
 */
export const DvDiffPane = ({ pullRequest, patch, width, height }: DvDiffPaneProps) => {
	const renderer = useRenderer()
	const boxRef = useRef<BoxRenderable | null>(null)
	const runsRef = useRef<{ readonly runs: readonly DvRun[]; readonly width: number; readonly height: number } | null>(null)
	const [view, setView] = useState<DvView | null>(null)
	const setModal = useAtomSet(activeModalAtom)
	const modalOpen = useAtomValue(activeModalAtom)._tag !== "None"
	const previewOpen = useAtomValue(diffMarkdownPreviewAtom)
	const threads = useAtomValue(diffCommentThreadsAtom)
	const diffKey = pullRequestDiffKey(pullRequest)
	const title = `#${pullRequest.number} ${shortRepoName(pullRequest.repository)}`

	// The local clone from config.json `repoPaths`, where dv finds pre-image blobs
	// for expanding hidden context. undefined until resolved.
	const [repoDir, setRepoDir] = useState<string | null | undefined>(undefined)
	useEffect(() => {
		let live = true
		Effect.runPromise(loadStoredEditorConfig)
			.then((config) => resolveRepoPath(config.repoPaths, pullRequest.repository))
			.catch(() => null)
			.then((dir) => live && setRepoDir(dir))
		return () => {
			live = false
		}
	}, [pullRequest.repository])

	useEffect(() => {
		if (repoDir === undefined) return
		const next = DvView.create(patch, { title, repoDir })
		setView(next)
		runsRef.current = null
		return () => next?.destroy()
	}, [patch, title, repoDir])

	const redraw = () => {
		runsRef.current = null
		boxRef.current?.requestRender()
	}

	const openRequest = (action: DvAction) => {
		const { repository, number } = pullRequest
		if (action.type === "comment") {
			const range =
				action.startLine === undefined ? null : { start: { line: action.startLine, side: action.startSide ?? action.side }, end: { line: action.line, side: action.side } }
			setModal(
				Modal.Comment({
					...initialCommentModalState,
					target: {
						kind: "diff",
						target: { repository, number, commitId: pullRequest.headRefOid, diffKey, anchor: { path: action.path, line: action.line, side: action.side }, range },
					},
				}),
			)
		} else {
			setModal(
				Modal.Comment({
					...initialCommentModalState,
					target: { kind: "reply", subject: { repository, number, key: diffKey, issueUrl: null }, inReplyTo: action.inReplyTo, anchorLabel: `${action.path}:${action.line}` },
				}),
			)
		}
	}

	const handleResult = (result: number) => {
		if (!view) return
		if (result & DV_ACTION) for (const action of view.takeActions()) openRequest(action)
		if (result & DV_REDRAW) redraw()
	}

	const commentsJson = useMemo(() => reviewCommentsJson(threads, diffKey), [threads, diffKey])
	useEffect(() => {
		if (view?.setComments(commentsJson)) redraw()
	}, [view, commentsJson])

	// Syntax highlighting and hidden-context sources load on dv's threads.
	useEffect(() => {
		if (!view) return
		const timer = setInterval(() => {
			const result = view.poll()
			handleResult(result)
			if (!(result & DV_PENDING)) clearInterval(timer)
		}, 30)
		return () => clearInterval(timer)
	}, [view])

	// Prepended so dv sees keys before GHUI's global keymap; handled keys stop there.
	const keysEnabled = view !== null && !modalOpen && !previewOpen
	useEffect(() => {
		if (!keysEnabled || !view) return
		const onKey = (event: KeyEvent) => {
			if (event.defaultPrevented || hostOwnsKey(event, view)) return
			const code = dvKeyCode(event)
			if (code === null) return
			event.preventDefault()
			event.stopPropagation()
			handleResult(view.key(code, { ctrl: event.ctrl, shift: event.shift, alt: event.meta || event.option }))
		}
		// KeyHandler is a Node EventEmitter at runtime; its typings omit these methods.
		const keyInput = renderer.keyInput as unknown as KeyInputListeners
		keyInput.prependListener("keypress", onKey)
		return () => {
			keyInput.off("keypress", onKey)
		}
	}, [keysEnabled, view, renderer])

	const onMouse = (event: MouseEvent) => {
		const box = boxRef.current
		const kind = mouseKind(event)
		if (!view || !box || !kind || modalOpen) return
		const mods = { ctrl: event.modifiers.ctrl, shift: event.modifiers.shift, alt: event.modifiers.alt }
		handleResult(view.mouse(kind, event.x - box.x, event.y - box.y, mods))
		event.stopPropagation()
	}

	function renderAfter(this: BoxRenderable, buffer: OptimizedBuffer) {
		if (!view) return
		const w = this.width
		const h = this.height
		let frame = runsRef.current
		if (!frame || frame.width !== w || frame.height !== h) {
			frame = { runs: view.render(w, h), width: w, height: h }
			runsRef.current = frame
		}
		buffer.fillRect(this.x, this.y, w, h, RGBA.fromHex(colors.background))
		for (const run of frame.runs) buffer.drawText(run.text, this.x + run.x, this.y + run.y, rgba(run.fg, colors.text), rgba(run.bg, colors.background), run.attrs)
	}

	return <box ref={boxRef} width={width} height={height} onMouse={onMouse} renderAfter={renderAfter} />
}
