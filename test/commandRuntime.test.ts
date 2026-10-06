import { describe, expect, test } from "bun:test"
import { invokeHandoff, registerHandoff } from "../src/commands/handoffs.ts"
import { runIsolatedProbe } from "./isolatedProbe.ts"

describe("command runtime", () => {
	test("Linear commands share dispatch and reject unavailable or hidden actions", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { registerHandoff } from "./src/commands/handoffs.ts"
			import { linearAvailableActionsAtom } from "./src/commands/linear.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			import { filterModeAtom } from "./src/ui/filter/atoms.ts"
			const registry = AtomRegistry.make()
			const called = []
			const unregister = registerHandoff("linear.expandAllPrs", () => called.push("expand"))
			const run = (id) => Effect.runPromise(dispatchCommand(id).pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)))
			registry.set(workspaceSurfaceAtom, "linear")
			await run("linear.expandAllPrs")
			registry.set(linearAvailableActionsAtom, ["expandAllPrs"])
			await run("linear.expandAllPrs")
			await run("filter.open")
			registry.set(workspaceSurfaceAtom, "pullRequests")
			await run("linear.expandAllPrs")
			console.log(JSON.stringify({ called, filter: registry.get(filterModeAtom) }))
			unregister()
			registry.dispose()
		`
		expect(JSON.parse(await runIsolatedProbe(probe))).toEqual({ called: ["expand"], filter: false })
	})

	test("an actual workspace command resets cross-view state", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { commentsViewActiveAtom } from "./src/ui/comments/atoms.ts"
			import { detailFullViewAtom } from "./src/ui/detail/atoms.ts"
			import { diffCommentRangeStartIndexAtom, diffFullViewAtom } from "./src/ui/diff/atoms.ts"
			import { filterModeAtom } from "./src/ui/filter/atoms.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			const registry = AtomRegistry.make()
			registry.set(detailFullViewAtom, true)
			registry.set(diffFullViewAtom, true)
			registry.set(commentsViewActiveAtom, true)
			registry.set(diffCommentRangeStartIndexAtom, 4)
			registry.set(filterModeAtom, true)
			await Effect.runPromise(dispatchCommand("workspace.issues").pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)))
			const first = { surface: registry.get(workspaceSurfaceAtom), detail: registry.get(detailFullViewAtom), diff: registry.get(diffFullViewAtom), comments: registry.get(commentsViewActiveAtom), range: registry.get(diffCommentRangeStartIndexAtom), filter: registry.get(filterModeAtom) }
			registry.set(detailFullViewAtom, true)
			await Effect.runPromise(dispatchCommand("workspace.issues").pipe(Effect.provideService(AtomRegistry.AtomRegistry, registry)))
			console.log(JSON.stringify({ first, disabledDetail: registry.get(detailFullViewAtom) }))
		`
		const stdout = await runIsolatedProbe(probe)
		expect(JSON.parse(stdout)).toEqual({
			first: { surface: "issues", detail: false, diff: false, comments: false, range: null, filter: false },
			disabledDetail: true,
		})
	})

	test("pull.copy-metadata copies branch, review, and check metadata", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { Clipboard } from "./src/services/Clipboard.ts"
			import { noticeAtom } from "./src/ui/notice/atoms.ts"
			import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			const registry = AtomRegistry.make({ initialValues: [
				[workspaceSurfaceAtom, "pullRequests"],
				[selectedPullRequestAtom, {
					repository: "owner/repo", number: 42, title: "Fix metadata copying",
					url: "https://github.com/owner/repo/pull/42",
					headRefName: "fix/metadata", baseRefName: "main", reviewStatus: "approved",
					checkSummary: "checks 2/4",
					checks: [
						{ name: "lint", status: "completed", conclusion: "success" },
						{ name: "test", status: "completed", conclusion: "failure" },
						{ name: "build", status: "completed", conclusion: "timed_out" },
						{ name: "docs", status: "completed", conclusion: "skipped" },
					],
				}],
			] })
			const copies = []
			await Effect.runPromise(dispatchCommand("pull.copy-metadata").pipe(
				Effect.provideService(AtomRegistry.AtomRegistry, registry),
				Effect.provideService(Clipboard, { copy: (text) => Effect.sync(() => { copies.push(text) }) }),
			))
			console.log(JSON.stringify({ copies, notice: registry.get(noticeAtom) }))
			registry.dispose()
		`
		const stdout = await runIsolatedProbe(probe)
		expect(JSON.parse(stdout)).toEqual({
			copies: [
				[
					"Fix metadata copying",
					"owner/repo #42",
					"https://github.com/owner/repo/pull/42",
					"branch: fix/metadata -> main",
					"review: approved",
					"checks 2/4",
					"failing checks: test, build",
				].join("\n"),
			],
			notice: "Pull request metadata copied",
		})
	})

	test("pull.copy-url copies only the pull request link", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { Clipboard } from "./src/services/Clipboard.ts"
			import { noticeAtom } from "./src/ui/notice/atoms.ts"
			import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			const registry = AtomRegistry.make({ initialValues: [
				[workspaceSurfaceAtom, "pullRequests"],
				[selectedPullRequestAtom, {
					repository: "owner/repo", number: 42, title: "Copy this link",
					url: "https://github.com/owner/repo/pull/42",
				}],
			] })
			const copies = []
			await Effect.runPromise(dispatchCommand("pull.copy-url").pipe(
				Effect.provideService(AtomRegistry.AtomRegistry, registry),
				Effect.provideService(Clipboard, { copy: (text) => Effect.sync(() => { copies.push(text) }) }),
			))
			console.log(JSON.stringify({ copies, notice: registry.get(noticeAtom) }))
			registry.dispose()
		`
		const stdout = await runIsolatedProbe(probe)
		expect(JSON.parse(stdout)).toEqual({
			copies: ["https://github.com/owner/repo/pull/42"],
			notice: "Pull request link copied",
		})
	})

	test("issue.copy-metadata copies comment count and labels", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { Clipboard } from "./src/services/Clipboard.ts"
			import { selectedIssueAtom } from "./src/ui/issues/atoms.ts"
			import { noticeAtom } from "./src/ui/notice/atoms.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			const registry = AtomRegistry.make({ initialValues: [
				[workspaceSurfaceAtom, "issues"],
				[selectedIssueAtom, {
					repository: "owner/repo", number: 43, title: "Missing clipboard fields",
					url: "https://github.com/owner/repo/issues/43", commentCount: 3,
					labels: [{ name: "bug", color: null }, { name: "clipboard", color: null }],
				}],
			] })
			const copies = []
			await Effect.runPromise(dispatchCommand("issue.copy-metadata").pipe(
				Effect.provideService(AtomRegistry.AtomRegistry, registry),
				Effect.provideService(Clipboard, { copy: (text) => Effect.sync(() => { copies.push(text) }) }),
			))
			console.log(JSON.stringify({ copies, notice: registry.get(noticeAtom) }))
			registry.dispose()
		`
		const stdout = await runIsolatedProbe(probe)
		expect(JSON.parse(stdout)).toEqual({
			copies: [["Missing clipboard fields", "owner/repo #43", "https://github.com/owner/repo/issues/43", "3 comments", "labels: bug, clipboard"].join("\n")],
			notice: "Issue metadata copied",
		})
	})

	test("diff.copy-markdown-source fetches the live PR-head file and copies it", async () => {
		const probe = `
			import { Effect } from "effect"
			import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
			import { dispatchCommand } from "./src/commands/dispatch.ts"
			import { Clipboard } from "./src/services/Clipboard.ts"
			import { GitHubService } from "./src/services/GitHubService.ts"
			import { noticeAtom } from "./src/ui/notice/atoms.ts"
			import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
			import { diffFullViewAtom, pullRequestDiffCacheAtom } from "./src/ui/diff/atoms.ts"
			import { pullRequestDiffKey } from "./src/ui/diff.ts"
			import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
			const pr = { repository: "owner/repo", number: 42, title: "Docs", url: "https://github.com/owner/repo/pull/42", headRefOid: "abc123" }
			const registry = AtomRegistry.make({ initialValues: [
				[workspaceSurfaceAtom, "pullRequests"],
				[selectedPullRequestAtom, pr],
				[diffFullViewAtom, true],
				[pullRequestDiffCacheAtom, { [pullRequestDiffKey(pr)]: { _tag: "Ready", patch: "", files: [{ name: "docs/guide.md", filetype: "markdown", patch: "" }] } }],
			] })
			const copies = []
			const requests = []
			await Effect.runPromise(dispatchCommand("diff.copy-markdown-source").pipe(
				Effect.provideService(AtomRegistry.AtomRegistry, registry),
				Effect.provideService(GitHubService, { getFileContent: (repository, path, ref) => Effect.sync(() => { requests.push([repository, path, ref]); return "# Complete guide" }) }),
				Effect.provideService(Clipboard, { copy: (text) => Effect.sync(() => { copies.push(text) }) }),
			))
			console.log(JSON.stringify({ requests, copies, notice: registry.get(noticeAtom) }))
			registry.dispose()
		`
		const stdout = await runIsolatedProbe(probe)
		expect(JSON.parse(stdout)).toEqual({
			requests: [["owner/repo", "docs/guide.md", "refs/pull/42/head"]],
			copies: ["# Complete guide"],
			notice: "Copied docs/guide.md",
		})
	})

	test("handoff cleanup cannot remove a newer registration", () => {
		const calls: string[] = []
		const cleanFirst = registerHandoff("quit", () => calls.push("first"))
		const cleanSecond = registerHandoff("quit", () => calls.push("second"))

		cleanFirst()
		invokeHandoff("quit")
		cleanSecond()
		invokeHandoff("quit")

		expect(calls).toEqual(["second"])
	})
})
