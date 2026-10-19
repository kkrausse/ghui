import { defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useRef } from "react"
import { color } from "../theme.ts"

/**
 * Enter inserts a newline (comments are multi-line); submit is cmd+Enter,
 * matching Linear's web app.
 *
 * OpenTUI's `meta` is option/alt, not cmd -- cmd is `super` (see its own
 * defaults: meta+f is word-forward, super+z is undo). The stock table only
 * binds submit to meta+Enter, so cmd+Enter reached the textarea and did
 * nothing. ctrl+s stays as the fallback for terminals that cannot encode cmd
 * at all: it needs the kitty keyboard protocol, which webterm speaks and
 * Terminal.app does not.
 */
const KEY_BINDINGS = [
	...defaultTextareaKeyBindings,
	{ name: "return", super: true, action: "submit" as const },
	{ name: "kpenter", super: true, action: "submit" as const },
	{ name: "s", ctrl: true, action: "submit" as const },
]

/**
 * A one-off prompt rather than a comment: Enter and cmd+Enter send, shift+Enter
 * is the newline. Terminals that can't report shift+Enter often send ESC+CR for
 * it, which arrives as meta+Enter -- a submit in OpenTUI's defaults -- so that
 * is a newline here too.
 */
const ENTER_SENDS = [
	...KEY_BINDINGS,
	{ name: "return", action: "submit" as const },
	{ name: "return", shift: true, action: "newline" as const },
	{ name: "return", meta: true, action: "newline" as const },
]

type Props = {
	/** Pane title, e.g. "comment on BACKEND-1361" or "update on Search Rebuild". */
	title: string
	placeholder: string
	onSubmit: (body: string) => void
	busy: boolean
	enterSends?: boolean
}

/**
 * `SubmitEvent` carries no payload, so the body is read off the renderable's
 * `plainText` at submit time rather than mirrored into React state per keystroke.
 */
export function CommentBox({ title, placeholder, onSubmit, busy, enterSends = false }: Props) {
	const ref = useRef<TextareaRenderable | null>(null)

	return (
		<box
			flexDirection="column"
			border
			borderColor={color.accent}
			title={` ${title} `}
			titleColor={color.accent}
			bottomTitle={enterSends ? " ↵ or ⌘↵ send · shift+↵ new line · esc cancel " : " ⌘↵ or ctrl+s send · esc cancel "}
			padding={1}
			flexGrow={1}
		>
			{busy ? (
				<text fg={color.dim}>Posting…</text>
			) : (
				<textarea
					ref={ref}
					focused
					flexGrow={1}
					placeholder={placeholder}
					keyBindings={enterSends ? ENTER_SENDS : KEY_BINDINGS}
					onSubmit={() => onSubmit(ref.current?.plainText ?? "")}
				/>
			)}
		</box>
	)
}
