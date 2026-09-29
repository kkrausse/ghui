import { expect, test } from "bun:test"
import { githubPullRequestRoute } from "../src/githubPullRequestRoute.js"

test("routes only exact public GitHub PR roots", () => {
	expect(githubPullRequestRoute("https://github.com/acme/widgets/pull/783/")).toEqual({ repository: "acme/widgets", number: 783, url: "https://github.com/acme/widgets/pull/783" })
	for (const url of ["https://github.com.evil.test/acme/widgets/pull/1", "https://github.com/acme/widgets/pull/1/files", "https://github.com/acme/widgets/pull/1#discussion_r123"])
		expect(githubPullRequestRoute(url)).toBeNull()
})
