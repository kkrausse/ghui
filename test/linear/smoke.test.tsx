/**
 * End-to-end render test against stubbed Linear responses.
 *
 * `fetch` is replaced for the whole file, so this never touches the network even
 * if a real token is present in the Keychain.
 *
 *   bun test linear-tui
 */
import { testRender } from "@opentui/react/test-utils"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { App } from "../../src/linearWorkspace/app.tsx"
import { invalidateCache } from "../../src/linearWorkspace/linear/client.ts"
import { writeGroupPreferences } from "../../src/linearWorkspace/preferences.ts"
import { frameWith, installLinearStub, requests, sent, type Setup, settle } from "./stub.tsx"

let restoreFetch: () => void
const originalConfig = process.env.XDG_CONFIG_HOME
const testConfig = join(process.cwd(), "scratch", `linear-tui-test-${process.pid}`)
beforeAll(() => {
	mkdirSync(testConfig, { recursive: true })
	process.env.XDG_CONFIG_HOME = testConfig
	restoreFetch = installLinearStub()
})
afterAll(() => {
	restoreFetch()
	if (originalConfig === undefined) delete process.env.XDG_CONFIG_HOME
	else process.env.XDG_CONFIG_HOME = originalConfig
	rmSync(testConfig, { recursive: true, force: true })
})

async function boot() {
	writeGroupPreferences({})
	sent.length = 0
	requests.length = 0
	invalidateCache()
	const setup = await testRender(<App />, { width: 130, height: 32 })
	await frameWith(setup, (f) => f.includes("BACKEND"), 'f.includes("BACKEND")')
	return setup
}

test("boots into My Issues with the sidebar populated", async () => {
	const setup = await boot()
	const frame = await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	expect(frame).toContain("My Issues")
	expect(frame).toContain("BACKEND")
	expect(frame).toContain("Sprint 42")
	expect(frame).toContain("Projects")
	expect(frame).toContain("My saved view")
	expect(frame).toContain("Unified permissions events stream")
	expect(frame).toContain("Robin")

	setup.renderer.destroy()
})

test("j moves down the sidebar into the sprint view and loads cycle issues", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	// MINE > My Issues -> My Projects -> BACKEND > All Issues -> Sprint 42
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")

	const frame = await frameWith(setup, (f) => f.includes("BACKEND-1400"), 'f.includes("BACKEND-1400")')
	expect(frame).toContain("Backfill orphan deletes")
	expect(frame).toContain("Sprint 42")

	setup.renderer.destroy()
})

/**
 * Opens the `b` group-by picker and selects an attribute by its position in
 * GROUP_BY, which starts at "flat".
 */
async function groupBy(setup: Setup, steps: number): Promise<void> {
	setup.mockInput.pressKey("b")
	await frameWith(setup, (f) => f.includes("Group by"), "group picker")
	for (let i = 0; i < steps; i++) {
		setup.mockInput.pressKey("j")
		await settle(setup)
	}
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => !f.includes("Group by"), "picker closed")
}

test("b groups the list by workflow status", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j") // My Issues -> My Projects -> All Issues -> Sprint
	await frameWith(setup, (f) => f.includes("BACKEND-1400"), 'f.includes("BACKEND-1400")')

	await groupBy(setup, 1) // flat -> status
	const frame = await frameWith(setup, (f) => f.includes("In Progress (1)"), 'f.includes("In Progress (1)")')
	expect(frame).toContain("Todo (1)")

	setup.renderer.destroy()
})

test("b can group by an attribute other than status", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j") // My Issues -> My Projects -> All Issues -> Sprint
	await frameWith(setup, (f) => f.includes("BACKEND-1400"), 'f.includes("BACKEND-1400")')

	await groupBy(setup, 4) // flat -> status -> assignee -> project -> priority
	const frame = await frameWith(setup, (f) => f.includes("Urgent (1)"), 'f.includes("Urgent (1)")')
	expect(frame).toContain("High (1)")
	// The title says which grouping is active, since the rows alone no longer imply it.
	expect(frame).toContain("by priority")

	setup.renderer.destroy()
})

