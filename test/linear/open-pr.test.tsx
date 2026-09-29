/**
 * What actually leaves the app for the OS: the URL handed to the browser, and the
 * text put on the clipboard.
 *
 * The other render tests stop at the picker on purpose -- selecting would spawn
 * `open` and put a real tab on screen. This file stubs `shell.ts` instead, so the
 * last hop is asserted rather than assumed.
 *
 *   bun test linear-tui/open-pr.test.tsx
 */
import { createMockMouse } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { invalidateCache } from "../../src/linearWorkspace/linear/client.ts"
import { frameWith, installLinearStub, settle } from "./stub.tsx"

/** Every URL the app tried to hand to the browser, in order. */
const opened: string[] = []
/** Everything it tried to put on the clipboard. */
const copied: string[] = []

// Same specifier app.tsx imports, so this replaces the module it already holds.
mock.module("../../src/linearWorkspace/shell.ts", () => ({
	copyToClipboard: async (text: string) => {
		copied.push(text)
	},
	openInBrowser: async (url: string) => {
		opened.push(url)
	},
}))

// Imported after the mock is registered.
const { App } = await import("../../src/linearWorkspace/app.tsx")

let restoreFetch: () => void
beforeAll(() => {
	restoreFetch = installLinearStub()
})
afterAll(() => {
	restoreFetch()
})

async function boot() {
	opened.length = 0
	copied.length = 0
	invalidateCache()
	const setup = await testRender(<App />, { width: 130, height: 32 })
	await frameWith(setup, (f) => f.includes("BACKEND"), "boot")
	return setup
}

test("O opens the only linked PR without asking", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	// MINE > My Issues -> My Projects -> BACKEND > All Issues -> Sprint 42, where
	// BACKEND-1400 carries exactly one PR. Moving the sidebar cursor loads the view.
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	await frameWith(setup, (f) => f.includes("BACKEND-1400"), "cycle issues")

	// BACKEND-1400 is Urgent, so priority sorting puts it on the top row.
	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("O")
	await settle(setup)

	expect(opened).toEqual(["https://github.com/acme/data-warehouse-pipeline/pull/801"])
	// No picker: a single PR is not a choice.
	expect(setup.captureCharFrame()).not.toContain("Open · BACKEND")

	setup.renderer.destroy()
}, 15000)

test("O on an issue with several PRs opens the one picked", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("O")
	await frameWith(setup, (f) => f.includes("Open · BACKEND-1361"), "PR picker")
	expect(opened).toEqual([]) // nothing opens until a row is chosen

	// The in-flight PR is the first row; step past it to prove the choice is read.
	setup.mockInput.pressKey("j")
	await settle(setup)
	setup.mockInput.pressEnter()
	await settle(setup)

	expect(opened).toEqual(["https://github.com/acme/data-warehouse-pipeline/pull/783"])
	// The picker closes back to the list it was opened from.
	expect(setup.captureCharFrame()).toContain("BACKEND-1361")

	setup.renderer.destroy()
}, 15000)

test("O says so when the issue has no linked PR", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	// Down to the saved view, whose issue is stubbed with no attachments. Five j
	// presses rather than `G`: shift+g arrives as name "g", so the go-prefix
	// branch swallows it and the jump never runs. Pre-existing, see IDEAS.md.
	for (let i = 0; i < 5; i++) {
		setup.mockInput.pressKey("j")
		await settle(setup)
	}
	await frameWith(setup, (f) => f.includes("My saved view") && !f.includes("◐#575"), "saved view")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("O")

	const frame = await frameWith(setup, (f) => f.includes("no linked pull request"), "flash")
	expect(frame).toContain("BACKEND-1361 has no linked pull request")
	expect(opened).toEqual([])

	setup.renderer.destroy()
}, 15000)

/**
 * The copy icon next to Reply. Its click must not reach the comment block
 * underneath -- that one selects the comment -- which is why Button stops
 * propagation.
 */
