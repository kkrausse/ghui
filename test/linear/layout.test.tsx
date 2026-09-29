/**
 * Nothing may draw outside its own pane, at any terminal size.
 *
 * Panes are bordered, so anything that overflows shows up as a letter sitting
 * where a border glyph belongs -- that is the assertion here. It catches both
 * failure modes we have hit: rows wrapping to two lines and shoving their
 * neighbors around, and rows running straight through the right border into the
 * pane next door.
 *
 *   bun test linear-tui
 */
import { testRender } from "@opentui/react/test-utils"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { App } from "../../src/linearWorkspace/app.tsx"
import { invalidateCache } from "../../src/linearWorkspace/linear/client.ts"
import { frameWith, installLinearStub, type Setup, settle } from "./stub.tsx"

let restoreFetch: () => void
beforeAll(() => {
	restoreFetch = installLinearStub({ longContent: true })
})
afterAll(() => {
	restoreFetch()
})

const BORDER = new Set("┌┐└┘├┤┬┴┼─│")

/** Squares, letterboxes, and the wide-and-short shape this was first seen on. */
const SIZES = [
	{ width: 60, height: 14 },
	{ width: 80, height: 20 },
	{ width: 100, height: 12 },
	{ width: 130, height: 32 },
	{ width: 200, height: 24 },
	{ width: 240, height: 40 },
]

/**
 * Reports every cell where content has overwritten a pane border.
 *
 * The panes are discovered from the frame rather than hardcoded: the topmost
 * line holding `┌` gives each pane's left and right column, and those columns
 * must stay box-drawing down to the pane's bottom edge. A row that wraps or
 * overruns its pane lands a letter in one of them.
 */
function borderBreaks(frame: string): string[] {
	const lines = frame.split("\n").map((line) => [...line])
	const top = lines.findIndex((line) => line.includes("┌"))
	if (top < 0) return ["no bordered pane in frame"]

	const columns = lines[top]!.flatMap((c, i) => (c === "┌" || c === "┐" ? [i] : []))
	const bottom = lines.findIndex((line, i) => i > top && (line.includes("└") || line.includes("┘")))
	if (bottom < 0) return ["pane never closes"]

	const breaks: string[] = []
	for (const col of columns) {
		for (let row = top; row <= bottom; row += 1) {
			const char = lines[row]?.[col] ?? " "
			if (!BORDER.has(char)) breaks.push(`col ${col} row ${row}: ${JSON.stringify(char)}`)
		}
	}
	return breaks
}

/**
 * A wrapped row splits its identifier across two lines, leaving `BACKEND-`
 * trailing into whitespace. Clipping is fine -- `TAXPRO` at a pane edge is not
 * a wrap -- so only a broken-but-still-padded identifier counts.
 */
function wrappedIdentifiers(frame: string): string[] {
	return frame
		.split("\n")
		.flatMap((line) => line.match(/BACKEND-(?!\d)(?=.)/g) ?? [])
		.map((hit) => `identifier wrapped after ${JSON.stringify(hit)}`)
}

function expectIntact(setup: Setup, label: string) {
	const frame = setup.captureCharFrame()
	expect(borderBreaks(frame), `${label}\n${frame}`).toEqual([])
	expect(wrappedIdentifiers(frame), `${label}\n${frame}`).toEqual([])
}

async function boot(width: number, height: number): Promise<Setup> {
	invalidateCache()
	const setup = await testRender(<App />, { width, height })
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), `boot at ${width}x${height}`)
	return setup
}

async function press(setup: Setup, key: string): Promise<void> {
	setup.mockInput.pressKey(key)
	await settle(setup)
}

for (const { width, height } of SIZES) {
	test(`every view stays inside its pane at ${width}x${height}`, async () => {
		const setup = await boot(width, height)
		expectIntact(setup, `my issues at ${width}x${height}`)

		// Walk the whole sidebar and back. Each stop loads a different list --
		// issues, sprint, projects, inbox, saved view -- into the right pane.
		for (let step = 0; step < 8; step += 1) {
			await press(setup, "j")
			expectIntact(setup, `sidebar down ${step} at ${width}x${height}`)
		}
		for (let step = 0; step < 8; step += 1) {
			await press(setup, "k")
			expectIntact(setup, `sidebar up ${step} at ${width}x${height}`)
		}

		// Grouping inserts header lines between the issue rows.
		await press(setup, "b")
		expectIntact(setup, `grouped at ${width}x${height}`)
		await press(setup, "b")

		// Detail and help each take over the whole terminal.
		await press(setup, "l")
		setup.mockInput.pressEnter()
		await frameWith(setup, (f) => f.includes("Status  "), `detail at ${width}x${height}`)
		expectIntact(setup, `detail at ${width}x${height}`)

		// The status picker and the comment box are full-screen modals.
		await press(setup, "s")
		expect(setup.captureCharFrame()).toContain("In Progress")
		expectIntact(setup, `picker at ${width}x${height}`)
		setup.mockInput.pressEscape()
		await settle(setup)

		await press(setup, "c")
		expect(setup.captureCharFrame()).toContain("comment on")
		expectIntact(setup, `comment box at ${width}x${height}`)
		setup.mockInput.pressEscape()
		await settle(setup)

		setup.mockInput.pressEscape()
		await settle(setup)
		await press(setup, "?")
		expect(setup.captureCharFrame()).toContain("keys")
		expectIntact(setup, `help at ${width}x${height}`)

		setup.renderer.destroy()
	}, 30_000)
}

test("resizing mid-session leaves no pane broken", async () => {
	const setup = await boot(200, 30)

	for (const [width, height] of [
		[120, 30],
		[70, 16],
		[200, 40],
		[64, 12],
		[240, 20],
	] as const) {
		setup.resize(width, height)
		await frameWith(setup, (f) => f.includes("BACKEND"), `resize ${width}x${height}`)
		expectIntact(setup, `after resize to ${width}x${height}`)
	}

	setup.renderer.destroy()
}, 30_000)