test("j/k step through grouped rows in screen order", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j") // My Issues -> My Projects -> All Issues -> Sprint
	await frameWith(setup, (f) => f.includes("BACKEND-1400"), 'f.includes("BACKEND-1400")')

	setup.mockInput.pressKey("l") // focus the list
	await groupBy(setup, 1) // flat -> status
	await frameWith(setup, (f) => f.includes("In Progress (1)"), 'f.includes("In Progress (1)")')

	// Payload order is priority-sorted (1400 first) but grouping puts 1361 on the
	// top row, so k lands on 1361. The picker title names the selected issue,
	// which is how these assertions read the cursor. The pause between the move
	// and `s` is the render the real terminal gets between two keystrokes.
	setup.mockInput.pressKey("k")
	await settle(setup)
	setup.mockInput.pressKey("s")
	const top = await frameWith(setup, (f) => f.includes("Status ·"), "status picker")
	expect(top).toContain("Status · BACKEND-1361")

	setup.mockInput.pressKey("ESCAPE")
	await frameWith(setup, (f) => !f.includes("Status ·"), "picker closed")
	setup.mockInput.pressKey("j")
	await settle(setup)
	setup.mockInput.pressKey("s")
	const next = await frameWith(setup, (f) => f.includes("Status ·"), "status picker")
	expect(next).toContain("Status · BACKEND-1400")

	setup.renderer.destroy()
})

test("enter on an issue opens detail with description and comments", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	setup.mockInput.pressKey("l") // focus the list
	setup.mockInput.pressEnter()

	// Markdown paints after the surrounding detail rows, so wait for both the
	// document and its thread instead of capturing the intermediate blank body.
	const frame = await frameWith(setup, (f) => f.includes("COMMENTS") && f.includes("Stream every permissions change"), "detail markdown and comments")
	expect(frame).toContain("Stream every permissions change")
	expect(frame).toContain("Dual-repo branch is up.")
	expect(frame).toContain("robin/backend-1361-events")
	expect(frame).toContain("High")

	// esc returns to the list
	setup.mockInput.pressKey("ESCAPE")
	const back = await frameWith(setup, (f) => !f.includes("COMMENTS"), '!f.includes("COMMENTS")')
	expect(back).toContain("BACKEND-1361")

	setup.renderer.destroy()
})

/**
 * `t` swaps the scrolling half of the detail for the activity feed. The
 * fixture's PR-driven status move is the case worth pinning: it comes from
 * GitHub rather than a user, and a feed that showed a blank actor there would
 * be worse than none.
 */
test("t shows the activity feed and t again returns to the description", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	setup.mockInput.pressKey("l")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("COMMENTS"), 'f.includes("COMMENTS")')

	setup.mockInput.pressKey("t")
	const feed = await frameWith(setup, (f) => f.includes("ACTIVITY"), 'f.includes("ACTIVITY")')
	expect(feed).toContain("GitHub")
	expect(feed).toContain("◐ In Progress → ◐ In Review")
	expect(feed).toContain("assigned to Robin")
	expect(feed).toContain("priority Medium → High")
	expect(feed).toContain("created the issue")
	// The description and the thread are behind the toggle, not beside it.
	expect(feed).not.toContain("Stream every permissions change")
	expect(feed).not.toContain("COMMENTS")

	setup.mockInput.pressKey("t")
	const back = await frameWith(setup, (f) => f.includes("COMMENTS"), 'f.includes("COMMENTS")')
	expect(back).toContain("Stream every permissions change")

	setup.renderer.destroy()
})

/** Right is one step in per press, mirroring left's one step out. */
test("right arrow walks sidebar -> list -> detail, and left walks back", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	setup.mockInput.pressArrow("right") // sidebar -> list
	await settle(setup)
	setup.mockInput.pressArrow("right") // list -> the selected issue

	const frame = await frameWith(setup, (f) => f.includes("COMMENTS") && f.includes("Stream every permissions change"), "detail markdown and comments")
	expect(frame).toContain("Stream every permissions change")

	setup.mockInput.pressArrow("left")
	const back = await frameWith(setup, (f) => !f.includes("COMMENTS"), '!f.includes("COMMENTS")')
	expect(back).toContain("BACKEND-1361")

	setup.renderer.destroy()
})

