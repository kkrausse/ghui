import { expect, test } from "bun:test"
import { act, useState } from "react"
import { testRender } from "@opentui/react/test-utils"
import { createMockMouse } from "@opentui/core/testing"
import { CodeRenderable, type Renderable, type ScrollBoxRenderable } from "@opentui/core"
import { MarkdownBody } from "../src/ui/MarkdownBody.js"
import { CommentsPane, ConversationSection, orderCommentsForDisplay } from "../src/ui/CommentsPane.js"
import type { CommentLoadState } from "../src/ui/comments/loadState.js"
import type { PullRequestComment } from "../src/domain.js"

const settle = async (setup: Awaited<ReturnType<typeof testRender>>) => {
	const highlighting = (node: Renderable): Promise<void>[] => [...(node instanceof CodeRenderable ? [node.highlightingDone] : []), ...node.getChildren().flatMap(highlighting)]
	await act(async () => {
		await setup.flush()
		await Promise.all(highlighting(setup.renderer.root))
		await setup.flush()
		await setup.flush()
	})
}

test("description scrolls while conversation loads and keeps its position as comments arrive", async () => {
	const comments: PullRequestComment[] = Array.from({ length: 100 }, (_, i) => ({
		_tag: "comment",
		id: `comment-${i}`,
		author: `reviewer-${i}`,
		body: `Feedback ${i}`,
		createdAt: new Date(2026, 0, 1, 0, i),
		url: `https://github.com/owner/repo/issues/1#issuecomment-${i}`,
	}))
	const ordered = orderCommentsForDisplay(comments)
	let scrollbox: ScrollBoxRenderable | null = null
	let update = (_state: CommentLoadState) => {}
	const Harness = () => {
		const [loadState, setLoadState] = useState<CommentLoadState>({ status: "loading", cached: false })
		update = setLoadState
		return (
			<scrollbox
				ref={(node) => {
					scrollbox = node
				}}
				height={12}
				focusable={false}
				verticalScrollbarOptions={{ visible: false }}
			>
				<MarkdownBody width={58} body={Array.from({ length: 30 }, (_, i) => `Description paragraph ${i}\n`).join("\n")} />
				<ConversationSection
					orderedComments={loadState.status === "loading" && !loadState.cached ? [] : ordered}
					loadState={loadState}
					contentWidth={58}
					repository="owner/repo"
					themeKey="test"
					loadingIndicator="…"
				/>
			</scrollbox>
		)
	}
	const setup = await testRender(<Harness />, { width: 60, height: 12 })
	const scroll = () => scrollbox as unknown as ScrollBoxRenderable
	try {
		await settle(setup)
		expect(setup.captureCharFrame()).toContain("Description paragraph 0")
		scroll().scrollTo({ x: 0, y: 10 })
		await settle(setup)
		const position = scroll().scrollTop
		const before = setup.captureCharFrame()
		expect(position).toBe(10)
		await act(async () => update({ status: "ready" }))
		await settle(setup)
		expect(scroll().scrollTop).toBe(position)
		expect(setup.captureCharFrame()).toBe(before)
		scroll().scrollTo({ x: 0, y: Number.MAX_SAFE_INTEGER })
		await settle(setup)
		expect(setup.captureCharFrame()).toContain("Feedback 99")
		const endPosition = scroll().scrollTop
		await act(async () => update({ status: "loading", cached: true }))
		await settle(setup)
		expect(scroll().scrollTop).toBe(endPosition)
		expect(setup.captureCharFrame()).toContain("Feedback 99")
		await act(async () => update({ status: "error", cached: true, error: "Offline" }))
		await settle(setup)
		expect(scroll().scrollTop).toBe(endPosition)
		expect(setup.captureCharFrame()).toContain("Feedback 99")
	} finally {
		await act(async () => setup.renderer.destroy())
	}
})

