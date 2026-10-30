import type { IssueItem, PullRequestItem } from "../domain.js"
import type { PullRequestSessionsFor } from "../faplex.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { RepositoryListItem } from "../ui/RepoList.js"

export interface UseListSelectionSteppingInput {
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly visiblePullRequests: readonly PullRequestItem[]
	readonly issues: readonly IssueItem[]
	readonly repositoryItems: readonly RepositoryListItem[]
	readonly loadMoreSlotAvailable: boolean
	readonly issueLoadMoreSlotAvailable: boolean
	readonly groupStarts: readonly number[]
	readonly getCurrentGroupIndex: (current: number) => number
	readonly setSelectedIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedIssueIndex: (next: number | ((current: number) => number)) => void
	readonly setSelectedRepositoryIndex: (next: number | ((current: number) => number)) => void
	readonly pullRequestSessionsFor: PullRequestSessionsFor
	/** Read at keypress, not render: a burst of j/k lands before the next render. */
	readonly readSelection: () => { readonly index: number; readonly session: { readonly url: string; readonly key: string } | null }
	readonly setSelectedSession: (next: { readonly url: string; readonly key: string } | null) => void
}

export interface ListSelectionStepping {
	readonly stepSelected: (delta: number) => void
	readonly stepSelectedDown: (count?: number) => void
	readonly stepSelectedUp: (count?: number) => void
	readonly stepSelectedDownWithLoadMore: () => void
	readonly stepSelectedUpWrap: () => void
	readonly moveSelectedToPreviousGroup: () => void
	readonly moveSelectedToNextGroup: () => void
}

/**
 * Movement helpers shared across surfaces. Each helper routes to the right
 * list (repo/issue/PR) based on `activeWorkspaceSurface`.
 *
 * For the PR list, when `loadMoreSlotAvailable` is true the valid index range
 * is `[0, visiblePullRequests.length]` — one past the last PR represents the
 * load-more pseudo-row. Stepping down past the tail lands on it; pressing
 * Enter there triggers `loadMorePullRequests` via the keymap layer (not from
 * here). j-wrap behaviour at the very bottom wraps to 0 like before.
 *
 * Up-stepping never wraps — PR/Issue lists are long and load lazily, so wrap-
 * to-bottom would jump past unloaded rows.
 *
 * j/k also visit the agent session rows under each PR; every other move lands
 * on a PR row.
 */
export const useListSelectionStepping = ({
	activeWorkspaceSurface,
	visiblePullRequests,
	issues,
	repositoryItems,
	loadMoreSlotAvailable,
	issueLoadMoreSlotAvailable,
	groupStarts,
	getCurrentGroupIndex,
	setSelectedIndex,
	setSelectedIssueIndex,
	setSelectedRepositoryIndex,
	pullRequestSessionsFor,
	readSelection,
	setSelectedSession,
}: UseListSelectionSteppingInput): ListSelectionStepping => {
	const sessionsAt = (index: number) => {
		const pullRequest = visiblePullRequests[index]
		return pullRequest ? { url: pullRequest.url, keys: pullRequestSessionsFor(pullRequest).map((session) => session.key) } : { url: "", keys: [] }
	}
	/** The selected PR's session keys and the cursor's position among them (-1 on the PR row). */
	const sessionCursor = () => {
		const { index, session } = readSelection()
		const here = sessionsAt(index)
		return { index, here, at: session?.url === here.url ? here.keys.indexOf(session.key) : -1 }
	}
	const setSelectedPullRequestIndex: typeof setSelectedIndex = (next) => {
		setSelectedSession(null)
		setSelectedIndex(next)
	}
	const prMaxIndex = () => Math.max(0, visiblePullRequests.length - 1 + (loadMoreSlotAvailable ? 1 : 0))
	const issueMaxIndex = () => Math.max(0, issues.length - 1 + (issueLoadMoreSlotAvailable ? 1 : 0))
	const moveSelectedToPreviousGroup = () =>
		setSelectedPullRequestIndex((current) => {
			if (activeWorkspaceSurface !== "pullRequests") return current
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup <= 0) return groupStarts[groupStarts.length - 1]!
			return groupStarts[currentGroup - 1]!
		})
	const moveSelectedToNextGroup = () =>
		setSelectedPullRequestIndex((current) => {
			if (activeWorkspaceSurface !== "pullRequests") return current
			if (visiblePullRequests.length === 0 || groupStarts.length === 0) return 0
			const currentGroup = getCurrentGroupIndex(current)
			if (currentGroup >= groupStarts.length - 1) return groupStarts[0]!
			return groupStarts[currentGroup + 1]!
		})
	const stepSelected = (delta: number) =>
		activeWorkspaceSurface === "repos"
			? setSelectedRepositoryIndex((current) => {
					if (repositoryItems.length === 0) return 0
					return Math.max(0, Math.min(repositoryItems.length - 1, current + delta))
				})
			: activeWorkspaceSurface === "issues"
				? setSelectedIssueIndex((current) => {
						if (issues.length === 0) return 0
						return Math.max(0, Math.min(issueMaxIndex(), current + delta))
					})
				: setSelectedPullRequestIndex((current) => {
						if (visiblePullRequests.length === 0) return 0
						return Math.max(0, Math.min(prMaxIndex(), current + delta))
					})
	const stepSelectedDown = (count = 1) => stepSelected(count)
	const stepSelectedUp = (count = 1) => stepSelected(-count)
	const stepSelectedDownWithLoadMore = () => {
		if (activeWorkspaceSurface === "repos") {
			setSelectedRepositoryIndex((current) => {
				if (repositoryItems.length === 0) return 0
				return current >= repositoryItems.length - 1 ? 0 : current + 1
			})
			return
		}
		if (activeWorkspaceSurface === "issues") {
			setSelectedIssueIndex((current) => {
				if (issues.length === 0) return 0
				const max = issueMaxIndex()
				return current >= max ? 0 : current + 1
			})
			return
		}
		const { here, at } = sessionCursor()
		if (at + 1 < here.keys.length) {
			setSelectedSession({ url: here.url, key: here.keys[at + 1]! })
			return
		}
		setSelectedPullRequestIndex((current) => {
			if (visiblePullRequests.length === 0) return 0
			const max = prMaxIndex()
			return current >= max ? 0 : current + 1
		})
	}
	const stepSelectedUpWrap = () => {
		if (activeWorkspaceSurface === "repos") return setSelectedRepositoryIndex((current) => Math.max(0, current - 1))
		if (activeWorkspaceSurface === "issues") return setSelectedIssueIndex((current) => Math.max(0, current - 1))
		const { index, here, at } = sessionCursor()
		if (at > 0) return setSelectedSession({ url: here.url, key: here.keys[at - 1]! })
		if (at === 0) return setSelectedSession(null)
		if (index <= 0) return
		const above = sessionsAt(index - 1)
		setSelectedIndex(index - 1)
		setSelectedSession(above.keys.length ? { url: above.url, key: above.keys[above.keys.length - 1]! } : null)
	}

	return { stepSelected, stepSelectedDown, stepSelectedUp, stepSelectedDownWithLoadMore, stepSelectedUpWrap, moveSelectedToPreviousGroup, moveSelectedToNextGroup }
}