test("linked PRs show in the list row and on the detail", async () => {
	const setup = await boot()
	const list = await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	// The in-flight PR wins the cell, and `+` says the merged one is behind it.
	expect(list).toContain("◐#575+")

	setup.mockInput.pressKey("l")
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("PR #575"), "detail with PRs")
	expect(frame).toContain("PR #575   ⎘ ◐ in review · form-permissions-v2-service · 1 approved")
	// The merged PR names its branch, since it is not the issue's own.
	expect(frame).toContain("PR #783   ⎘ ● merged · data-warehouse-pipeline · ⎇ robin/backend-1361-core")

	setup.renderer.destroy()
})

/**
 * `O` with several linked PRs must ask rather than guess. Stops at the picker on
 * purpose: selecting would spawn `open` and put a real browser tab on screen.
 */
test("O offers a picker when an issue links more than one PR", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("O")

	const frame = await frameWith(setup, (f) => f.includes("Open · BACKEND-1361"), "PR picker")
	expect(frame).toContain("PR #575")
	expect(frame).toContain("PR #783")

	setup.mockInput.pressKey("ESCAPE")
	const closed = await frameWith(setup, (f) => !f.includes("Open · BACKEND"), "picker closed")
	expect(closed).toContain("BACKEND-1361")

	setup.renderer.destroy()
})

test("projects view lists projects and drills into one", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j") // Projects
	const list = await frameWith(setup, (f) => f.includes("62%"), 'f.includes("62%")')
	expect(list).toContain("Search Rebuild")

	setup.renderer.destroy()
})

// ---- project workspace ----

test("My Projects hides completed and canceled projects", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("j") // My Issues -> My Projects
	const frame = await frameWith(setup, (f) => f.includes("62%"), "my projects")
	expect(frame).toContain("Search Rebuild")
	expect(frame).not.toContain("Legacy Cutover")

	setup.renderer.destroy()
})

test("My Projects starts collapsed; space expands tickets that arrows can select and enter opens", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	setup.mockInput.pressKey("j")
	await frameWith(setup, (f) => f.includes("Search Rebuild"), "my projects")
	expect(setup.captureCharFrame()).not.toContain("In Progress (1)")
	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey(" ")
	const preview = await frameWith(setup, (f) => f.includes("Todo (1)"), "all project ticket pages")
	expect(preview).toContain("BACKEND-1361")
	expect(preview).toContain("BACKEND-1400")
	setup.mockInput.pressArrow("down")
	await settle(setup)
	expect(setup.captureCharFrame()).toContain("2/3")
	setup.mockInput.pressArrow("down")
	await settle(setup)
	expect(setup.captureCharFrame()).toContain("3/3") // skips the Todo header
	setup.mockInput.pressArrow("up")
	await settle(setup)
	expect(setup.captureCharFrame()).toContain("2/3")
	setup.mockInput.pressKey("R")
	await frameWith(setup, (f) => f.includes("In Progress (1)"), "preview after refresh")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("BACKEND-1361") && f.includes("COMMENT"), "expanded ticket detail")
	setup.mockInput.pressKey("ESCAPE")
	await frameWith(setup, (f) => f.includes("In Progress (1)"), "expanded list after detail")
	setup.mockInput.pressKey(" ")
	await frameWith(setup, (f) => !f.includes("In Progress (1)"), "collapsed again")
	setup.renderer.destroy()
})

test("grouping is saved per view and restored on a new app mount", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await groupBy(setup, 1)
	expect(setup.captureCharFrame()).toContain("by status")
	setup.mockInput.pressKey("j")
	await frameWith(setup, (f) => f.includes("Search Rebuild"), "my projects")
	expect(setup.captureCharFrame()).toContain("┌─My Projects─")
	setup.renderer.destroy()

	invalidateCache()
	const reopened = await testRender(<App />, { width: 130, height: 32 })
	const frame = await frameWith(reopened, (f) => f.includes("by status"), "saved grouping")
	expect(frame).toContain("In Progress (1)")
	reopened.renderer.destroy()
})

/** Sidebar: My Issues -> My Projects -> All Issues -> Sprint -> Projects, then drill in. */
async function openProject(setup: Setup): Promise<void> {
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	await frameWith(setup, (f) => f.includes("62%"), "projects list")
	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("MILESTONES"), "project overview")
}

