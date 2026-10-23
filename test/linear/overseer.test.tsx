/**
 * The overseer: a faplex session tagged `overseer`, shown above My Issues
 * instead of under a ticket, and fed a context file of every open ticket with
 * its PRs and sessions.
 *
 *   bun test test/linear/overseer.test.tsx
 */
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import { indexSessions, type FaplexSession, type FaplexSnapshot } from "../../src/linearWorkspace/faplex.ts"
import { briefing, CONTEXT_PATH, contextMarkdown, overseerSession } from "../../src/linearWorkspace/overseer.ts"
import { OverseerPanel } from "../../src/linearWorkspace/ui/IssueList.tsx"

const issue = (identifier: string, project: string | null, prs: number[] = []) =>
	({
		id: identifier,
		identifier,
		title: `title of ${identifier}`,
		url: `https://linear.app/acme/issue/${identifier}`,
		createdAt: "2026-10-01T00:00:00.000Z",
		state: { id: "s", name: "In Progress", color: "#e3b341", type: "started" },
		project: project ? { id: project, name: project } : null,
		attachments: {
			nodes: prs.map((n) => ({
				id: `pr-${n}`,
				url: `https://github.com/acme/repo/pull/${n}`,
				sourceType: "github",
				metadata: { number: n, status: "inReview", repoName: "repo", branch: `abc-${n}`, updatedAt: "2026-10-01T00:00:00.000Z" },
			})),
		},
	}) as never

const session = (id: string, over: Partial<FaplexSession> = {}): FaplexSession => ({
	key: `laptop/claude:${id}`,
	machine: "laptop",
	harness: "claude",
	title: id,
	cwd: "/w",
	status: "done",
	detail: "",
	updatedAt: 1_790_000_000_000,
	archived: false,
	prompted: true,
	tags: [],
	...over,
})

const snapshot = (sessions: FaplexSession[]): FaplexSnapshot => ({
	machines: [{ id: "laptop", short: "lap", remote: false, dir: "/w" }],
	harnesses: ["claude"],
	lastPick: null,
	sources: [{ machine: "laptop", harness: "claude", loaded: true, problem: null }],
	sessions,
})

const sessions = [
	session("old-overseer", { tags: ["overseer"], updatedAt: 1 }),
	session("overseer", { tags: ["overseer"], detail: "ABC-1 looks done" }),
	session("gone-overseer", { tags: ["overseer"], archived: true, updatedAt: 2_000_000_000_000 }),
	session("worker", { tags: ["ABC-1"], status: "working", detail: "running tests" }),
	session("stray", { title: "unrelated spike" }),
]

test("the newest live overseer is found, and it is never nested under a ticket", () => {
	const snap = snapshot(sessions)
	expect(overseerSession(snap)?.key).toBe("laptop/claude:overseer")
	expect(overseerSession(snap)?.host).toBe("lap")
	expect(indexSessions(snap)(issue("ABC-1", null)).map((s) => s.title)).toEqual(["worker"])
})

test("the context lists tickets by project with PRs and session keys, then unclaimed sessions", () => {
	const snap = snapshot(sessions)
	const text = contextMarkdown([issue("ABC-1", "Launch", [12]), issue("ABC-2", null)], snap, indexSessions(snap))
	expect(text).toContain("## Launch\n\n- ABC-1 [In Progress] title of ABC-1 · https://linear.app/acme/issue/ABC-1")
	expect(text).toContain("  - PR repo#12 inReview · abc-12 · https://github.com/acme/repo/pull/12")
	expect(text).toContain('  - session laptop/claude:worker · working · "worker" · running tests · /w')
	expect(text).toContain("## No project\n\n- ABC-2")
	expect(text).toContain('## Sessions not on a listed ticket\n\n- laptop/claude:stray · done · "unrelated spike"')
	expect(text).not.toContain("overseer ·")
})

test("the briefing points at the context file and appends Kevin's own instructions", () => {
	expect(briefing("")).toContain(CONTEXT_PATH)
	expect(briefing("").endsWith("Only send messages to sessions or start new ones when Kevin asks.")).toBe(true)
	expect(briefing("  watch the e2e runs ").endsWith("when Kevin asks.\n\nwatch the e2e runs")).toBe(true)
})

test("the panel says how to start one, or shows the running overseer's status", async () => {
	const empty = await testRender(<OverseerPanel session={undefined} onPick={() => {}} />, { width: 100, height: 2 })
	await empty.renderOnce()
	expect(empty.captureCharFrame()).toContain("◆ overseer  A starts an agent")
	empty.renderer.destroy()

	const running = await testRender(<OverseerPanel session={overseerSession(snapshot(sessions))} onPick={() => {}} />, { width: 100, height: 2 })
	await running.renderOnce()
	expect(running.captureCharFrame()).toMatch(/◆ overseer +lap·clau {2}ABC-1 looks done +A open/)
	running.renderer.destroy()
})
