/**
 * Stubbed Linear backend shared by the render tests.
 *
 * `installLinearStub()` replaces global `fetch` for the calling file, so no test
 * touches the network even when a real token sits in the Keychain.
 */
import type { testRender } from "@opentui/react/test-utils"

export const TEAM = {
	id: "team-1",
	key: "BACKEND",
	name: "Core Platforms",
	activeCycle: {
		id: "cycle-1",
		number: 42,
		name: "Sprint 42",
		startsAt: "2026-08-01T00:00:00.000Z",
		endsAt: "2026-08-15T00:00:00.000Z",
		progress: 0.4,
	},
}

export function issue(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "issue-1",
		identifier: "BACKEND-1361",
		title: "Unified permissions events stream",
		url: "https://linear.app/acme/issue/BACKEND-1361",
		branchName: "robin/backend-1361-events",
		priority: 2,
		priorityLabel: "High",
		estimate: 3,
		createdAt: "2026-07-20T00:00:00.000Z",
		updatedAt: "2026-08-05T00:00:00.000Z",
		state: { id: "state-started", name: "In Progress", color: "#e3b341", type: "started" },
		assignee: { id: "u1", displayName: "Robin", isMe: true },
		project: { id: "p1", name: "Search Rebuild", color: "#8b7bd8" },
		cycle: { number: 42, name: "Sprint 42" },
		labels: { nodes: [{ name: "backend", color: "#58a6ff" }] },
		team: { id: "team-1", key: "BACKEND" },
		/** One open PR and one merged one, the shape a real ticket carries. */
		attachments: {
			nodes: [
				{
					id: "att-1",
					title: "Add the aggregates firehose",
					url: "https://github.com/acme/form-permissions-v2-service/pull/575",
					sourceType: "github",
					metadata: {
						number: 575,
						status: "inReview",
						draft: false,
						branch: "robin/backend-1361-events",
						repoName: "form-permissions-v2-service",
						hasConflicts: false,
						updatedAt: "2026-08-06T00:00:00.000Z",
						reviews: [
							{
								state: "approved",
								reviewerLogin: "richmoni",
								isBot: false,
								submittedAt: "2026-08-06T00:00:00.000Z",
							},
						],
					},
				},
				{
					id: "att-2",
					title: "Land the core aggregation",
					url: "https://github.com/acme/data-warehouse-pipeline/pull/783",
					sourceType: "github",
					metadata: {
						number: 783,
						status: "merged",
						draft: false,
						branch: "robin/backend-1361-core",
						repoName: "data-warehouse-pipeline",
						hasConflicts: false,
						updatedAt: "2026-07-30T00:00:00.000Z",
						reviews: [],
					},
				},
			],
		},
		...over,
	}
}

/** Shared by the team projects list and the project workspace's Overview tab. */
export const PROJECT = {
	id: "p1",
	name: "Search Rebuild",
	description: "Unified permissions events",
	progress: 0.62,
	targetDate: "2026-09-01",
	health: "onTrack",
	status: { id: "ps-started", name: "In Progress", type: "started", color: "#e3b341" },
	lead: { displayName: "Robin" },
}

/** Finished, so My Projects must not list it. */
export const DONE_PROJECT = {
	...PROJECT,
	id: "p2",
	name: "Legacy Cutover",
	description: "Retired",
	progress: 1,
	targetDate: "2026-06-01",
	status: { id: "ps-done", name: "Completed", type: "completed", color: "#5e6ad2" },
}

export function projectUpdate(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "pu1",
		body: "Firehose is live in staging; parity job green.",
		health: "onTrack",
		createdAt: "2026-08-05T00:00:00.000Z",
		editedAt: null,
		url: "https://linear.app/acme/project/search-rebuild#pu1",
		isStale: false,
		user: { displayName: "Robin", isMe: true },
		comments: {
			nodes: [
				{
					id: "uc1",
					body: "Nice — what about the delete path?",
					createdAt: "2026-08-06T00:00:00.000Z",
					url: "https://linear.app/x#uc1",
					resolvedAt: null,
					user: { displayName: "Dana", isMe: false },
					parent: null,
				},
			],
		},
		...over,
	}
}