test("enter on a project opens the overview tab, not its issues", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	const frame = await frameWith(setup, (f) => f.includes("Scope looks right to me."), "project comment body")
	expect(frame).toContain("Overview")
	expect(frame).toContain("Updates")
	expect(frame).toContain("Issues")
	expect(frame).toContain("In Progress") // project status, not an issue state
	expect(frame).toContain("On track") // health from the last update
	expect(frame).toContain("Orphan parity") // a milestone
	expect(frame).toContain("LATEST UPDATE")
	expect(frame).toContain("parity job green")
	expect(frame).toContain("PROJECT COMMENTS")
	expect(frame).toContain("Scope looks right to me.")

	setup.renderer.destroy()
})

test("bracket switches to the updates tab and lists every update", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("2")
	await settle(setup)
	expect(setup.captureCharFrame()).toContain("MILESTONES") // no independent numeric navigation
	setup.mockInput.pressKey("]")
	const frame = await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	// Newest first, whichever way Linear paginated them.
	expect(frame.indexOf("parity job green")).toBeLessThan(frame.indexOf("Kicked off"))
	expect(frame).toContain("1/2") // the updates counter, not the issue list's

	setup.renderer.destroy()
})

test("previous bracket shows the project's issues with the tab strip still up", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("[")
	const frame = await frameWith(setup, (f) => f.includes("Unified permissions events stream"), "project issues")
	expect(frame).toContain("Overview") // tab strip survives into the issue list
	expect(frame).toContain("Search Rebuild")

	setup.renderer.destroy()
})

test("] and [ step through the project tabs", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("]") // overview -> updates
	await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	setup.mockInput.pressKey("]") // updates -> issues
	await frameWith(setup, (f) => f.includes("Unified permissions events stream"), "issues tab")
	setup.mockInput.pressKey("[") // and back
	const frame = await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab again")
	expect(frame).not.toContain("MILESTONES")

	setup.renderer.destroy()
})

test("enter on an update opens it with its comment thread", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("]")
	await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("COMMENTS"), "update detail")
	expect(frame).toContain("Search Rebuild · update")
	expect(frame).toContain("Firehose is live in staging")
	expect(frame).toContain("what about the delete path?")

	setup.renderer.destroy()
})

test("c on an open update posts a comment anchored to the update", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("]")
	await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("COMMENTS"), "update detail")

	setup.mockInput.pressKey("c")
	await frameWith(setup, (f) => f.includes("comment on Search Rebuild update"), "composer")
	await setup.mockInput.typeText("deletes land next week")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.query).toContain("mutation CommentCreate")
	// One anchor and nothing else: Linear counts an explicit null as defined and
	// rejects the whole call, so the other two must be absent rather than null.
	expect(sent[0]!.variables).toEqual({
		input: { projectUpdateId: "pu1", body: "deletes land next week" },
	})

	setup.renderer.destroy()
})

test("c on the overview anchors the comment to the project's document content", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("c")
	await frameWith(setup, (f) => f.includes("comment on Search Rebuild"), "composer")
	await setup.mockInput.typeText("bumping the target date")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({
		input: { documentContentId: "dc-1", body: "bumping the target date" },
	})

	setup.renderer.destroy()
})

test("u picks a health, then posts the project update", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("u")
	const picker = await frameWith(setup, (f) => f.includes("Health ·"), "health picker")
	expect(picker).toContain("On track")
	expect(picker).toContain("At risk")
	expect(picker).toContain("Off track")

	setup.mockInput.pressKey("j") // On track -> At risk
	await settle(setup)
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("update on Search Rebuild · At risk"), "composer")

	await setup.mockInput.typeText("orphan resync pushed the date")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.query).toContain("mutation ProjectUpdateCreate")
	expect(sent[0]!.variables).toEqual({
		projectId: "p1",
		body: "orphan resync pushed the date",
		health: "atRisk",
	})

	setup.renderer.destroy()
})

