/**
 * The detail pane's metadata rows are fixed-height rows above a growing
 * scrollbox. When the description is long enough to overflow the pane, yoga
 * shrinks whatever it may -- and a one-line row shrunk to zero paints on top of
 * its neighbor ("Priority  Mediumlog"). These pin the rows at every height.
 *
 *   bun test linear-tui
 */
import { createMockMouse } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import { IssueDetail } from "../../src/linearWorkspace/ui/IssueDetail.tsx"

const DETAIL = {
	id: "i1",
	identifier: "BACKEND-1560",
	title: "Job concurrency never saturates — big queue sits at 7.5 of a cap of 40",
	url: "https://linear.app/x",
	branchName: "backend-1560-job-concurrency-never-saturates",
	priority: 3,
	priorityLabel: "Medium",
	estimate: null,
	createdAt: "2026-07-31T00:00:00.000Z",
	updatedAt: "2026-08-06T00:00:00.000Z",
	state: { id: "s", name: "Backlog", color: "#6e7681", type: "backlog" },
	assignee: null,
	project: null,
	cycle: null,
	labels: { nodes: [] },
	team: { id: "t", key: "BACKEND" },
	// Long enough to overflow every height under test.
	description: "line\n".repeat(60),
	creator: { displayName: "Robin" },
	parent: null,
	children: { nodes: [] },
	comments: { nodes: [] },
	attachments: {
		nodes: [
			{
				id: "att-1",
				title: "Make the cap configurable",
				url: "https://github.com/acme/scheduler-orchestrator/pull/412",
				sourceType: "github",
				metadata: {
					number: 412,
					status: "inReview",
					draft: false,
					branch: "backend-1560-job-concurrency-never-saturates",
					repoName: "scheduler-orchestrator",
					hasConflicts: false,
					updatedAt: "2026-08-06T00:00:00.000Z",
					reviews: [
						{
							state: "approved",
							reviewerLogin: "meadch",
							isBot: false,
							submittedAt: "2026-08-06T00:00:00.000Z",
						},
					],
				},
			},
		],
	},
} as never

const noop = () => {}

for (const height of [40, 24, 16, 12]) {
	test(`detail metadata rows stay on their own line at height ${height}`, async () => {
		const setup = await testRender(
			<IssueDetail
				detail={DETAIL}
				loading={false}
				error={null}
				width={100}
				selectedCommentId={null}
				showActivity={false}
				onToggleActivity={noop}
				onAction={noop}
				onReply={noop}
				onSelectComment={noop}
				onCopyBranch={noop}
				onOpenBrowser={noop}
				onOpenPr={noop}
				onOpenProject={noop}
				onOpenLink={noop}
				onCopyLink={noop}
			/>,
			{ width: 100, height },
		)
		await setup.flush()
		const frame = setup.captureCharFrame()
		setup.renderer.destroy()

		expect(frame).toContain("Status    ○ Backlog")
		expect(frame).toContain("Priority  Medium")
		expect(frame).toContain("Assignee  Unassigned")
		expect(frame).toContain("Cycle     No cycle")
		expect(frame).toContain("Created   Jul 31, 2026")
		expect(frame).toContain("Branch    backend-1560")
		// The linked PR is a fixed row too, so it shares the collapse risk.
		expect(frame).toContain("PR #412   ⎘ ◐ in review · scheduler-orchestrator · 1 approved")
		// A collapsed row leaves the tail of the row underneath it showing.
		expect(frame).not.toContain("Mediumlog")
	})
}

/**
 * Each PR row is its own click target, which is the point when an issue links
 * several: the row names one URL and opens exactly that one.
 */
test("clicking a PR row opens that PR", async () => {
	const opened: string[] = []
	const copied: string[] = []
	const twoPrs = {
		...(DETAIL as Record<string, unknown>),
		attachments: {
			nodes: [
				...(DETAIL as { attachments: { nodes: unknown[] } }).attachments.nodes,
				{
					id: "att-2",
					title: "Second one",
					url: "https://github.com/acme/scheduler-orchestrator/pull/398",
					sourceType: "github",
					metadata: {
						number: 398,
						status: "merged",
						repoName: "scheduler-orchestrator",
						updatedAt: "2026-08-01T00:00:00.000Z",
						reviews: [],
					},
				},
			],
		},
	} as never

	const setup = await testRender(
		<IssueDetail
			detail={twoPrs}
			loading={false}
			error={null}
			width={100}
			selectedCommentId={null}
			showActivity={false}
			onToggleActivity={noop}
			onAction={noop}
			onReply={noop}
			onSelectComment={noop}
			onCopyBranch={noop}
			onOpenBrowser={noop}
			onOpenPr={noop}
			onOpenProject={noop}
			onOpenLink={(url) => opened.push(url)}
			onCopyLink={(url) => copied.push(url)}
		/>,
		{ width: 100, height: 40 },
	)
	await setup.flush()

	const lines = setup.captureCharFrame().split("\n")
	const rowOf = (needle: string) => lines.findIndex((l) => l.includes(needle))
	const mouse = createMockMouse(setup.renderer)

	// The merged one, deliberately not the first row -- a single shared handler
	// would open the wrong PR and still pass a one-row test.
	await mouse.pressDown(4, rowOf("PR #398"))
	await setup.flush()
	expect(opened).toEqual(["https://github.com/acme/scheduler-orchestrator/pull/398"])

	await mouse.pressDown(4, rowOf("PR #412"))
	await setup.flush()
	expect(opened).toHaveLength(2)
	expect(opened[1]).toBe("https://github.com/acme/scheduler-orchestrator/pull/412")

	// The copy icon on the same row copies rather than opens. It sits right after
	// the PR label, next to the link it copies.
	const row = rowOf("PR #398")
	const iconColumn = lines[row]!.indexOf("⎘")
	await mouse.pressDown(iconColumn, row)
	await setup.flush()
	expect(copied).toEqual(["https://github.com/acme/scheduler-orchestrator/pull/398"])
	expect(opened).toHaveLength(2) // copying is not opening

	setup.renderer.destroy()
}, 15000)

test("the Project row is a click target that drills into the project", async () => {
	// `DETAIL` is typed `never` so the fixture can stay partial; widen it to spread.
	const withProject = {
		...(DETAIL as object),
		project: { id: "p1", name: "Search Rebuild", color: "#8b7bd8" },
	} as never
	let drilled = 0
	const opened: string[] = []

	const setup = await testRender(
		<IssueDetail
			detail={withProject}
			loading={false}
			error={null}
			width={100}
			selectedCommentId={null}
			showActivity={false}
			onToggleActivity={noop}
			onAction={noop}
			onReply={noop}
			onSelectComment={noop}
			onCopyBranch={noop}
			onOpenBrowser={noop}
			onOpenPr={noop}
			onOpenProject={() => drilled++}
			onOpenLink={(url) => opened.push(url)}
			onCopyLink={noop}
		/>,
		{ width: 100, height: 40 },
	)
	await setup.flush()

	const lines = setup.captureCharFrame().split("\n")
	const row = lines.findIndex((l) => l.includes("Project") && l.includes("Search Rebuild"))
	expect(row).toBeGreaterThan(-1)

	const mouse = createMockMouse(setup.renderer)
	await mouse.pressDown(4, row)
	await setup.flush()
	expect(drilled).toBe(1)
	expect(opened).toEqual([]) // the project is not a browser link

	setup.renderer.destroy()
}, 15000)