/**
 * Activity feed entries, newest first the way Linear returns them. Every change
 * field is nullish in the schema, so a fixture only names what it sets -- the
 * middle node here is one event carrying two changes, which the feed fans out
 * into two rows.
 */
export const HISTORY = [
	{
		id: "h1",
		createdAt: "2026-08-06T09:12:00.000Z",
		actor: null,
		botActor: { name: "GitHub", userDisplayName: null },
		fromState: { name: "In Progress", type: "started", color: "#e3b341" },
		toState: { name: "In Review", type: "started", color: "#0f783c" },
	},
	{
		id: "h2",
		createdAt: "2026-08-03T14:00:00.000Z",
		actor: { displayName: "Robin" },
		toAssignee: { displayName: "Robin" },
		addedLabels: [{ name: "backend" }],
	},
	{
		id: "h3",
		createdAt: "2026-07-28T11:30:00.000Z",
		actor: { displayName: "Dana" },
		fromPriority: 3,
		toPriority: 2,
	},
]

/**
 * A rejection from Linear. `installLinearStub` turns this into a GraphQL errors
 * payload, so the app's own error handling is what the test exercises.
 */
export class StubApiError extends Error {}

/** CommentCreateInput's anchors. Exactly one may be present -- see respond(). */
const ANCHOR_KEYS = ["issueId", "projectUpdateId", "documentContentId"] as const

/** Fixture comments that are themselves replies, so `parentId` may not name them. */
const REPLY_IDS = new Set(["c2"])

/** Mutation calls the app made, so tests can assert on the payload sent. */
export const sent: { query: string; variables: Record<string, unknown> }[] = []

/** Every request, mutations included -- lets the pagination test count round trips. */
export const requests: { query: string; variables: Record<string, unknown> }[] = []