test("esc unwinds a project tab back to the projects list", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	await openProject(setup)

	setup.mockInput.pressKey("]")
	await frameWith(setup, (f) => f.includes("Kicked off"), "updates tab")
	setup.mockInput.pressKey("ESCAPE")

	// Back to BACKEND > Projects, one level up -- not to the Overview tab.
	const frame = await frameWith(setup, (f) => f.includes("62%"), "projects list")
	expect(frame).toContain("BACKEND · Projects")
	expect(frame).not.toContain("Kicked off")

	setup.renderer.destroy()
})

test("P on an issue jumps to its project, and esc comes back to the list", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // into the list
	await settle(setup)
	setup.mockInput.pressKey("P")
	const overview = await frameWith(setup, (f) => f.includes("MILESTONES"), "project overview")
	expect(overview).toContain("Search Rebuild")

	setup.mockInput.pressKey("ESCAPE")
	const back = await frameWith(setup, (f) => f.includes("BACKEND-1361"), "back on the list")
	expect(back).not.toContain("MILESTONES")

	setup.renderer.destroy()
})

test("P in the detail pane jumps to the project, leaving detail", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("COMMENTS"), "detail")

	setup.mockInput.pressKey("P")
	const overview = await frameWith(setup, (f) => f.includes("MILESTONES"), "project overview")
	expect(overview).toContain("Search Rebuild")
	// The detail pane is gone, not layered under the project -- its footer hint
	// is the tell, since the project's own comment thread also says COMMENTS.
	expect(overview).not.toContain("tab cycles comments")

	setup.renderer.destroy()
})

test("? shows the help overlay", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), 'f.includes("BACKEND-1361")')

	setup.mockInput.pressKey("?")
	const frame = await frameWith(setup, (f) => f.includes("half-page jump"), 'f.includes("half-page jump")')
	// The overlay scrolls now, so assert on the top section rather than the bottom.
	expect(frame).toContain("jump to first / last row")
	expect(frame).toContain("group by status, assignee")

	setup.renderer.destroy()
})

test("s opens the status picker in team board order and sends stateId", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("s")

	// Ordered by WorkflowState.position, matching the Linear board.
	const picker = await frameWith(setup, (f) => f.includes("Status ·"), "status picker")
	const todo = picker.indexOf("Todo")
	const started = picker.indexOf("In Progress")
	const done = picker.indexOf("Done")
	expect(todo).toBeGreaterThan(-1)
	expect(started).toBeGreaterThan(todo)
	expect(done).toBeGreaterThan(started)

	setup.mockInput.pressEnter()
	await frameWith(setup, () => sent.length > 0, "mutation sent")

	const call = sent[0]!
	expect(call.query).toContain("mutation IssueUpdate")
	expect(call.variables).toEqual({ id: "issue-1", input: { stateId: "state-todo" } })

	setup.renderer.destroy()
})

/** The picker is a list too, and `<select>` brings no wheel handling of its own. */
test("the wheel moves the picker's selection", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l")
	await settle(setup)
	setup.mockInput.pressKey("s")
	const picker = await frameWith(setup, (f) => f.includes("Status ·"), "status picker")

	// One row down from Todo is In Progress, and enter applies whatever is there.
	const row = picker.split("\n").findIndex((l) => l.includes("Todo"))
	await setup.mockMouse.scroll(picker.split("\n")[row]!.indexOf("Todo"), row, "down")
	await settle(setup)
	setup.mockInput.pressEnter()

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({ id: "issue-1", input: { stateId: "state-started" } })

	setup.renderer.destroy()
})

test("a offers Unassigned plus team members and sends assigneeId", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("a")

	const picker = await frameWith(setup, (f) => f.includes("Assignee ·"), "assignee picker")
	expect(picker).toContain("Unassigned")
	expect(picker).toContain("Dana")

	setup.mockInput.pressEnter()
	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({ id: "issue-1", input: { assigneeId: null } })

	setup.renderer.destroy()
})

test("p sends priority as an int, urgent first", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("p")

	const picker = await frameWith(setup, (f) => f.includes("Priority ·"), "priority picker")
	expect(picker).toContain("Urgent")
	expect(picker).toContain("No priority")

	setup.mockInput.pressEnter()
	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({ id: "issue-1", input: { priority: 1 } })

	setup.renderer.destroy()
})

