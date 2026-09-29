/**
 * List rows must stay exactly one line tall at every width.
 *
 * Regression: the columns were shrinkable, so a long title pushed the row over
 * the pane width and yoga squeezed the fixed cells until they wrapped --
 * `BACKEND-1558` split across two lines, `● ● ` collapsed to `●●`, and the
 * extra line pushed later rows out of the viewport and over each other.
 *
 *   bun test linear-tui
 */
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import { IssueList } from "../../src/linearWorkspace/ui/IssueList.tsx"
import { NotificationList } from "../../src/linearWorkspace/ui/NotificationList.tsx"

const LONG = "Make the default orchestrator concurrency cap configurable without a code change"

function issue(i: number) {
	return {
		id: `i${i}`,
		identifier: `BACKEND-15${58 + i}`,
		title: LONG,
		priority: 2,
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-01T00:00:00.000Z",
		state: { id: "s", name: "Done", color: "#3fb950", type: "completed" },
		assignee: { id: "a1", displayName: "charlie.mead" },
		// Two PRs, so the row renders the cell at its widest: glyph, number, and `+`.
		attachments: {
			nodes: [
				{
					id: `att-${i}-a`,
					url: "https://github.com/acme/scheduler-orchestrator/pull/412",
					sourceType: "github",
					metadata: {
						number: 412,
						status: "inReview",
						repoName: "scheduler-orchestrator",
						updatedAt: "2026-08-01T00:00:00.000Z",
					},
				},
				{
					id: `att-${i}-b`,
					url: "https://github.com/acme/scheduler-orchestrator/pull/398",
					sourceType: "github",
					metadata: {
						number: 398,
						status: "merged",
						repoName: "scheduler-orchestrator",
						updatedAt: "2026-07-28T00:00:00.000Z",
					},
				},
			],
		},
	} as never
}

function notification(i: number) {
	return {
		id: `n${i}`,
		type: "issueCommentMention",
		title: LONG,
		subtitle: LONG,
		createdAt: "2026-08-01T00:00:00.000Z",
		readAt: null,
		actor: { id: "a1", displayName: "charlie.mead" },
		issue: issue(i),
	} as never
}

/** Frame lines with the border stripped, so only row content is left. */
function contentLines(frame: string): string[] {
	return frame
		.split("\n")
		.filter((line) => line.startsWith("│"))
		.map((line) => line.slice(1, -1))
}

const WIDTHS = [60, 80, 100, 130, 200]

test("notification rows stay one line at every width", async () => {
	const items = [0, 1, 2].map(notification)

	for (const width of WIDTHS) {
		const setup = await testRender(<NotificationList title="Inbox" notifications={items} selected={0} focused loading={false} error={null} height={10} onPick={() => {}} />, {
			width,
			height: 12,
		})
		await setup.waitForVisualIdle()
		const lines = contentLines(setup.captureCharFrame())

		// One line per row -- everything after them is blank filler.
		for (const [i] of items.entries()) {
			expect(lines[i], `width ${width}`).toContain(`BACKEND-15${58 + i}`)
		}
		expect(lines[items.length]?.trim(), `width ${width}`).toBe("")
	}
})

test("issue rows stay one line at every width", async () => {
	const issues = [0, 1, 2].map(issue)

	for (const width of WIDTHS) {
		const setup = await testRender(
			<IssueList title="All Issues" issues={issues} selected={0} focused groupBy="none" loading={false} error={null} height={10} onPick={() => {}} />,
			{ width, height: 12 },
		)
		await setup.waitForVisualIdle()
		const lines = contentLines(setup.captureCharFrame())

		for (const [i] of issues.entries()) {
			expect(lines[i], `width ${width}`).toContain(`BACKEND-15${58 + i}`)
			// The in-flight PR, not the merged one, and `+` for the one behind it.
			expect(lines[i], `width ${width}`).toContain("◐#412+")
		}
		expect(lines[issues.length]?.trim(), `width ${width}`).toBe("")
	}
})

test("shrinking the terminal leaves no stale glyphs behind", async () => {
	const items = [0, 1, 2].map(notification)
	const setup = await testRender(<NotificationList title="Inbox" notifications={items} selected={0} focused loading={false} error={null} height={10} onPick={() => {}} />, {
		width: 200,
		height: 12,
	})
	await setup.waitForVisualIdle()
	setup.resize(120, 12)
	await setup.waitForVisualIdle()

	const lines = contentLines(setup.captureCharFrame())
	for (const [i] of items.entries()) {
		expect(lines[i]).toContain(`BACKEND-15${58 + i}`)
		// The right-hand columns keep their own cells instead of being overwritten.
		expect(lines[i]).toContain("charlie.mead")
	}
	expect(lines[items.length]?.trim()).toBe("")
})
