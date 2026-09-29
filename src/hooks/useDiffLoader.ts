import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { PullRequestItem, PullRequestReviewComment } from "../domain.js"
import { errorMessage } from "../errors.js"
import { capRecord } from "../recordCap.js"
import { diffCommentsLoadedAtom, pullRequestDiffCacheAtom, pullRequestDiffForRevision, pullRequestReviewCommentsForRevision, selectedDiffKeyAtom } from "../ui/diff/atoms.js"
import { PullRequestDiffState, pullRequestDiffKey, splitPatchFiles, type PullRequestDiffState as PullRequestDiffStateType } from "../ui/diff.js"
import { groupDiffCommentThreads, isLocalDiffComment } from "../ui/diff/comments.js"
import { pullRequestRevisionAtomKey } from "../ui/pullRequests/atoms.js"

// Cap of the in-memory diff/threads caches. One entry per PR-revision
// (url + headRefOid) ever opened — without a cap, day-long sessions
// accumulate every diff the user has ever scrolled through.
const DIFF_CACHE_CAP = 32
const REQUEST_TIMEOUT_MS = 60_000

// Shared across hook renders, but never across registries/application instances.
// Display-cache markers aren't locks: only these entries represent live work.
const requestsByRegistry = new WeakMap<AtomRegistry.AtomRegistry, { diffs: Map<string, object>; comments: Map<string, object> }>()

const requestsFor = (registry: AtomRegistry.AtomRegistry) => {
	let requests = requestsByRegistry.get(registry)
	if (!requests) {
		requests = { diffs: new Map(), comments: new Map() }
		requestsByRegistry.set(registry, requests)
	}
	return requests
}

type LoadStatus = "loading" | "ready"

export interface UseDiffLoaderInput {
	readonly registry: AtomRegistry.AtomRegistry
	readonly setPullRequestDiffCache: (next: (prev: Record<string, PullRequestDiffStateType>) => Record<string, PullRequestDiffStateType>) => void
	readonly setDiffCommentsLoaded: (next: (prev: Record<string, LoadStatus>) => Record<string, LoadStatus>) => void
	readonly setDiffCommentThreads: (next: (prev: Record<string, readonly PullRequestReviewComment[]>) => Record<string, readonly PullRequestReviewComment[]>) => void
	readonly flashNotice: (msg: string) => void
	readonly requestTimeoutMs?: number
}

export interface DiffLoader {
	readonly loadPullRequestReviewComments: (pullRequest: PullRequestItem, force?: boolean) => void
	readonly loadPullRequestDiff: (pullRequest: PullRequestItem, options?: { readonly force?: boolean; readonly includeComments?: boolean }) => void
}

/**
 * Loads revision-keyed patch and review-comment atoms. Threads are merged so
 * optimistic local comments survive a server refresh; the local-comment
 * heuristic is `isLocalDiffComment(comment)`. Ready caches are reused; in-flight
 * ownership deduplicates live work and rejects superseded completion writes.
 */