/** Routes on the operation name embedded in the query document. */
export function respond(query: string, variables: Record<string, unknown> = {}): unknown {
	if (query.includes("query TeamWorkflow")) {
		return {
			team: {
				id: "team-1",
				states: {
					nodes: [
						{ id: "state-todo", name: "Todo", color: "#6e7681", type: "unstarted", position: 1 },
						{ id: "state-started", name: "In Progress", color: "#e3b341", type: "started", position: 2 },
						{ id: "state-done", name: "Done", color: "#8b7bd8", type: "completed", position: 3 },
					],
				},
				members: {
					nodes: [
						{ id: "u1", displayName: "Robin", isMe: true },
						{ id: "u2", displayName: "Dana", isMe: false },
					],
				},
				activeCycle: TEAM.activeCycle,
				cycles: {
					nodes: [
						TEAM.activeCycle,
						{
							id: "cycle-2",
							number: 43,
							name: "Sprint 43",
							startsAt: "2026-08-16T00:00:00.000Z",
							endsAt: "2026-08-31T00:00:00.000Z",
						},
					],
				},
			},
		}
	}
	if (query.includes("mutation IssueUpdate")) {
		return { issueUpdate: { success: true, issue: { id: "issue-1", identifier: "BACKEND-1361" } } }
	}
	if (query.includes("mutation CommentCreate")) {
		const input = (variables.input ?? {}) as Record<string, unknown>
		// Linear requires exactly one anchor and counts an explicit null as defined,
		// so a null for an anchor that does not apply is a rejection, not a no-op.
		// This stub used to accept anything, which is how a payload naming all three
		// shipped and failed against the real API on every comment.
		const anchors = ANCHOR_KEYS.filter((k) => k in input)
		if (anchors.length !== 1) {
			throw new StubApiError("Argument Validation Error: exactly one of " + `${ANCHOR_KEYS.join(", ")} must be defined, got [${anchors.join(", ")}]`)
		}
		if (typeof input.parentId === "string" && REPLY_IDS.has(input.parentId)) {
			throw new StubApiError("incorrect parent: Parent comment must be a top level comment")
		}
		return { commentCreate: { success: true, comment: { id: "c-new" } } }
	}
	if (query.includes("query Bootstrap")) {
		return {
			viewer: {
				id: "u1",
				name: "robin",
				displayName: "Robin",
				teamMemberships: { nodes: [{ sortOrder: 0, team: TEAM }] },
			},
			customViews: { nodes: [{ id: "cv-1", name: "My saved view" }] },
		}
	}
	if (query.includes("query MyIssues")) return { issues: { nodes: [issue()] } }
	if (query.includes("query CycleIssues")) {
		return {
			cycle: {
				...TEAM.activeCycle,
				issues: {
					nodes: [
						issue(),
						issue({
							id: "issue-2",
							identifier: "BACKEND-1400",
							title: "Backfill orphan deletes",
							state: { id: "state-todo", name: "Todo", color: "#6e7681", type: "unstarted" },
							priority: 1,
							// Exactly one linked PR, so `O` on this row opens without a picker.
							attachments: {
								nodes: [
									{
										id: "att-3",
										title: "Backfill the deletes",
										url: "https://github.com/acme/data-warehouse-pipeline/pull/801",
										sourceType: "github",
										metadata: {
											number: 801,
											status: "open",
											draft: false,
											branch: "backend-1400-backfill-orphan-deletes",
											repoName: "data-warehouse-pipeline",
											hasConflicts: false,
											updatedAt: "2026-08-07T00:00:00.000Z",
											reviews: [],
										},
									},
								],
							},
						}),
					],
				},
			},
		}
	}
	// Two pages, so the cursor walk is exercised end to end.
	if (query.includes("query TeamIssues")) {
		return variables.after === "cur-1"
			? {
					issues: {
						pageInfo: { hasNextPage: false, endCursor: null },
						nodes: [issue({ id: "issue-9", identifier: "BACKEND-1999", title: "Second page issue" })],
					},
				}
			: {
					issues: {
						pageInfo: { hasNextPage: true, endCursor: "cur-1" },
						nodes: [issue()],
					},
				}
	}
	if (query.includes("query TeamProjects")) {
		return { team: { projects: { nodes: [PROJECT] } } }
	}
	if (query.includes("query MyProjects")) {
		return { projects: { nodes: [PROJECT, DONE_PROJECT] } }
	}
	if (query.includes("query ProjectOverview")) {
		return {
			project: {
				...PROJECT,
				content: "One firehose for every permissions change.",
				icon: null,
				color: "#8b7bd8",
				url: "https://linear.app/acme/project/search-rebuild",
				scope: 21,
				startDate: "2026-07-01",
				healthUpdatedAt: "2026-08-05T00:00:00.000Z",
				createdAt: "2026-07-01T00:00:00.000Z",
				updatedAt: "2026-08-05T00:00:00.000Z",
				members: { nodes: [{ id: "u1", displayName: "Robin", isMe: true }] },
				teams: { nodes: [{ id: "team-1", key: "BACKEND" }] },
				documentContent: { id: "dc-1" },
				lastUpdate: projectUpdate(),
				projectMilestones: {
					nodes: [
						{
							id: "m1",
							name: "Orphan parity",
							targetDate: "2026-08-15",
							status: "next",
							progress: 0.5,
						},
					],
				},
				comments: {
					nodes: [
						{
							id: "pc1",
							body: "Scope looks right to me.",
							createdAt: "2026-08-02T00:00:00.000Z",
							url: "https://linear.app/x#pc1",
							resolvedAt: null,
							user: { displayName: "Dana", isMe: false },
							parent: null,
						},
					],
				},
			},
		}
	}
	if (query.includes("query ProjectUpdates")) {
		return {
			project: {
				id: "p1",
				name: "Search Rebuild",
				projectUpdates: {
					pageInfo: { hasNextPage: false, endCursor: null },
					nodes: [
						projectUpdate(),
						projectUpdate({
							id: "pu2",
							body: "Kicked off; schema drafted.",
							health: "atRisk",
							createdAt: "2026-07-25T00:00:00.000Z",
							comments: { nodes: [] },
						}),
					],
				},
			},
		}
	}
	if (query.includes("query ProjectIssues")) {
		return {
			project: {
				id: "p1",
				name: "Search Rebuild",
				issues:
					variables.after === "project-page-1"
						? {
								pageInfo: { hasNextPage: false, endCursor: null },
								nodes: [
									issue({
										id: "issue-2",
										identifier: "BACKEND-1400",
										title: "Backfill orphan deletes",
										state: { id: "state-todo", name: "Todo", color: "#6e7681", type: "unstarted" },
									}),
								],
							}
						: { pageInfo: { hasNextPage: true, endCursor: "project-page-1" }, nodes: [issue()] },
			},
		}
	}
	if (query.includes("mutation ProjectUpdateCreate")) {
		return {
			projectUpdateCreate: {
				success: true,
				projectUpdate: { id: "pu-new", url: "https://linear.app/x/pu-new" },
			},
		}
	}
	if (query.includes("query IssueDetail")) {
		return {
			issue: {
				...issue(
					variables.issueId === "issue-2"
						? {
								id: "issue-2",
								identifier: "BACKEND-1400",
								title: "Backfill orphan deletes",
							}
						: {},
				),
				description: "Stream every permissions change onto one firehose.",
				creator: { displayName: "Robin" },
				parent: null,
				children: { nodes: [] },
				comments: {
					nodes: [
						{
							id: "c1",
							body: "Dual-repo branch is up.",
							createdAt: "2026-08-04T00:00:00.000Z",
							url: "https://linear.app/x#c1",
							resolvedAt: null,
							user: { displayName: "Robin", isMe: true },
							parent: null,
						},
						{
							id: "c2",
							body: "Nice, I will review.",
							createdAt: "2026-08-05T00:00:00.000Z",
							url: "https://linear.app/x#c2",
							resolvedAt: null,
							user: { displayName: "Dana", isMe: false },
							parent: { id: "c1" },
						},
					],
				},
				history: { pageInfo: { hasNextPage: false }, nodes: HISTORY },
			},
		}
	}
	if (query.includes("query SearchIssues")) {
		return { searchIssues: { nodes: [issue({ title: "Found by search" })] } }
	}
	if (query.includes("query CustomViewIssues")) {
		// No attachments here, so the blank PR cell and `O`'s refusal get covered too.
		return {
			customView: {
				id: "cv-1",
				name: "My saved view",
				issues: { nodes: [issue({ attachments: { nodes: [] } })] },
			},
		}
	}
	if (query.includes("query UnreadCount")) return { notificationsUnreadCount: 2 }
	if (query.includes("query Notifications")) {
		return {
			notifications: {
				pageInfo: { hasNextPage: false, endCursor: null },
				nodes: [
					{
						id: "n-1",
						type: "issueCommentMention",
						title: "Dana mentioned you",
						subtitle: "can you take a look at the DB lag?",
						url: "https://linear.app/acme/issue/BACKEND-1361#comment-c1",
						createdAt: "2026-08-06T00:00:00.000Z",
						readAt: null,
						snoozedUntilAt: null,
						actor: { displayName: "Dana" },
						issue: {
							id: "issue-1",
							identifier: "BACKEND-1361",
							title: "Unified permissions events stream",
							state: { id: "state-started", name: "In Progress", color: "#e3b341", type: "started" },
							team: { id: "team-1", key: "BACKEND" },
						},
						comment: { id: "c1", body: "can you take a look at the DB lag?" },
					},
					{
						id: "n-2",
						type: "issueAssignedToYou",
						title: "Robin assigned you an issue",
						subtitle: "Backfill orphan deletes",
						url: "https://linear.app/acme/issue/BACKEND-1400",
						createdAt: "2026-08-04T00:00:00.000Z",
						readAt: "2026-08-05T00:00:00.000Z",
						snoozedUntilAt: null,
						actor: { displayName: "Robin" },
						issue: {
							id: "issue-2",
							identifier: "BACKEND-1400",
							title: "Backfill orphan deletes",
							state: { id: "state-todo", name: "Todo", color: "#6e7681", type: "unstarted" },
							team: { id: "team-1", key: "BACKEND" },
						},
						comment: null,
					},
					// The two ProjectNotification shapes: one about a posted update, one
					// about the project itself.
					{
						id: "n-3",
						type: "projectUpdateCreated",
						title: "Robin posted a project update",
						subtitle: "Search Rebuild",
						url: "https://linear.app/acme/project/search-rebuild#pu1",
						createdAt: "2026-08-05T00:00:00.000Z",
						readAt: "2026-08-05T00:00:00.000Z",
						snoozedUntilAt: null,
						actor: { displayName: "Robin" },
						project: { id: "p1", name: "Search Rebuild" },
						projectUpdate: { id: "pu1" },
					},
					{
						id: "n-4",
						type: "projectAddedAsMember",
						title: "Dana added you to a project",
						subtitle: "Search Rebuild",
						url: "https://linear.app/acme/project/search-rebuild",
						createdAt: "2026-08-03T00:00:00.000Z",
						readAt: "2026-08-03T00:00:00.000Z",
						snoozedUntilAt: null,
						actor: { displayName: "Dana" },
						project: { id: "p1", name: "Search Rebuild" },
						projectUpdate: null,
					},
				],
			},
		}
	}
	if (query.includes("mutation NotificationArchive")) {
		return { notificationArchive: { success: true } }
	}
	if (query.includes("mutation NotificationUpdate")) {
		return { notificationUpdate: { success: true } }
	}
	throw new Error(`unstubbed query: ${query.slice(0, 80)}`)
}

