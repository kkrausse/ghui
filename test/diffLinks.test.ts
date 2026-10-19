import { describe, expect, test } from "bun:test"
import type { StackedDiffCommentAnchor } from "../src/ui/diff.js"
import { diffCommentRangeSelection } from "../src/ui/diff/comments.js"
import { diffLineUrl } from "../src/ui/diff/links.js"

const anchor = (line: number, side: "LEFT" | "RIGHT" = "RIGHT"): StackedDiffCommentAnchor => ({
	path: "src/App.tsx",
	line,
	side,
	kind: "context",
	renderLine: line,
	colorLine: line,
	text: "example",
	fileIndex: 0,
	localRenderLine: line,
})

const base = "https://github.com/kkrausse/ghui/pull/1/files#diff-26ad4b834941d9b19ebf9db8082bd202aaf72ea0ddea85f5a8a0cb3c729cc6f2"

describe("diff line links", () => {
	test("matches GitHub's Files changed anchor for a new-side line", () => {
		expect(diffLineUrl("https://github.com/kkrausse/ghui/pull/1", anchor(438))).toBe(`${base}R438`)
	})

	test("links to old-side lines and normalized ranges in either navigation direction", () => {
		const range = diffCommentRangeSelection(anchor(442, "LEFT"), anchor(438, "LEFT"))
		expect(diffLineUrl("https://github.com/kkrausse/ghui/pull/1", anchor(438, "LEFT"), range)).toBe(`${base}L438-L442`)
		expect(diffLineUrl("https://github.com/kkrausse/ghui/pull/1", anchor(438, "LEFT"))).toBe(`${base}L438`)
	})

	test("a range from a removed line to an added line keeps each side", () => {
		const range = { start: { line: 437, side: "LEFT" as const }, end: { line: 438, side: "RIGHT" as const } }
		expect(diffLineUrl("https://github.com/kkrausse/ghui/pull/1", anchor(438), range)).toBe(`${base}L437-R438`)
	})

	test("a one-line range produces a single-line link", () => {
		expect(diffLineUrl("https://github.com/kkrausse/ghui/pull/1", anchor(438), diffCommentRangeSelection(anchor(438), anchor(438)))).toBe(`${base}R438`)
	})
})
