import { expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

test("diff loaders own live requests, recover orphaned markers, and protect the visible cache", async () => {
	const stdout = await runIsolatedProbe(
		`
import assert from "node:assert/strict"
import { Context, Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { githubRuntime } from "./src/services/runtime.ts"
import { GitHubService } from "./src/services/GitHubService.ts"
import { useDiffLoader } from "./src/hooks/useDiffLoader.ts"
import { pullRequestDiffCacheAtom, diffCommentsLoadedAtom, selectedDiffKeyAtom } from "./src/ui/diff/atoms.ts"
import { pullRequestDiffKey } from "./src/ui/diff.ts"

const pending = []
const service = new Proxy({}, { get: (_, method) => (...args) => Effect.callback((resume) => {
 const entry = { method, args, resume, interrupted: false }
 pending.push(entry)
 return Effect.sync(() => { entry.interrupted = true })
}) })
const pr = { repository: "a/repo", number: 1, url: "https://github.com/a/repo/pull/1", headRefOid: "sha" }
const key = pullRequestDiffKey(pr)
const registry = Registry.make({ initialValues: [
 [githubRuntime, AsyncResult.success(Context.make(GitHubService, service))],
 [selectedDiffKeyAtom, key],
] })
const releases = [registry.mount(githubRuntime), registry.mount(selectedDiffKeyAtom), registry.mount(pullRequestDiffCacheAtom), registry.mount(diffCommentsLoadedAtom)]
const notices = [], writes = []
let threads = {}
const makeLoader = (requestTimeoutMs = 1000) => useDiffLoader({ registry, requestTimeoutMs,
 setPullRequestDiffCache: (update) => { registry.update(pullRequestDiffCacheAtom, update); writes.push(registry.get(pullRequestDiffCacheAtom)[key]) },
 setDiffCommentsLoaded: (update) => registry.update(diffCommentsLoadedAtom, update),
 setDiffCommentThreads: (update) => { threads = update(threads) },
 flashNotice: (message) => notices.push(message),
})
const waitFor = async (predicate) => {
 for (let i = 0; !predicate() && i < 200; i++) await Bun.sleep(1)
 assert.ok(predicate(), "expected transition")
}
const state = () => registry.get(pullRequestDiffCacheAtom)[key]
try {
 const loader = makeLoader()
 registry.set(pullRequestDiffCacheAtom, { [key]: { _tag: "Loading" } })
 registry.set(diffCommentsLoadedAtom, { [key]: "loading" })
 loader.loadPullRequestDiff(pr, { includeComments: true })
 await waitFor(() => pending.length === 2)
 // Re-created loaders share ownership; stale Loading markers don't dedupe.
 makeLoader().loadPullRequestDiff(pr, { includeComments: true })
 assert.equal(pending.length, 2)
 pending.find((p) => p.method === "getPullRequestDiff").resume(Effect.succeed("first"))
 pending.find((p) => p.method === "listPullRequestReviewComments").resume(Effect.succeed([]))
 await waitFor(() => state()?._tag === "Ready" && registry.get(diffCommentsLoadedAtom)[key] === "ready")
 await Bun.sleep(0)

 // Unrelated revisions run concurrently and complete into their own keys.
 const other = { ...pr, number: 2 }
 const newer = { ...pr, headRefOid: "new-sha" }
 loader.loadPullRequestDiff(other)
 loader.loadPullRequestDiff(newer)
 await waitFor(() => pending.length === 4)
 pending[3].resume(Effect.succeed("new revision"))
 pending[2].resume(Effect.succeed("other PR"))
 await waitFor(() => registry.get(pullRequestDiffCacheAtom)[pullRequestDiffKey(newer)]?._tag === "Ready")
 assert.equal(registry.get(pullRequestDiffCacheAtom)[pullRequestDiffKey(other)].patch, "other PR")

 // Forced refresh interrupts the underlying keyed fetch, but only its newest
 // owner can publish, even though the earlier waiter follows the new result.
 loader.loadPullRequestDiff(pr, { force: true })
 await waitFor(() => pending.length === 5)
 loader.loadPullRequestDiff(pr, { force: true })
 await waitFor(() => pending.length === 6)
 assert.equal(pending[4].interrupted, true)
 const readyWrites = writes.filter((w) => w?._tag === "Ready").length
 pending[5].resume(Effect.succeed("latest"))
 await waitFor(() => state()?.patch === "latest")
 await Bun.sleep(0)
 assert.equal(writes.filter((w) => w?._tag === "Ready").length, readyWrites + 1)

 // Cache churn cannot evict the selected diff.
 for (let i = 0; i < 35; i++) {
  loader.loadPullRequestDiff({ ...pr, number: 100 + i })
  await waitFor(() => pending.length === 7 + i)
  pending.at(-1).resume(Effect.succeed("neighbor"))
  await Bun.sleep(0)
 }
 assert.equal(state().patch, "latest")
 assert.equal(Object.keys(registry.get(pullRequestDiffCacheAtom)).length, 32)

 // A stuck request settles to an error, releases ownership, and can be retried.
 const timeoutLoader = makeLoader(15)
 timeoutLoader.loadPullRequestDiff(pr, { force: true })
 await waitFor(() => state()?._tag === "Error")
 await Bun.sleep(0)
 assert.match(notices.at(-1), /timed out/)
 assert.equal(pending.at(-1).interrupted, true)
 const retryCount = pending.length
 timeoutLoader.loadPullRequestDiff(pr)
 await waitFor(() => pending.length === retryCount + 1)
 pending.at(-1).resume(Effect.succeed("recovered"))
 await waitFor(() => state()?.patch === "recovered")
 console.log("ok")
} finally { releases.forEach((release) => release()); registry.dispose() }
`,
		{ GHUI_MOCK_PR_COUNT: "2", GHUI_MOCK_WORKSPACE_PREFERENCES_PATH: "off" },
	)
	expect(stdout).toBe("ok")
})

test("visible diff fetching reacts to revision changes and missing cache entries", async () => {
	const stdout = await runIsolatedProbe(`
import assert from "node:assert/strict"
import React, { act } from "react"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot } from "@opentui/react"
import { useDiffPrefetch } from "./src/ui/diff/useDiffPrefetch.ts"
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const setup = await createTestRenderer({ width: 60, height: 16 })
const root = createRoot(setup.renderer)
const requests = []
const onPrefetch = (pr) => requests.push(pr.headRefOid)
const pr = { repository: "a/repo", number: 1, url: "https://github.com/a/repo/pull/1", headRefOid: "old" }
const Probe = (props) => { useDiffPrefetch(props); return null }
let updateProps
const Harness = () => {
 const [props, setProps] = React.useState({ pullRequest: null, fullView: false, diffState: undefined, onPrefetch, delayMs: 100 })
 updateProps = setProps
 return React.createElement(Probe, props)
}
act(() => root.render(React.createElement(Harness)))
const render = (pullRequest, fullView, diffState) => {
 act(() => {
  updateProps({ pullRequest, fullView, diffState, onPrefetch, delayMs: 100 })
 })
}
try {
 await render(pr, true, undefined)
 assert.deepEqual(requests, ["old"])
 await render(pr, true, { _tag: "Ready" })
 await render({ ...pr, headRefOid: "new" }, true, undefined)
 assert.deepEqual(requests, ["old", "new"])
 await render(pr, true, { _tag: "Ready" })
 await render(pr, true, undefined)
 assert.deepEqual(requests, ["old", "new", "old"])
 // Loading markers are checked against live ownership by the loader.
 await render(pr, true, { _tag: "Loading" })
 assert.deepEqual(requests, ["old", "new", "old", "old"])
 await render(pr, true, { _tag: "Error" })
 assert.equal(requests.length, 4) // No automatic error retry loop.
 await render(pr, false, undefined)
 assert.equal(requests.length, 4, "background prefetch should be delayed")
 await render({ ...pr, headRefOid: "new" }, false, undefined)
 await act(async () => { await Bun.sleep(150); await setup.renderOnce() })
 assert.equal(requests.at(-1), "new")
 assert.deepEqual(requests, ["old", "new", "old", "old", "new"]) // Old delayed prefetch was canceled.
 console.log("ok")
} finally { act(() => root.unmount()); setup.renderer.destroy() }
`)
	expect(stdout).toBe("ok")
})
