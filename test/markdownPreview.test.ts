import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { markdownPreviewKeymap, type MarkdownPreviewCtx } from "../src/keymap/markdownPreview.ts"
import { isMarkdownFile } from "../src/ui/diff.ts"

describe("Markdown diff preview", () => {
	test("recognizes supported documentation files case-insensitively", () => {
		expect(isMarkdownFile("README.md")).toBe(true)
		expect(isMarkdownFile("docs/guide.MARKDOWN")).toBe(true)
		expect(isMarkdownFile("docs/component.mdx")).toBe(false)
		expect(isMarkdownFile("src/readme.ts")).toBe(false)
	})

	test("owns scrolling, copying, reloading, and dismissal while the dialog is open", () => {
		const called: string[] = []
		const ctx: MarkdownPreviewCtx = {
			halfPage: 6,
			close: () => called.push("close"),
			scrollBy: (delta) => called.push(`scroll:${delta}`),
			scrollTo: (y) => called.push(`to:${y}`),
			copy: () => called.push("copy"),
			reload: () => called.push("reload"),
		}
		const dispatcher = createDispatcher(markdownPreviewKeymap, () => ctx)
		for (const key of ["down", "ctrl+u", "shift+g", "y", "meta+c", "r", "escape"]) dispatcher.dispatch(parseKey(key))

		expect(called).toEqual([`scroll:1`, `scroll:-6`, `to:${Number.MAX_SAFE_INTEGER}`, "copy", "copy", "reload", "close"])
	})
})