export const useDiffLoader = ({
	registry,
	setPullRequestDiffCache,
	setDiffCommentsLoaded,
	setDiffCommentThreads,
	flashNotice,
	requestTimeoutMs = REQUEST_TIMEOUT_MS,
}: UseDiffLoaderInput): DiffLoader => {
	const requests = requestsFor(registry)
	const capSelected = <T>(current: Record<string, T>) => capRecord(current, DIFF_CACHE_CAP, registry.get(selectedDiffKeyAtom))
	const loadPullRequestReviewComments = (pullRequest: PullRequestItem, force = false) => {
		const key = pullRequestDiffKey(pullRequest)
		const previousLoadState = registry.get(diffCommentsLoadedAtom)[key]
		if (!force && (previousLoadState === "ready" || requests.comments.has(key))) return
		const request = {}
		requests.comments.set(key, request)
		setDiffCommentsLoaded((current) => capSelected({ ...current, [key]: "loading" }))
		const commentsAtom = pullRequestReviewCommentsForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (force) registry.refresh(commentsAtom)
		void Effect.runPromise(
			AtomRegistry.getResult(registry, commentsAtom, { suspendOnWaiting: true }).pipe(
				Effect.timeoutOrElse({
					duration: requestTimeoutMs,
					orElse: () => Effect.fail(new Error(`Review comments for #${pullRequest.number} timed out. Press r to retry.`)),
				}),
			),
		)
			.then((comments) => {
				if (requests.comments.get(key) !== request) return
				setDiffCommentsLoaded((current) => capSelected({ ...current, [key]: "ready" }))
				setDiffCommentThreads((current) => {
					const prefix = `${key}:`
					const threads = groupDiffCommentThreads(pullRequest, comments)
					const next: Record<string, readonly PullRequestReviewComment[]> = Object.fromEntries(Object.entries(current).filter(([threadKey]) => !threadKey.startsWith(prefix)))
					for (const [threadKey, threadComments] of Object.entries(current)) {
						if (!threadKey.startsWith(prefix)) continue
						const localComments = threadComments.filter(isLocalDiffComment)
						if (localComments.length > 0) {
							next[threadKey] = [...(threads[threadKey] ?? []), ...localComments]
						}
					}
					for (const [threadKey, threadComments] of Object.entries(threads)) {
						if (!next[threadKey]) next[threadKey] = threadComments
					}
					// `diffCommentThreads` is keyed by `pullRequestDiffKey(pr):lineRef`
					// — one entry per thread. Cap to ~16 PRs worth of threads
					// (assume up to a few dozen threads per PR).
					return capRecord(next, DIFF_CACHE_CAP * 32)
				})
			})
			.catch((error) => {
				if (requests.comments.get(key) !== request) return
				setDiffCommentsLoaded((current) => {
					if (previousLoadState === "ready") return { ...current, [key]: previousLoadState }
					const next = { ...current }
					delete next[key]
					return next
				})
				flashNotice(errorMessage(error))
			})
			.finally(() => {
				if (requests.comments.get(key) === request) requests.comments.delete(key)
			})
	}

	const loadPullRequestDiff = (pullRequest: PullRequestItem, options: { readonly force?: boolean; readonly includeComments?: boolean } = {}) => {
		const force = options.force ?? false
		const includeComments = options.includeComments ?? false
		const key = pullRequestDiffKey(pullRequest)
		const existing = registry.get(pullRequestDiffCacheAtom)[key]
		if (includeComments) loadPullRequestReviewComments(pullRequest, force)
		if (!force && (existing?._tag === "Ready" || requests.diffs.has(key))) return

		const request = {}
		requests.diffs.set(key, request)
		setPullRequestDiffCache((current) => capSelected({ ...current, [key]: PullRequestDiffState.Loading() }))
		const diffAtom = pullRequestDiffForRevision(pullRequestRevisionAtomKey(pullRequest))
		if (force) registry.refresh(diffAtom)
		void Effect.runPromise(
			AtomRegistry.getResult(registry, diffAtom, { suspendOnWaiting: true }).pipe(
				Effect.timeoutOrElse({
					duration: requestTimeoutMs,
					orElse: () => Effect.fail(new Error(`Diff for #${pullRequest.number} timed out. Press r to retry.`)),
				}),
			),
		)
			.then((patch) => {
				if (requests.diffs.get(key) !== request) return
				setPullRequestDiffCache((current) =>
					capSelected({
						...current,
						[key]: PullRequestDiffState.Ready({ patch, files: splitPatchFiles(patch) }),
					}),
				)
			})
			.catch((error) => {
				if (requests.diffs.get(key) !== request) return
				setPullRequestDiffCache((current) =>
					capSelected({
						...current,
						[key]: PullRequestDiffState.Error({ error: errorMessage(error) }),
					}),
				)
				flashNotice(errorMessage(error))
			})
			.finally(() => {
				if (requests.diffs.get(key) === request) requests.diffs.delete(key)
			})
	}

	return { loadPullRequestReviewComments, loadPullRequestDiff }
}
