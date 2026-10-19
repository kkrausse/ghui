/**
 * faplex agent sessions nest under their ticket after its PRs: by tag, or by
 * the ticket id appearing in the session's title, status line or directory.
 *
 *   bun test test/linear/sessions.test.tsx
 */
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import { indexSessions, sessionTargets, type FaplexSession, type FaplexSnapshot } from "../../src/linearWorkspace/faplex.ts"
import { buildIssueRows } from "../../src/linearWorkspace/issueRows.ts"
import { IssueList } from "../../src/linearWorkspace/ui/IssueList.tsx"

const issue = (identifier: string, prs: number[] = []) =>
	({
		id: identifier,
		identifier,
		title: `title of ${identifier}`,
		priority: 0,
		createdAt: "2026-10-01T00:00:00.000Z",
		updatedAt: "2026-10-01T00:00:00.000Z",
		state: { id: "s", name: "Started", color: "#e3b341", type: "started" },
		attachments: {
			nodes: prs.map((n) => ({
				id: `pr-${n}`,
				url: `https://github.com/acme/repo/pull/${n}`,
				sourceType: "github",
				metadata: { number: n, status: "inReview", repoName: "repo", updatedAt: "2026-10-01T00:00:00.000Z" },
			})),
		},
	}) as never

const session = (id: string, over: Partial<FaplexSession> = {}): FaplexSession => ({
	key: `laptop/claude:${id}`,
	machine: "laptop",
	harness: "claude",
	title: id,
	cwd: "/home/me/src",
	status: "done",
	detail: "",
	updatedAt: 1_790_000_000_000,
	archived: false,
	prompted: true,
	open: { cmd: ["claude", "attach", id], cwd: "/home/me/src" },
	tags: [],
	...over,
})

const snapshot = (sessions: FaplexSession[]): FaplexSnapshot => ({
	machines: [
		{ id: "laptop", short: "lap", remote: false, dir: "/home/me/src" },
		{ id: "devbox", short: "dev", remote: true, dir: "~" },
	],
	harnesses: ["claude", "codex"],
	lastPick: { machine: "devbox", harness: "claude" },
	sources: [
		{ machine: "laptop", harness: "claude", loaded: true, problem: null },
		{ machine: "laptop", harness: "codex", loaded: true, problem: { kind: "stopped", message: "app-server not running" } },
		{ machine: "devbox", harness: "claude", loaded: true, problem: null },
	],
	sessions,
})

test("sessions match by tag or by the ticket id in title, status line or directory", () => {
	const sessionsFor = indexSessions(
		snapshot([
			session("tagged", { tags: ["ABC-1"] }),
			session("titled", { title: "abc-1 refactor" }),
			session("detailed", { detail: "ABC-1 / PR #12 opened" }),
			session("worktree", { cwd: "/home/me/src/.worktrees/abc-1-fix" }),
			session("prefix", { title: "ABC-12 is a different ticket" }),
			session("draft", { tags: ["ABC-1"], prompted: false, status: "idle" }),
		]),
	)
	expect(
		sessionsFor(issue("ABC-1"))
			.map((s) => s.title)
			.sort(),
	).toEqual(["abc-1 refactor", "detailed", "tagged", "worktree"])
	expect(sessionsFor(issue("ABC-12")).map((s) => s.title)).toEqual(["ABC-12 is a different ticket"])
	expect(sessionsFor(issue("ABC-1"))[0]!.host).toBe("lap")
})

test("live sessions sort first, archived last", () => {
	const sessionsFor = indexSessions(
		snapshot([
			session("old", { tags: ["ABC-1"], updatedAt: 1 }),
			session("archived", { tags: ["ABC-1"], archived: true, status: "needs" }),
			session("working", { tags: ["ABC-1"], status: "working" }),
			session("asks", { tags: ["ABC-1"], status: "needs" }),
		]),
	)
	expect(sessionsFor(issue("ABC-1")).map((s) => s.title)).toEqual(["asks", "working", "old", "archived"])
})

test("an expanded ticket lists PRs, then sessions, with one last row", () => {
	const sessionsFor = indexSessions(snapshot([session("a", { tags: ["ABC-1"] }), session("b", { tags: ["ABC-1"] })]))
	const rows = buildIssueRows([issue("ABC-1", [7])], "none", new Set(["ABC-1"]), sessionsFor)
	expect(rows.map((r) => [r.t, "last" in r ? r.last : null])).toEqual([
		["issue", null],
		["pr", false],
		["session", false],
		["session", true],
	])
})

test("new sessions start where a harness has no problem: the ticket's dirs, the default, then recent ones", () => {
	const onTicket = session("t", { cwd: "/home/me/src/.worktrees/abc-1", tags: ["ABC-1"] })
	const snap = snapshot([session("recent", { cwd: "/home/me/other", updatedAt: 2 }), onTicket])
	snap.sources[2] = { ...snap.sources[2]!, loaded: false }
	expect(sessionTargets(snap, [onTicket])).toEqual([
		{ machine: "devbox", harness: "claude", dir: "~" },
		{ machine: "laptop", harness: "claude", dir: "/home/me/src/.worktrees/abc-1" },
		{ machine: "laptop", harness: "claude", dir: "/home/me/src" },
		{ machine: "laptop", harness: "claude", dir: "/home/me/other" },
	])
})

test("session rows render status, harness·host and title", async () => {
	const sessionsFor = indexSessions(snapshot([session("fix the parser", { tags: ["ABC-1"], status: "working", detail: "running tests" })]))
	const setup = await testRender(
		<IssueList
			title="t"
			issues={[issue("ABC-1")]}
			selected={0}
			focused
			groupBy="none"
			loading={false}
			error={null}
			height={8}
			onPick={() => {}}
			expanded={new Set(["ABC-1"])}
			sessionsFor={sessionsFor}
		/>,
		{ width: 100, height: 8 },
	)
	await setup.renderOnce()
	const frame = setup.captureCharFrame()
	expect(frame).toContain("◐ claude·lap  fix the parser · running tests")
	expect(frame).toContain("▾ ")
	setup.renderer.destroy()
})
