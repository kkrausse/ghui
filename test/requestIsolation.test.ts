import { expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

test("overlapping entity requests retain their own results, errors, and mutation lifetimes", async () => {
	const stdout = await runIsolatedProbe(
		`
		import assert from "node:assert/strict"
		import { Context, Effect } from "effect"
		import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
		import * as Registry from "effect/unstable/reactivity/AtomRegistry"
		import { githubRuntime } from "./src/services/runtime.ts"
		import { GitHubService } from "./src/services/GitHubService.ts"
		import { CacheService } from "./src/services/CacheService.ts"
		import { runRequest } from "./src/hooks/useRequest.ts"
		import { useCommentsLoader } from "./src/hooks/useCommentsLoader.ts"
		import * as comments from "./src/ui/comments/atoms.ts"
		import * as prs from "./src/ui/pullRequests/atoms.ts"
		import * as issues from "./src/ui/issues/atoms.ts"
		import { submitPullRequestReviewAtom } from "./src/services/systemAtoms.ts"

		const pending = []
		const service = new Proxy({}, { get: (_, method) => (...args) => Effect.callback((resume) => {
			const entry = { method, args, resume, interrupted: false }
			pending.push(entry)
			return Effect.sync(() => { entry.interrupted = true })
		}) })
		const context = Context.make(GitHubService, service).pipe(Context.add(CacheService, service))
		const registry = Registry.make({ initialValues: [[githubRuntime, AsyncResult.success(context)]] })
		const waitFor = async (count) => {
			for (let i = 0; pending.length < count && i < 100; i++) await Bun.sleep(1)
			assert.equal(pending.length, count)
		}
		const cases = [
			[comments.listPullRequestCommentsAtom, { repository: "a/repo", number: 7 }, { repository: "b/repo", number: 7 }],
			[comments.listIssueCommentsAtom, { repository: "a/repo", number: 7 }, { repository: "a/repo", number: 8 }],
			[prs.getPullRequestMergeInfoAtom, { repository: "a/repo", number: 7 }, { repository: "b/repo", number: 7 }],
			[prs.getRepositoryMergeMethodsAtom, "a/repo", "b/repo"],
			[prs.fetchRepositoryDetailsAtom, "a/repo", "b/repo"],
			[prs.readCachedRepositoryDetailsAtom, "a/repo", "b/repo"],
			[prs.writeRepositoryDetailsAtom, { repository: "a/repo" }, { repository: "b/repo" }],
			[prs.listOpenPullRequestPageAtom, { repository: "a/repo", after: "A" }, { repository: "b/repo", after: "B" }],
			[issues.listIssuePageAtom, { repository: "a/repo", after: "A" }, { repository: "b/repo", after: "B" }],
			[prs.writeQueueCacheAtom, { viewer: "v", load: "A" }, { viewer: "v", load: "B" }],
			[issues.writeIssueQueueAtom, { viewer: "v", load: "A" }, { viewer: "v", load: "B" }],
			...[prs.addPullRequestLabelAtom, prs.removePullRequestLabelAtom, prs.toggleDraftAtom, prs.mergePullRequestAtom, prs.closePullRequestAtom,
				issues.addIssueLabelAtom, issues.removeIssueLabelAtom, issues.closeIssueAtom,
				comments.createPullRequestCommentAtom, comments.createPullRequestIssueCommentAtom, comments.replyToReviewCommentAtom,
				comments.editPullRequestIssueCommentAtom, comments.editReviewCommentAtom, comments.deletePullRequestIssueCommentAtom,
				comments.deleteReviewCommentAtom, submitPullRequestReviewAtom].map((request) => [request,
				{ repository: "a/repo", number: 7, commentId: "A", body: "first", label: "first" },
				{ repository: "b/repo", number: 7, commentId: "B", body: "second", label: "second" }]),
			// Same-PR operations also need independent outcomes.
			[comments.createPullRequestIssueCommentAtom, { repository: "a/repo", number: 7, body: "first" }, { repository: "a/repo", number: 7, body: "second" }],
		]
		try {
			for (const [request, a, b] of cases) {
				pending.length = 0
				const first = runRequest(registry, request, a)
				const second = runRequest(registry, request, b)
				await waitFor(2)
				assert.notDeepEqual(pending[0].args, pending[1].args)
				assert.equal(pending[0].interrupted, false)
				pending[1].resume(Effect.succeed("B"))
				assert.equal(await second, "B")
				pending[0].resume(Effect.succeed("A"))
				assert.equal(await first, "A")
			}
			pending.length = 0
			const failed = runRequest(registry, prs.getPullRequestMergeInfoAtom, { repository: "a/repo", number: 1 }).catch(() => "own failure")
			const succeeded = runRequest(registry, prs.getPullRequestMergeInfoAtom, { repository: "a/repo", number: 2 })
			await waitFor(2)
			pending[0].resume(Effect.fail(new Error("A failed")))
			pending[1].resume(Effect.succeed("B succeeded"))
			assert.deepEqual(await Promise.all([failed, succeeded]), ["own failure", "B succeeded"])

			// Exercise the real conversation loader's cache writes, not just return values.
			pending.length = 0
			let states = {}, cache = {}
			const loader = useCommentsLoader({
				readCommentsLoadState: () => states,
				setPullRequestComments: (update) => { cache = update(cache) },
				setPullRequestCommentsLoaded: (update) => { states = update(states) },
				listPullRequestComments: (input) => runRequest(registry, comments.listPullRequestCommentsAtom, input),
				listIssueComments: (input) => runRequest(registry, comments.listIssueCommentsAtom, input),
				flashNotice: (message) => { throw new Error(message) },
			})
			loader.loadPullRequestComments({ repository: "a/repo", number: 7, headRefOid: "sha" })
			loader.loadPullRequestComments({ repository: "b/repo", number: 7, headRefOid: "sha" })
			await waitFor(2)
			pending[1].resume(Effect.succeed([{ id: "B" }]))
			pending[0].resume(Effect.succeed([{ id: "A" }]))
			await Bun.sleep(0)
			assert.deepEqual(cache["a/repo#7:sha"], [{ id: "A" }])
			assert.deepEqual(cache["b/repo#7:sha"], [{ id: "B" }])
			console.log("ok")
		} finally { registry.dispose() }
	`,
		{ GHUI_MOCK_PR_COUNT: "2", GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off" },
	)
	expect(stdout).toBe("ok")
})
