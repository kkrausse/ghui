import { CodeRenderable, SyntaxStyle, TextRenderable, rgbToHex, type MarkdownOptions, type Renderable, type TextChunk } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useMemo, useRef } from "react"
import { colors } from "./colors.js"
import { issueReferenceUrl } from "./inlineSegments.js"

// Hit-test the renderer's wrapped lines, not the old plain-text preview rows.
// Keeping the chunks also preserves links whose labels differ from their URLs.
const markdownLinkAt = (node: CodeRenderable | TextRenderable, chunks: readonly TextChunk[], x: number, y: number): string | null => {
	const row = y - node.y
	const col = x - node.x
	const info = node.lineInfo
	if (row < 0 || col < 0 || col >= (info.lineWidthCols[row] ?? 0)) return null
	const source = info.lineSources[row] ?? row
	const targetCol = (info.lineStartCols[row] ?? 0) + col
	let line = 0
	let column = 0
	for (const chunk of chunks) {
		const parts = chunk.text.split("\n")
		for (let index = 0; index < parts.length; index++) {
			if (index > 0) {
				line++
				column = 0
			}
			const end = column + Bun.stringWidth(parts[index] ?? "")
			if (line === source && targetCol >= column && targetCol < end) return chunk.link?.url ?? null
			column = end
		}
	}
	return null
}

const tokenText = (value: unknown): string => {
	if (!value || typeof value !== "object") return ""
	const token = value as Record<string, unknown>
	return Array.isArray(token.tokens) ? token.tokens.map(tokenText).join("") : typeof token.text === "string" ? token.text : ""
}

const tokenLinks = (value: unknown): { label: string; url: string }[] => {
	if (!value || typeof value !== "object") return []
	const token = value as Record<string, unknown>
	if (token.type === "link" && typeof token.href === "string") return [{ label: tokenText(token), url: token.href }]
	return Object.values(token).flatMap((child) => (typeof child === "object" ? tokenLinks(child) : []))
}

// OpenTUI 0.4's highlighting pass links the destination but drops the label's
// hyperlink. Restore it from the parsed tokens before doing mouse hit testing.
const linkLabels = (chunks: TextChunk[], links: { label: string; url: string }[]): TextChunk[] => {
	const text = chunks.map((chunk) => chunk.text).join("")
	const ranges = links.flatMap(({ label, url }) => {
		const needle = `${label} (${url})`
		const matches = []
		for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + needle.length)) matches.push({ start, end: start + label.length, url })
		return matches
	})
	let offset = 0
	return chunks.flatMap((chunk) => {
		const start = offset
		offset += chunk.text.length
		const boundaries = [...new Set([start, ...ranges.flatMap((range) => [range.start, range.end]).filter((pos) => pos > start && pos < offset), offset])].sort((a, b) => a - b)
		return boundaries.slice(0, -1).map((pos, index) => {
			const range = ranges.find((range) => pos >= range.start && pos < range.end)
			return { ...chunk, text: chunk.text.slice(pos - start, boundaries[index + 1]! - start), ...(range ? { link: { url: range.url } } : {}) }
		})
	})
}

/** OpenCode's Markdown renderer, using ghui's active (including system) palette. */
export const MarkdownBody = ({
	body,
	width,
	repository,
	onLinkOpen,
}: {
	body: string
	width?: number
	repository?: string | undefined
	onLinkOpen?: ((url: string) => void) | undefined
}) => {
	const renderer = useRenderer()
	const chunksByNode = useRef(new WeakMap<CodeRenderable, readonly TextChunk[]>())
	const renderNode = useMemo<NonNullable<MarkdownOptions["renderNode"]>>(
		() => (token, context) => {
			const links = tokenLinks(token)
			const root = context.defaultRender()
			const attach = (node: Renderable) => {
				if (node instanceof TextRenderable || node instanceof CodeRenderable) {
					node.selectionBg = colors.selectedBg
					node.selectionFg = colors.selectedText
				}
				if (node instanceof CodeRenderable && node.filetype === "markdown") {
					const original = node.onChunks
					node.onChunks = async (chunks, highlightContext) => {
						const linked = linkLabels((await original?.(chunks, highlightContext)) ?? chunks, links)
						const result = repository
							? linked.flatMap((chunk) => {
									// Inline code and existing links must stay literal.
									if (chunk.link || (chunk.fg && rgbToHex(chunk.fg) === colors.inlineCode)) return [chunk]
									return chunk.text
										.split(/((?<![\w/])#\d+\b)/)
										.filter(Boolean)
										.map((text) => (/^#\d+$/.test(text) ? { ...chunk, text, link: { url: issueReferenceUrl(repository, Number(text.slice(1))) } } : { ...chunk, text }))
								})
							: linked
						chunksByNode.current.set(node, result)
						return result
					}
				}
				for (const child of node.getChildren()) attach(child)
			}
			if (root) attach(root)
			return root
		},
		[repository],
	)
	useEffect(() => () => renderer.setMousePointer("default"), [renderer])
	const linkAt = (node: Renderable, x: number, y: number): string | null => {
		if (x < node.x || y < node.y || x >= node.x + node.width || y >= node.y + node.height) return null
		if (node instanceof TextRenderable) return markdownLinkAt(node, node.chunks, x, y)
		if (node instanceof CodeRenderable) return markdownLinkAt(node, chunksByNode.current.get(node) ?? [], x, y)
		for (const child of node.getChildren()) {
			const url = linkAt(child, x, y)
			if (url) return url
		}
		return null
	}
	const palette = [colors.text, colors.count, colors.accent, colors.inlineCode, colors.link, colors.muted, colors.separator, colors.status.review].join(":")
	const syntaxStyle = useMemo(
		() =>
			SyntaxStyle.fromStyles({
				default: { fg: colors.text },
				"markup.heading": { fg: colors.count, bold: true },
				"markup.strong": { bold: true },
				"markup.italic": { italic: true },
				"markup.strikethrough": { dim: true },
				"markup.raw": { fg: colors.inlineCode },
				"markup.link": { fg: colors.link },
				"markup.link.label": { fg: colors.link, underline: true },
				"markup.link.url": { fg: colors.muted },
				"markup.list": { fg: colors.accent },
				"markup.quote": { fg: colors.muted, italic: true },
				conceal: { fg: colors.separator },
				comment: { fg: colors.muted, italic: true },
				keyword: { fg: colors.accent },
				string: { fg: colors.inlineCode },
				number: { fg: colors.status.review },
				boolean: { fg: colors.status.review },
				function: { fg: colors.link },
				type: { fg: colors.count },
			}),
		[palette],
	)
	useEffect(() => () => syntaxStyle.destroy(), [syntaxStyle])

	return (
		<markdown
			renderNode={renderNode}
			onMouseMove={function (event) {
				if (onLinkOpen) renderer.setMousePointer(linkAt(this, event.x, event.y) ? "pointer" : "default")
			}}
			onMouseOut={() => renderer.setMousePointer("default")}
			onMouseDown={function (event) {
				if (!onLinkOpen || event.button !== 0) return
				const url = linkAt(this, event.x, event.y)
				if (url) {
					event.stopPropagation()
					onLinkOpen(url)
				}
			}}
			content={body}
			syntaxStyle={syntaxStyle}
			fg={colors.text}
			{...(width === undefined ? {} : { width: Math.max(1, width) })}
			flexShrink={0}
			conceal
			streaming={false}
			internalBlockMode="top-level"
			tableOptions={{ style: "grid", wrapMode: "word", borderColor: colors.separator }}
		/>
	)
}
