import { expect, test } from "bun:test"
import type { PullRequestItem } from "../src/domain.ts"
import { useListSelectionStepping } from "../src/hooks/useListSelectionStepping.ts"

const pr = (number: number) => ({ number, repository: "owner/repo", url: `https://github.com/owner/repo/pull/${number}` }) as PullRequestItem
const session = (key: string) => ({ key, machine: "m", harness: "claude", title: key, cwd: "/", status: "done" as const, detail: "", updatedAt: 0, archived: false, tags: [] })

/** Two PRs; the first has sessions a and b. Returns the row the cursor visits on each step. */
const walk = (keys: string) => {
	let index = 0
	let selected: { url: string; key: string } | null = null
	const stepping = useListSelectionStepping({
		activeWorkspaceSurface: "pullRequests",
		visiblePullRequests: [pr(1), pr(2)],
		issues: [],
		repositoryItems: [],
		loadMoreSlotAvailable: false,
		issueLoadMoreSlotAvailable: false,
		groupStarts: [0],
		getCurrentGroupIndex: () => 0,
		setSelectedIndex: (next) => {
			index = typeof next === "function" ? next(index) : next
		},
		setSelectedIssueIndex: () => {},
		setSelectedRepositoryIndex: () => {},
		pullRequestSessionsFor: (p) => (p.number === 1 ? [session("a"), session("b")] : []),
		readSelection: () => ({ index, session: selected }),
		setSelectedSession: (next) => {
			selected = next
		},
	})
	return [...keys].map((key) => {
		if (key === "j") stepping.stepSelectedDownWithLoadMore()
		else stepping.stepSelectedUpWrap()
		return selected ? `#${index + 1}/${selected.key}` : `#${index + 1}`
	})
}

test("j and k step through a PR's session rows before the next PR", () => {
	expect(walk("jjjkkkk")).toEqual(["#1/a", "#1/b", "#2", "#1/b", "#1/a", "#1", "#1"])
})