test("native Markdown renders tables and keeps links and issue references clickable", async () => {
	const opened: string[] = []
	const setup = await testRender(
		<MarkdownBody
			width={40}
			repository="owner/repo"
			onLinkOpen={(url) => opened.push(url)}
			body={
				"# Overview\n\n**Ready** with `inline code`. See #123.\n\n[Documentation](https://example.com/docs)\n\n| Name | State |\n| --- | --- |\n| Parser | Ready |\n\n```typescript\nconst ready = true;\n```"
			}
		/>,
		{ width: 40, height: 24 },
	)
	try {
		await settle(setup)
		const frame = setup.captureCharFrame()
		expect(frame).toContain("Overview")
		expect(frame).not.toContain("# Overview")
		expect(frame).not.toContain("**Ready**")
		expect(frame).toContain("Parser")
		expect(frame).toContain("┌")
		expect(frame).toContain("const ready = true;")
		const mouse = createMockMouse(setup.renderer)
		for (const label of ["Documentation", "#123"]) {
			const lines = frame.split("\n")
			const y = lines.findIndex((line) => line.includes(label))
			expect(y).toBeGreaterThanOrEqual(0)
			await mouse.click(lines[y]!.indexOf(label) + 1, y)
		}
		expect(opened).toEqual(["https://example.com/docs", "ghui://issue-ref/owner%2Frepo/123"])
	} finally {
		await act(async () => setup.renderer.destroy())
	}
})

test("Markdown links remain clickable on wrapped continuation rows", async () => {
	const opened: string[] = []
	const setup = await testRender(<MarkdownBody width={24} body="界界 [Read the documentation here](https://example.com/docs)" onLinkOpen={(url) => opened.push(url)} />, {
		width: 24,
		height: 8,
	})
	try {
		await settle(setup)
		const lines = setup.captureCharFrame().split("\n")
		const y = lines.findIndex((line) => line.includes("documentation"))
		expect(y).toBeGreaterThan(0)
		await createMockMouse(setup.renderer).click(lines[y]!.indexOf("documentation") + 2, y)
		expect(opened).toEqual(["https://example.com/docs"])
	} finally {
		await act(async () => setup.renderer.destroy())
	}
})

test("rendered Markdown supports mouse text selection", async () => {
	const setup = await testRender(<MarkdownBody width={40} body="Select this rendered text" />, { width: 40, height: 4 })
	try {
		await settle(setup)
		const frame = setup.captureCharFrame().split("\n")
		const y = frame.findIndex((line) => line.includes("Select this rendered text"))
		const x = frame[y]!.indexOf("Select")
		await createMockMouse(setup.renderer).drag(x, y, x + "Select this".length, y)
		expect(setup.renderer.getSelection()?.getSelectedText()).toBe("Select this")
	} finally {
		await act(async () => setup.renderer.destroy())
	}
})

test("comment selection reaches the add row after a tall Markdown body", async () => {
	const comments: PullRequestComment[] = [
		{
			_tag: "comment",
			id: "one",
			author: "alice",
			body: "# Review\n\n" + Array.from({ length: 25 }, (_, i) => `- Item ${i}`).join("\n"),
			createdAt: new Date(),
			url: "https://github.com/owner/repo/issues/1#issuecomment-1",
		},
	]
	const props = {
		item: { repository: "owner/repo", number: 1 },
		comments,
		orderedComments: orderCommentsForDisplay(comments),
		loadState: { status: "ready" as const },
		contentWidth: 48,
		paneWidth: 50,
		height: 12,
		loadingIndicator: "...",
		themeGeneration: 0,
		showScrollbar: false,
	}
	let select = (_index: number) => {}
	const Harness = () => {
		const [selectedIndex, setSelectedIndex] = useState(0)
		select = setSelectedIndex
		return <CommentsPane {...props} selectedIndex={selectedIndex} />
	}
	const setup = await testRender(<Harness />, { width: 50, height: 12 })
	try {
		await settle(setup)
		expect(setup.captureCharFrame()).toContain("alice")
		await act(async () => select(1))
		await settle(setup)
		expect(setup.captureCharFrame()).toContain("+ Add new comment")
		await act(async () => select(0))
		await settle(setup)
		expect(setup.captureCharFrame()).toContain("alice")
	} finally {
		await act(async () => setup.renderer.destroy())
	}
})
