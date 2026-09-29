import { describe, expect, test } from "bun:test"
import { buildDetailViewCtx } from "../src/keymap/contexts/detailViewCtx.ts"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { detailViewKeymap } from "../src/keymap/detailView.ts"

const detailCtx = (activeSurface: "issues" | "pullRequests") => {
	const called: string[] = []
	return {
		called,
		ctx: buildDetailViewCtx({
			halfPage: 4,
			activeSurface,
			scrollDetailFullViewBy: (delta) => called.push(`scroll:${delta}`),
			scrollDetailFullViewTo: () => {},
			runCommandById: (id) => called.push(id),
		}),
	}
}

describe("buildDetailViewCtx", () => {
	test("conversation bindings preserve PR actions and distinguish block navigation from scrolling", () => {
		const { ctx, called } = detailCtx("pullRequests")
		const dispatcher = createDispatcher(detailViewKeymap, () => ctx)
		for (const key of ["y", "shift+y", "shift+r", "e", "x", "down", "up", "pagedown", "ctrl+u", "return", "escape"]) dispatcher.dispatch(parseKey(key))
		expect(called).toEqual([
			"comments.copy-link",
			"pull.copy-url",
			"pull.submit-review",
			"pull.open-editor",
			"pull.close",
			"conversation.next",
			"conversation.previous",
			"scroll:4",
			"scroll:-4",
			"conversation.confirm",
			"detail.close",
		])
	})
	test("routes issue detail refresh and browser actions to issue commands and copies the selected link", () => {
		const { ctx, called } = detailCtx("issues")

		ctx.refresh()
		ctx.copyLink()
		ctx.openInBrowser()

		expect(called).toEqual(["issue.refresh", "comments.copy-link", "issue.open-browser"])
	})

	test("routes pull request link copying to the URL-only command", () => {
		const { ctx, called } = detailCtx("pullRequests")

		ctx.copyPullRequestUrl()

		expect(ctx.pullRequestActive).toBe(true)
		expect(called).toEqual(["pull.copy-url"])
	})
})
