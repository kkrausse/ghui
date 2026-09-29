import type { IssueItem, PullRequestComment, PullRequestItem } from "../domain.js"
import { errorMessage } from "../errors.js"
import { RegistryContext } from "@effect/atom-react"
import { useContext } from "react"
import { rememberLinkedPullRequestPage, restoreLinkedPullRequestPage } from "../workspace/linearPullRequestNavigation.js"

interface OrderedComment {
	readonly comment: PullRequestComment
}

export interface UseCommentsViewActionsInput {
	readonly activeWorkspaceSurface: string
	readonly selectedIssue: IssueItem | null
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedComments: readonly PullRequestComment[]
	readonly orderedComments: readonly OrderedComment[]
	readonly commentsViewSelection: number
	readonly commentsRowCount: number
	readonly selectedOrderedComment: PullRequestComment | null
	readonly setCommentsViewActive: (next: boolean) => void
	readonly setDetailFullView: (next: boolean) => void
	readonly setDiffFullView: (next: boolean) => void
	readonly setCommentsViewSelection: (next: number | ((current: number) => number)) => void
	readonly loadPullRequestComments: (pr: PullRequestItem, force?: boolean) => void
	readonly loadIssueComments: (issue: IssueItem, force?: boolean) => void
	readonly openNewIssueCommentModal: () => void
	readonly openReplyToSelectedComment: () => void
	readonly openUrl: (url: string) => Promise<unknown>
	readonly flashNotice: (msg: string) => void
}

export interface CommentsViewActions {
	readonly openCommentsView: () => void
	readonly closeCommentsView: () => void
	readonly moveCommentsSelection: (delta: number) => void
	readonly setCommentsSelection: (index: number) => void
	readonly confirmCommentSelection: () => void
	readonly openSelectedCommentInBrowser: () => void
	readonly refreshSelectedComments: () => void
}

/**
 * Imperative actions for the full-screen comments view. The view shows
 * either a PR's or an issue's comments; each action picks the right
 * subject based on `activeWorkspaceSurface`. j/k navigates the visual
 * (threaded) order via `commentsRowCount`, which accounts for reply
 * indentation and the trailing "new comment" placeholder row.
 */
export const useCommentsViewActions = ({
	activeWorkspaceSurface,
	selectedIssue,
	selectedPullRequest,
	selectedComments,
	orderedComments,
	commentsViewSelection,
	commentsRowCount,
	selectedOrderedComment,
	setCommentsViewActive,
	setDetailFullView,
	setDiffFullView,
	setCommentsViewSelection,
	loadPullRequestComments,
	loadIssueComments,
	openNewIssueCommentModal,
	openReplyToSelectedComment,
	openUrl,
	flashNotice,
}: UseCommentsViewActionsInput): CommentsViewActions => {
	const registry = useContext(RegistryContext)
	const openCommentsView = () => {
		if (activeWorkspaceSurface === "issues") {
			if (!selectedIssue) return
			loadIssueComments(selectedIssue, true)
		} else {
			if (!selectedPullRequest) return
			loadPullRequestComments(selectedPullRequest, true)
		}
		rememberLinkedPullRequestPage(registry, "comments")
		setCommentsViewActive(true)
		setDetailFullView(false)
		setDiffFullView(false)
		setCommentsViewSelection(
			Math.max(
				0,
				orderedComments.findIndex(({ comment }) => comment.id === selectedOrderedComment?.id),
			),
		)
	}

	const closeCommentsView = () => {
		setCommentsViewActive(false)
		restoreLinkedPullRequestPage(registry)
	}

	const moveCommentsSelection = (delta: number) =>
		setCommentsViewSelection((current) => {
			const max = commentsRowCount - 1
			return Math.max(0, Math.min(max, current + delta))
		})

	const setCommentsSelection = (index: number) => {
		const max = commentsRowCount - 1
		setCommentsViewSelection(Math.max(0, Math.min(max, index)))
	}

	const confirmCommentSelection = () => {
		if (commentsViewSelection >= selectedComments.length) {
			openNewIssueCommentModal()
			return
		}
		openReplyToSelectedComment()
	}

	const openSelectedCommentInBrowser = () => {
		const comment = selectedOrderedComment
		if (!comment?.url) return
		void openUrl(comment.url)
			.then(() => flashNotice(`Opened ${comment.url}`))
			.catch((error) => flashNotice(errorMessage(error)))
	}

	const refreshSelectedComments = () => {
		if (activeWorkspaceSurface === "issues") {
			if (selectedIssue) loadIssueComments(selectedIssue, true)
		} else if (selectedPullRequest) {
			loadPullRequestComments(selectedPullRequest, true)
		}
	}

	return { openCommentsView, closeCommentsView, moveCommentsSelection, setCommentsSelection, confirmCommentSelection, openSelectedCommentInBrowser, refreshSelectedComments }
}