export type Setup = Awaited<ReturnType<typeof testRender>>

/**
 * Wall-clock wait. `waitForFrame`'s budget is render passes (~1ms each), which
 * expires long before a stubbed fetch plus a React commit have landed.
 */
export async function frameWith(setup: Setup, predicate: (frame: string) => boolean, label: string): Promise<string> {
	const deadline = Date.now() + 5000
	while (Date.now() < deadline) {
		await setup.flush()
		const frame = setup.captureCharFrame()
		if (predicate(frame)) return frame
		await Bun.sleep(10)
	}
	throw new Error(`timed out waiting for ${label}\n${setup.captureCharFrame()}`)
}

/** Lets a keypress commit before the next one is sent. */
export async function settle(setup: Setup): Promise<void> {
	await setup.flush()
	await Bun.sleep(20)
	await setup.flush()
}

/** Longest realistic strings the columns have to survive. */
const LONG_TITLE = "Make the default orchestrator concurrency cap configurable without a code change"
const LONG_NAME = "charlie.mead"

/**
 * Stretches the free-text fields to their worst realistic length.
 *
 * Layout tests need rows that genuinely overflow; the readable fixtures are too
 * short to push any column past its pane. Only `title`, `subtitle` and
 * `displayName` are touched, so state and project names stay assertable.
 */