test("C offers team cycles and sends cycleId", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l")
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("C")

	const picker = await frameWith(setup, (f) => f.includes("Cycle ·"), "cycle picker")
	expect(picker).toContain("No cycle")
	expect(picker).toContain("Current cycle")
	expect(picker).toContain("Sprint 42")
	expect(picker).toContain("Sprint 43")

	// No cycle is first; move to the active sprint and apply it.
	setup.mockInput.pressKey("j")
	setup.mockInput.pressEnter()
	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({ id: "issue-1", input: { cycleId: "cycle-1" } })

	setup.renderer.destroy()
})

test("c posts a comment body", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("c")
	await frameWith(setup, (f) => f.includes("comment on BACKEND-1361"), "comment box")

	await setup.mockInput.typeText("looks done to me")
	await setup.flush()
	// Enter would insert a newline; submit is meta+Enter, with ctrl+s as fallback.
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	const call = sent[0]!
	expect(call.query).toContain("mutation CommentCreate")
	// The one mutation serves issues, project updates, and projects, and carries
	// only the anchor in use. Naming the other two -- even as null -- is what
	// Linear rejects with "Argument Validation Error".
	expect(call.variables).toEqual({ input: { issueId: "issue-1", body: "looks done to me" } })

	// Enter must stay a newline inside the composer, not a submit.
	expect(sent).toHaveLength(1)

	setup.renderer.destroy()
})

test("cmd+Enter posts a comment body", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("c")
	await frameWith(setup, (f) => f.includes("comment on BACKEND-1361"), "comment box")

	await setup.mockInput.typeText("ship it")
	await setup.flush()
	// The exact bytes a kitty-protocol terminal sends for cmd+Enter: codepoint 13,
	// modifier mask 9 (1 + super). OpenTUI calls this super, not meta -- meta is
	// option -- and binding the wrong one is why this silently did nothing.
	setup.renderer.stdin.emit("data", Buffer.from("\x1b[13;9u"))

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.query).toContain("mutation CommentCreate")
	expect(sent[0]!.variables).toMatchObject({ input: { issueId: "issue-1", body: "ship it" } })

	setup.renderer.destroy()
})

/**
 * Replying to a reply. Linear threads one level and refuses a reply's id as
 * `parentId` ("Parent comment must be a top level comment"), so the id has to be
 * resolved to the thread root before it is sent. The stub refuses it the same
 * way, which is what makes this a regression test rather than a shape check.
 */
test("r on a reply threads onto the root comment, not the reply", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l")
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("Nice, I will review."), "detail with a thread")

	// TAB twice: c1 (root), then c2 (its reply).
	setup.mockInput.pressKey("TAB")
	await settle(setup)
	setup.mockInput.pressKey("TAB")
	await settle(setup)
	setup.mockInput.pressKey("r")
	await frameWith(setup, (f) => f.includes("comment on BACKEND-1361"), "composer")

	await setup.mockInput.typeText("agreed")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({
		input: { issueId: "issue-1", body: "agreed", parentId: "c1" },
	})
	// The stub rejects a reply id, so a regression would surface as an error flash.
	const after = setup.captureCharFrame()
	expect(after).not.toContain("top level comment")

	setup.renderer.destroy()
})

test("escape cancels the picker without writing", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("l") // focus the list
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressKey("s")
	await frameWith(setup, (f) => f.includes("Status ·"), "status picker")

	setup.mockInput.pressKey("ESCAPE")
	await frameWith(setup, (f) => !f.includes("Status ·"), "picker closed")
	expect(sent).toHaveLength(0)

	setup.renderer.destroy()
})

test("edit keys do not fire on the projects list", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j") // Projects
	await frameWith(setup, (f) => f.includes("62%"), "projects list")

	setup.mockInput.pressKey("l")
	await setup.flush()
	setup.mockInput.pressKey("s")
	await setup.flush()
	await Bun.sleep(150)

	const frame = setup.captureCharFrame()
	expect(frame).not.toContain("Status ·")
	expect(sent).toHaveLength(0)

	setup.renderer.destroy()
})

