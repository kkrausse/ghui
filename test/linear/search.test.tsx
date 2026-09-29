/**
 * Search is a scope, not a filter on the loaded view.
 *
 * The behaviour these pin down is the whole point of the redesign: with the
 * sidebar up beside search results, a highlighted "Sprint 42" read as "these are
 * the sprint's matches", which they never were -- `searchIssues` is workspace-wide.
 *
 *   bun test linear-tui/search.test.tsx
 */
import { testRender } from "@opentui/react/test-utils"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { App } from "../../src/linearWorkspace/app.tsx"
import { invalidateCache } from "../../src/linearWorkspace/linear/client.ts"
import { frameWith, installLinearStub, requests, settle } from "./stub.tsx"

let restoreFetch: () => void
beforeAll(() => {
	restoreFetch = installLinearStub()
})
afterAll(() => {
	restoreFetch()
})

async function boot() {
	requests.length = 0
	invalidateCache()
	const setup = await testRender(<App />, { width: 130, height: 32 })
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "boot")
	return setup
}

/** `/`, type, submit. Leaves the cursor on the results. */
async function search(setup: Awaited<ReturnType<typeof boot>>, term: string) {
	setup.mockInput.pressKey("/")
	await frameWith(setup, (f) => f.includes("text to search across every issue"), "query input")
	await setup.mockInput.typeText(term)
	await setup.flush()
	setup.mockInput.pressEnter()
	return frameWith(setup, (f) => f.includes("Found by search"), "results")
}

test("the query input takes the sidebar off the screen straight away", async () => {
	const setup = await boot()

	setup.mockInput.pressKey("/")
	const frame = await frameWith(setup, (f) => f.includes("text to search across every issue"), "query input")

	// Sidebar rows and the pane it was scoping are both gone.
	expect(frame).not.toContain("SAVED VIEWS")
	expect(frame).not.toContain("My saved view")
	expect(frame).not.toContain("Sprint 42")

	setup.renderer.destroy()
}, 15000)

test("results fill the width and the query stays on top", async () => {
	const setup = await boot()
	const frame = await search(setup, "aggregation")

	expect(frame).toContain("Found by search")
	expect(frame).not.toContain("SAVED VIEWS")
	// The query is above the rows, not in the status bar at the bottom.
	const lines = frame.split("\n")
	const queryRow = lines.findIndex((l) => l.includes("/ aggregation"))
	const resultRow = lines.findIndex((l) => l.includes("Found by search"))
	expect(queryRow).toBeGreaterThan(-1)
	expect(queryRow).toBeLessThan(resultRow)
	// And the title names the scope.
	expect(frame).toContain('Search · "aggregation"')

	setup.renderer.destroy()
}, 15000)

test("h does not escape the scope by reaching for a sidebar that is not there", async () => {
	const setup = await boot()
	await search(setup, "aggregation")

	setup.mockInput.pressKey("h")
	await settle(setup)
	setup.mockInput.pressKey("TAB")
	await settle(setup)

	const frame = setup.captureCharFrame()
	expect(frame).toContain("Found by search")
	expect(frame).not.toContain("SAVED VIEWS")

	setup.renderer.destroy()
}, 15000)

test("escape is the way out, and the view behind comes back without a request", async () => {
	const setup = await boot()
	await search(setup, "aggregation")

	const before = requests.length
	setup.mockInput.pressKey("ESCAPE")
	const frame = await frameWith(setup, (f) => f.includes("SAVED VIEWS"), "sidebar back")

	expect(frame).toContain("BACKEND-1361")
	expect(frame).not.toContain("Found by search")
	// The loaded view was kept, so leaving search refetches nothing.
	expect(requests.length).toBe(before)

	setup.renderer.destroy()
}, 15000)

test("/ reopens the query prefilled instead of starting from empty", async () => {
	const setup = await boot()
	await search(setup, "aggregation")

	setup.mockInput.pressKey("/")
	// Editing hides the hint the idle header shows, which is how the two tell apart.
	const frame = await frameWith(setup, (f) => f.includes("/ aggregation") && !f.includes("esc exit"), "prefilled input")
	// Still in the scope, with the previous rows underneath.
	expect(frame).toContain("Found by search")

	// The caret sits after the text, so typing extends the query instead of
	// prepending to it.
	await setup.mockInput.typeText(" gold")
	await setup.flush()
	expect(setup.captureCharFrame()).toContain("/ aggregation gold")

	setup.renderer.destroy()
}, 15000)

test("an empty query leaves search rather than showing nothing", async () => {
	const setup = await boot()
	await search(setup, "aggregation")

	setup.mockInput.pressKey("/")
	await frameWith(setup, (f) => f.includes("/ aggregation") && !f.includes("esc exit"), "input")
	// Clear the prefilled term, then submit.
	for (let i = 0; i < "aggregation".length; i++) {
		setup.mockInput.pressKey("BACKSPACE")
	}
	await setup.flush()
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("SAVED VIEWS"), "back on the sidebar")
	expect(frame).not.toContain("Found by search")

	setup.renderer.destroy()
}, 15000)

test("editing a result keeps you in the scope", async () => {
	const setup = await boot()
	await search(setup, "aggregation")

	// Change the status of a result: the refresh afterwards used to drop the whole
	// search and drop you back on the sidebar's view.
	setup.mockInput.pressKey("s")
	await frameWith(setup, (f) => f.includes("Status ·"), "status picker")
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("Found by search"), "still searching")
	expect(frame).not.toContain("SAVED VIEWS")
	expect(frame).toContain('Search · "aggregation"')

	setup.renderer.destroy()
}, 15000)