function stretch(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stretch)
	if (value === null || typeof value !== "object") return value
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, inner]) => {
			if (typeof inner === "string") {
				if (key === "title" || key === "subtitle") return [key, LONG_TITLE]
				if (key === "displayName") return [key, LONG_NAME]
			}
			return [key, stretch(inner)]
		}),
	)
}

/**
 * Swaps `fetch` for the stub. Returns the restore function for `afterAll`.
 *
 * `longContent` stretches every title and display name -- what the layout tests
 * want, and what would make the readable assertions in the smoke test fail.
 */
export function installLinearStub({ longContent = false } = {}): () => void {
	const realFetch = globalThis.fetch
	process.env.LINEAR_API_TOKEN = "lin_api_test"
	globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
		const { query, variables } = JSON.parse(init?.body ?? "{}") as {
			query: string
			variables: Record<string, unknown>
		}
		requests.push({ query, variables })
		if (query.includes("mutation")) sent.push({ query, variables })
		let data: unknown
		try {
			data = respond(query, variables)
		} catch (e) {
			if (!(e instanceof StubApiError)) throw e
			return new Response(JSON.stringify({ errors: [{ message: e.message }] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(JSON.stringify({ data: longContent ? stretch(data) : data }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as typeof fetch
	return () => {
		globalThis.fetch = realFetch
	}
}
