import { expect, test } from "bun:test"
import { runIsolatedProbe } from "./isolatedProbe.ts"

test("conversation copying targets stable comment identity while PR copying stays global", async () => {
	const stdout = await runIsolatedProbe(`
		import { Effect } from "effect"
		import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
		import { dispatchCommand } from "./src/commands/dispatch.ts"
		import { Clipboard } from "./src/services/Clipboard.ts"
		import { conversationSelectionAtom, selectedCommentKeyAtom, pullRequestCommentsAtom, selectedOrderedCommentAtom, selectedCommentSubjectAtom } from "./src/ui/comments/atoms.ts"
		import { detailFullViewAtom } from "./src/ui/detail/atoms.ts"
		import { selectedPullRequestAtom } from "./src/ui/pullRequests/atoms.ts"
		import { workspaceSurfaceAtom } from "./src/workspace/atoms.ts"
		import { noticeAtom } from "./src/ui/notice/atoms.ts"
		const pr = { repository: "owner/repo", number: 42, url: "https://github.com/owner/repo/pull/42" }
		const comment = { _tag: "comment", id: "100", url: pr.url + "#issuecomment-100", author: "alex", body: "Hello" }
		const registry = AtomRegistry.make({ initialValues: [
			[workspaceSurfaceAtom, "pullRequests"], [selectedPullRequestAtom, pr],
			[selectedCommentSubjectAtom, pr], [selectedCommentKeyAtom, "pr42"],
			[detailFullViewAtom, true], [pullRequestCommentsAtom, {pr42: [comment]}],
		] })
		// Keep the same state mounted as the UI while clipboard work is async.
		const unmount = [workspaceSurfaceAtom, selectedPullRequestAtom, selectedCommentSubjectAtom,
			selectedCommentKeyAtom, detailFullViewAtom, pullRequestCommentsAtom,
			conversationSelectionAtom, selectedOrderedCommentAtom, noticeAtom].map(atom => registry.mount(atom))
		const copies = []
		const pendingNotices = []
		const notices = []
		const run = id => Effect.runPromise(dispatchCommand(id).pipe(
			Effect.provideService(AtomRegistry.AtomRegistry, registry),
			Effect.provideService(Clipboard, { copy: text => Effect.gen(function* () {
				pendingNotices.push(registry.get(noticeAtom))
				yield* Effect.sleep("1 millis")
				copies.push(text)
			}) }),
		)).then(() => notices.push(registry.get(noticeAtom)))
		await run("comments.copy-link")
		registry.set(conversationSelectionAtom, { pr42: "100" })
		await run("comments.copy-link")
		await run("pull.copy-url")
		registry.set(pullRequestCommentsAtom, {pr42: [{...comment, id: "99"}, comment]})
		const selectedAfterInsert = registry.get(selectedOrderedCommentAtom)?.id
		await run("comments.copy-link")
		registry.set(pullRequestCommentsAtom, {pr42: [{...comment, url: "https://api.github.com/repos/owner/repo/issues/comments/100"}]})
		await run("comments.copy-link")
		console.log(JSON.stringify({copies, selectedAfterInsert, notices, pendingNotices}))
		unmount.forEach(dispose => dispose())
		registry.dispose()
	`)
	const pr = "https://github.com/owner/repo/pull/42"
	expect(JSON.parse(stdout)).toEqual({
		copies: [pr, `${pr}#issuecomment-100`, pr, `${pr}#issuecomment-100`],
		selectedAfterInsert: "100",
		pendingNotices: ["Copying pull request link…", "Copying comment link…", "Comment link copied", "Copying comment link…"],
		notices: ["Pull request link copied", "Comment link copied", "Pull request link copied", "Comment link copied", "No comment permalink available yet"],
	})
})
