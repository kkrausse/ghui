import { context } from "@ghui/keymap"

export interface MarkdownPreviewCtx {
	readonly halfPage: number
	readonly close: () => void
	readonly scrollBy: (delta: number) => void
	readonly scrollTo: (y: number) => void
	readonly copy: () => void
	readonly reload: () => void
}

const MarkdownPreview = context<MarkdownPreviewCtx>()

export const markdownPreviewKeymap = MarkdownPreview(
	{ id: "markdown-preview.close", title: "Return to diff", keys: ["escape", "m", "left"], run: (s) => s.close() },
	{ id: "markdown-preview.up", title: "Scroll up", keys: ["up", "k"], run: (s) => s.scrollBy(-1) },
	{ id: "markdown-preview.down", title: "Scroll down", keys: ["down", "j"], run: (s) => s.scrollBy(1) },
	{ id: "markdown-preview.jump-up", title: "Jump up", keys: ["shift+up", "shift+k", "meta+up", "meta+k"], run: (s) => s.scrollBy(-8) },
	{ id: "markdown-preview.jump-down", title: "Jump down", keys: ["shift+down", "shift+j", "meta+down", "meta+j"], run: (s) => s.scrollBy(8) },
	{ id: "markdown-preview.half-up", title: "Half page up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{ id: "markdown-preview.half-down", title: "Half page down", keys: ["pagedown", "ctrl+d", "ctrl+v"], run: (s) => s.scrollBy(s.halfPage) },
	{ id: "markdown-preview.top", title: "Scroll to top", keys: ["home", "g g"], run: (s) => s.scrollTo(0) },
	{ id: "markdown-preview.bottom", title: "Scroll to bottom", keys: ["end", "shift+g"], run: (s) => s.scrollTo(Number.MAX_SAFE_INTEGER) },
	{ id: "markdown-preview.copy", title: "Copy selected Markdown text", keys: ["y", "meta+c", "ctrl+shift+c"], run: (s) => s.copy() },
	{ id: "markdown-preview.reload", title: "Reload diff and preview", keys: ["r"], run: (s) => s.reload() },
)