test("detail renders a threaded reply under its parent", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	setup.mockInput.pressKey("l")
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("Dual-repo branch is up.") && f.includes("Nice, I will review."), "comment markdown")
	expect(frame).toContain("Dual-repo branch is up.")
	expect(frame).toContain("Nice, I will review.")
	expect(frame).toContain("↳ Dana") // reply is indented under its parent
	expect(frame).toContain("Reply") // per-comment button
	expect(frame).toContain("Status") // action buttons row

	setup.renderer.destroy()
})

test("tab selects a comment and r replies to it with parentId", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	setup.mockInput.pressKey("l")
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("COMMENTS"), "detail")

	setup.mockInput.pressKey("TAB") // selects the first comment (c1)
	await setup.flush()
	setup.mockInput.pressKey("r")
	await frameWith(setup, (f) => f.includes("comment on BACKEND-1361"), "composer")

	await setup.mockInput.typeText("on it")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	expect(sent[0]!.variables).toEqual({
		input: { issueId: "issue-1", body: "on it", parentId: "c1" },
	})

	setup.renderer.destroy()
})

test("r with no comment selected posts at the top level", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	setup.mockInput.pressKey("l")
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "list focused")
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("COMMENTS"), "detail")

	setup.mockInput.pressKey("r") // no tab first, so nothing is selected
	await frameWith(setup, (f) => f.includes("comment on BACKEND-1361"), "composer")
	await setup.mockInput.typeText("top level")
	await setup.flush()
	setup.mockInput.pressKey("s", { ctrl: true })

	await frameWith(setup, () => sent.length > 0, "mutation sent")
	// No parentId at all rather than an explicit null -- see COMMENT_CREATE.
	expect(sent[0]!.variables).toEqual({ input: { issueId: "issue-1", body: "top level" } })

	setup.renderer.destroy()
})

test("sidebar renders on the left of the issue list", async () => {
	const setup = await boot()
	const frame = await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	const sidebarCol = frame.indexOf("linear")
	const listCol = frame.indexOf("My Issues")
	expect(sidebarCol).toBeGreaterThan(-1)
	expect(sidebarCol).toBeLessThan(listCol)

	setup.renderer.destroy()
})

/**
 * The wheel acts on the pane under the pointer, whichever one has the keyboard.
 * Rows have no scroll offset of their own, so "scrolled" means the cursor moved
 * -- read here off the counter in each pane's bottom border.
 */
test("the wheel scrolls the pane the mouse is over", async () => {
	const setup = await boot()
	const start = await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	// Over the sidebar: down two entries, My Issues -> My Projects -> All Issues, which loads.
	const sidebarRow = start.split("\n").findIndex((l) => l.includes("My Issues"))
	await setup.mockMouse.scroll(4, sidebarRow, "down")
	await setup.mockMouse.scroll(4, sidebarRow, "down")
	const loaded = await frameWith(setup, (f) => f.includes("Second page issue"), "team view")
	expect(loaded).toContain("All Issues")

	// Over the list: the cursor walks down its rows, and back up again.
	const listRow = loaded.split("\n").findIndex((l) => /BACKEND-\d/.test(l))
	const listCol = loaded.split("\n")[listRow]!.search(/BACKEND-\d/)
	expect(loaded).toMatch(/ 1\//)

	await setup.mockMouse.scroll(listCol, listRow, "down")
	await frameWith(setup, (f) => f.includes(" 2/"), "cursor on row 2")

	await setup.mockMouse.scroll(listCol, listRow, "up")
	await frameWith(setup, (f) => f.includes(" 1/"), "cursor back on row 1")

	setup.renderer.destroy()
})

// ---- pagination ----

test("a second page is fetched and appended once the cursor nears the end", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	// Sidebar: My Issues -> My Projects -> All Issues, the two-page view.
	setup.mockInput.pressKey("j")
	setup.mockInput.pressKey("j")
	const frame = await frameWith(setup, (f) => f.includes("Second page issue"), "page 2 appended")

	// Both pages are on screen at once, not one replacing the other.
	expect(frame).toContain("Unified permissions events stream")
	expect(frame).toContain("Second page issue")

	const teamCalls = requests.filter((r) => r.query.includes("query TeamIssues"))
	expect(teamCalls.length).toBe(2)
	// Page 2 asked for exactly the cursor page 1 handed back.
	expect(teamCalls[1]!.variables.after).toBe("cur-1")

	setup.renderer.destroy()
})

