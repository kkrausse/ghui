/**
 * The activity feed's fan-out and ordering.
 *
 * Everything a history node can carry is nullish and one node can set several
 * fields at once, so these pin the two properties the pane depends on: one row
 * per *change* (not per event), and a single newest-first order across history,
 * comments, and the synthesized creation row.
 *
 *   bun test linear-tui
 */
import { expect, test } from "bun:test"
import { activityTruncated, buildActivity } from "../../src/linearWorkspace/activity.ts"
import type { IssueDetail } from "../../src/linearWorkspace/linear/schema.ts"

function detail(over: Record<string, unknown> = {}): IssueDetail {
	return {
		id: "i1",
		identifier: "BACKEND-1",
		title: "t",
		url: "https://linear.app/x",
		createdAt: "2026-07-01T00:00:00.000Z",
		creator: { displayName: "Robin" },
		comments: { nodes: [] },
		history: { nodes: [], pageInfo: { hasNextPage: false } },
		...over,
	} as never
}

test("one event carrying several changes becomes one row per change", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [
					{
						id: "h1",
						createdAt: "2026-08-03T14:00:00.000Z",
						actor: { displayName: "Robin" },
						fromState: { name: "Todo", type: "unstarted", color: "#6e7681" },
						toState: { name: "In Progress", type: "started", color: "#e3b341" },
						toAssignee: { displayName: "Dana" },
						addedLabels: [{ name: "backend" }],
						removedLabels: [{ name: "triage" }],
					},
				],
			},
		}),
	)

	expect(rows.map((r) => r.text)).toEqual(["◌ Todo → ◐ In Progress", "assigned to Dana", "+label backend", "−label triage", "created the issue"])
	// Every row of the event keeps the event's own stamp and actor.
	expect(rows.slice(0, 4).every((r) => r.at === "2026-08-03T14:00:00.000Z")).toBe(true)
	expect(rows.slice(0, 4).every((r) => r.actor === "Robin")).toBe(true)
	// Keys are per row, not per event -- React would otherwise see four of one id.
	expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
})

test("history, comments, and creation interleave newest first", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [
					{
						id: "h1",
						createdAt: "2026-08-06T09:00:00.000Z",
						actor: { displayName: "Robin" },
						toState: { name: "Done", type: "completed", color: "#8b7bd8" },
					},
				],
			},
			comments: {
				nodes: [
					{
						id: "c1",
						body: "  \n\nfirst line of the comment\nsecond line",
						createdAt: "2026-08-04T09:00:00.000Z",
						user: { displayName: "Dana" },
					},
				],
			},
		}),
	)

	expect(rows.map((r) => r.text)).toEqual(["● Done", "commented: first line of the comment", "created the issue"])
})

test("an integration is named by its bot actor rather than left blank", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [
					{
						id: "h1",
						createdAt: "2026-08-06T09:00:00.000Z",
						actor: null,
						botActor: { name: "GitHub", userDisplayName: null },
						toState: { name: "In Review", type: "started", color: "#0f783c" },
					},
				],
			},
		}),
	)

	expect(rows[0]!.actor).toBe("GitHub")
})

test("priority, cycle, project, and parent changes read as one line each", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [
					{
						id: "h1",
						createdAt: "2026-08-06T09:00:00.000Z",
						actor: { displayName: "Robin" },
						fromPriority: 3,
						toPriority: 1,
						fromCycle: { number: 72, name: "Northwind Apps" },
						toCycle: { number: 73, name: null },
						toProject: { name: "Search Rebuild" },
						toParent: { identifier: "BACKEND-9" },
						updatedDescription: true,
					},
				],
			},
		}),
	)

	expect(rows.map((r) => r.text)).toEqual([
		"priority Medium → Urgent",
		"cycle Northwind Apps → Cycle 73",
		"project Search Rebuild",
		"parent BACKEND-9",
		"edited the description",
		"created the issue",
	])
})

/** The codes are undocumented; an unknown one has to survive as itself. */
test("relation codes decode to their verb, and unknown ones stay literal", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [
					{
						id: "h1",
						createdAt: "2026-08-06T09:00:00.000Z",
						actor: { displayName: "Robin" },
						relationChanges: [
							{ identifier: "BACKEND-2", type: "ar" },
							{ identifier: "BACKEND-3", type: "ab" },
							{ identifier: "BACKEND-4", type: "am" },
							{ identifier: "BACKEND-5", type: "rr" },
							{ identifier: "BACKEND-6", type: "zz" },
						],
					},
				],
			},
		}),
	)

	expect(rows.map((r) => r.text)).toEqual(["+related BACKEND-2", "+blocking BACKEND-3", "+duplicate BACKEND-4", "−related BACKEND-5", "relation zz BACKEND-6", "created the issue"])
})

test("an event with nothing renderable contributes no rows", () => {
	const rows = buildActivity(
		detail({
			history: {
				nodes: [{ id: "h1", createdAt: "2026-08-06T09:00:00.000Z", actor: { displayName: "K" } }],
			},
		}),
	)

	expect(rows.map((r) => r.text)).toEqual(["created the issue"])
})

test("truncation is reported from the page cursor, not from the row count", () => {
	expect(activityTruncated(detail())).toBe(false)
	expect(activityTruncated(detail({ history: { nodes: [], pageInfo: { hasNextPage: true } } }))).toBe(true)
})
