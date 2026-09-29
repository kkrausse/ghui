import { RegistryContext, useAtomSet } from "@effect/atom-react"
import { useCallback, useContext } from "react"
import { useRequest } from "./useRequest.js"
import {
	addPullRequestLabelAtom,
	closePullRequestAtom,
	prewarmRepositoryDetailsAtom,
	pruneCacheAtom,
	removePullRequestLabelAtom,
	toggleDraftAtom,
} from "../ui/pullRequests/atoms.js"
import { addIssueLabelAtom, closeIssueAtom, issuesAtom, removeIssueLabelAtom } from "../ui/issues/atoms.js"
import { listIssueCommentsAtom, listPullRequestCommentsAtom } from "../ui/comments/atoms.js"
import { openUrlAtom, submitPullRequestReviewAtom } from "../services/systemAtoms.js"
import { readRepoRollupAtom, readWorkspacePreferencesAtom, writeWorkspacePreferencesAtom } from "../workspace/atoms.js"

/**
 * Bundle of isolated requests and UI action setters the App
 * fires. Stays a separate hook so the bulk of action wiring isn't
 * inlined in App.tsx — and so adding a new action only touches this
 * file plus the consuming surface.
 */
export const useGitHubActions = () => {
	const addPullRequestLabel = useRequest(addPullRequestLabelAtom)
	const removePullRequestLabel = useRequest(removePullRequestLabelAtom)
	const addIssueLabel = useRequest(addIssueLabelAtom)
	const removeIssueLabel = useRequest(removeIssueLabelAtom)
	const toggleDraftStatus = useRequest(toggleDraftAtom)
	const listPullRequestComments = useRequest(listPullRequestCommentsAtom)
	const listIssueComments = useRequest(listIssueCommentsAtom)
	const readWorkspacePreferences = useAtomSet(readWorkspacePreferencesAtom, { mode: "promise" })
	const writeWorkspacePreferences = useAtomSet(writeWorkspacePreferencesAtom, { mode: "promise" })
	const pruneCache = useAtomSet(pruneCacheAtom, { mode: "promise" })
	const prewarmRepositoryDetails = useAtomSet(prewarmRepositoryDetailsAtom, { mode: "promise" })
	const closePullRequest = useRequest(closePullRequestAtom)
	const closeIssue = useRequest(closeIssueAtom)
	const registry = useContext(RegistryContext)
	const refreshIssues = useCallback(() => registry.refresh(issuesAtom), [registry])
	const submitPullRequestReview = useRequest(submitPullRequestReviewAtom)
	const openUrl = useAtomSet(openUrlAtom, { mode: "promise" })
	const readRepoRollup = useAtomSet(readRepoRollupAtom, { mode: "promise" })
	return {
		addPullRequestLabel,
		removePullRequestLabel,
		addIssueLabel,
		removeIssueLabel,
		toggleDraftStatus,
		listPullRequestComments,
		listIssueComments,
		readWorkspacePreferences,
		writeWorkspacePreferences,
		pruneCache,
		prewarmRepositoryDetails,
		closePullRequest,
		closeIssue,
		refreshIssues,
		submitPullRequestReview,
		openUrl,
		readRepoRollup,
	}
}