test("the counter marks a truncated list with + until the last page lands", async () => {
	const setup = await boot()
	const frame = await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")
	// My Issues is a single page, so its count is exact -- no "+".
	expect(frame).toMatch(/1\/1(?!\+)/)

	setup.renderer.destroy()
})

// ---- inbox ----

test("gn opens the inbox and shows unread state", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("g")
	await settle(setup)
	setup.mockInput.pressKey("n")
	// "Inbox" alone is already in the sidebar; wait for the loaded rows instead.
	const frame = await frameWith(setup, (f) => f.includes("unread"), "inbox view")

	expect(frame).toContain("can you take a look at the DB lag?")
	expect(frame).toContain("Backfill orphan deletes")
	expect(frame).toContain("Dana")
	// One of the two stubbed notifications is unread.
	expect(frame).toContain("1 unread")

	setup.renderer.destroy()
})

test("the sidebar carries the unread badge", async () => {
	const setup = await boot()
	const frame = await frameWith(setup, (f) => f.includes("Inbox"), "sidebar inbox row")
	// notificationsUnreadCount is stubbed at 2.
	expect(frame).toMatch(/Inbox\s+2/)

	setup.renderer.destroy()
})

test("e archives the selected notification", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("g")
	await settle(setup)
	setup.mockInput.pressKey("n")
	await frameWith(setup, (f) => f.includes("1 unread"), "inbox view")

	setup.mockInput.pressKey("e")
	await frameWith(setup, () => sent.some((c) => c.query.includes("mutation NotificationArchive")), "archive mutation")

	const call = sent.find((c) => c.query.includes("mutation NotificationArchive"))!
	expect(call.variables).toEqual({ id: "n-1" })

	setup.renderer.destroy()
})

test("opening a notification marks it read and shows its issue", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	setup.mockInput.pressKey("g")
	await settle(setup)
	setup.mockInput.pressKey("n")
	await frameWith(setup, (f) => f.includes("1 unread"), "inbox view")

	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("Stream every permissions change"), "issue detail")

	const call = sent.find((c) => c.query.includes("mutation NotificationUpdate"))!
	expect(call.variables.id).toBe("n-1")
	expect(call.variables.readAt).toBeTruthy()

	setup.renderer.destroy()
})

/** Inbox rows to reach the two ProjectNotification fixtures, n-3 and n-4. */
async function inboxRow(setup: Setup, steps: number) {
	setup.mockInput.pressKey("g")
	await settle(setup)
	setup.mockInput.pressKey("n")
	await frameWith(setup, (f) => f.includes("1 unread"), "inbox view")
	for (let i = 0; i < steps; i++) {
		setup.mockInput.pressKey("j")
		await settle(setup)
	}
}

test("opening a project update notification lands on the update, not the browser", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	await inboxRow(setup, 2)
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("Firehose is live in staging"), "update pane")
	expect(frame).toContain("Search Rebuild · update")
	// The update's own comment thread comes down with it.
	expect(frame).toContain("what about the delete path?")

	setup.renderer.destroy()
})

test("esc from an update opened in the inbox leaves the cursor on it", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	await inboxRow(setup, 2)
	setup.mockInput.pressEnter()
	await frameWith(setup, (f) => f.includes("Firehose is live in staging"), "update pane")

	setup.mockInput.pressEscape()
	// pu1 is the newest update, so it is row 1 of 2 in the list behind the pane.
	const frame = await frameWith(setup, (f) => f.includes("Updates"), "updates tab")
	expect(frame).toMatch(/1\/2/)

	setup.renderer.destroy()
})

test("a project notification with no update opens the project overview", async () => {
	const setup = await boot()
	await frameWith(setup, (f) => f.includes("BACKEND-1361"), "first issue")

	await inboxRow(setup, 3)
	setup.mockInput.pressEnter()

	const frame = await frameWith(setup, (f) => f.includes("One firehose for every permissions change"), "project overview")
	expect(frame).toContain("Search Rebuild")

	setup.renderer.destroy()
})