test("the copy icon on a comment copies its permalink", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	const frame = await frameWith(setup, (f) => f.includes("Dual-repo branch is up."), "detail")

	// Both buttons sit on the comment's byline row.
	const lines = frame.split("\n")
	const row = lines.findIndex((l) => l.includes("Reply r") && l.includes("⎘"))
	expect(row).toBeGreaterThan(-1)
	const column = lines[row]!.indexOf("⎘")

	const mouse = createMockMouse(setup.renderer)
	await mouse.pressDown(column, row)
	await settle(setup)

	expect(copied).toEqual(["https://linear.app/x#c1"])
	expect(opened).toEqual([]) // copying a link does not open it

	setup.renderer.destroy()
}, 15000)

/**
 * Dragging across text copies it, because the terminal cannot: mouse reporting
 * hands drags to the app, so its own highlight-and-copy selects nothing. OpenTUI
 * tracks the selection and emits once the drag ends.
 */
test("dragging across a comment copies the text", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	const frame = await frameWith(setup, (f) => f.includes("Dual-repo branch is up."), "detail")

	const lines = frame.split("\n")
	const row = lines.findIndex((l) => l.includes("Dual-repo branch is up."))
	const startX = lines[row]!.indexOf("Dual-repo")

	const mouse = createMockMouse(setup.renderer)
	await mouse.drag(startX, row, startX + "Dual-repo branch".length, row)
	await settle(setup)

	expect(copied).toHaveLength(1)
	expect(copied[0]).toContain("Dual-repo branch")

	setup.renderer.destroy()
}, 15000)

/**
 * `Y` copies the ticket's own URL, `y` still copies its branch. Shifted letters
 * arrive as the lowercase name, so the two bindings are one ordering mistake
 * apart -- which is why both halves are asserted here.
 */
test("Y copies the ticket link, y still copies the branch", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("Y")
	await settle(setup)
	expect(copied).toEqual(["https://linear.app/acme/issue/BACKEND-1361"])

	setup.mockInput.pressKey("y")
	await settle(setup)
	expect(copied[1]).toBe("robin/backend-1361-events")
	expect(opened).toEqual([]) // neither one opens anything

	setup.renderer.destroy()
}, 15000)

/** Inside a project `Y` copies what `o` would open: the project, then the selected update. */
test("Y in a project copies the project link, then the update's", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	// My Issues -> My Projects -> All Issues -> Sprint -> Projects, then drill in.
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	await frameWith(setup, (f) => f.includes("62%"), "projects list")
	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("MILESTONES"), "project overview")

	setup.mockInput.pressKey("Y")
	await settle(setup)
	expect(copied).toEqual(["https://linear.app/acme/project/search-rebuild"])

	setup.mockInput.pressKey("]")
	await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	setup.mockInput.pressKey("Y")
	await settle(setup)
	expect(copied[1]).toBe("https://linear.app/acme/project/search-rebuild#pu1")
	expect(opened).toEqual([])

	setup.renderer.destroy()
}, 15000)

/** The same ⎘ idiom in the detail pane's action row, for the ticket itself. */
test("the detail pane's copy icon copies the ticket link", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	const frame = await frameWith(setup, (f) => f.includes("Branch y"), "detail actions")

	// The action row's ⎘ is the last button on it, past "Open o".
	const lines = frame.split("\n")
	const row = lines.findIndex((l) => l.includes("Branch y") && l.includes("Open o"))
	const column = lines[row]!.indexOf("⎘")
	expect(column).toBeGreaterThan(lines[row]!.indexOf("Open o"))

	const mouse = createMockMouse(setup.renderer)
	await mouse.pressDown(column, row)
	await settle(setup)

	expect(copied).toEqual(["https://linear.app/acme/issue/BACKEND-1361"])

	setup.renderer.destroy()
}, 15000)

/**
 * Project rows in the inbox used to be a browser redirect: every notification
 * with no issue behind it fell through to `openInBrowser`. They open in the app
 * now, so nothing leaves it.
 */
test("a project update notification opens in the app, not the browser", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "my issues")

	setup.mockInput.pressKey("g")
	await settle(setup)
	setup.mockInput.pressKey("n")
	await frameWith(setup, (f) => f.includes("1 unread"), "inbox")

	// Past the two issue notifications, onto the project update.
	for (let i = 0; i < 2; i++) {
		setup.mockInput.pressKey("j")
		await settle(setup)
	}
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("Firehose is live in staging"), "update pane")

	expect(opened).toEqual([])

	setup.renderer.destroy()
}, 15000)
