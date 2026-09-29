import { useEffect } from "react"
import type { PullRequestItem } from "../../domain.js"
import type { PullRequestDiffState } from "../diff.js"

const DEFAULT_DELAY_MS = 250

export interface UseDiffPrefetchInput {
	readonly pullRequest: PullRequestItem | null
	readonly fullView: boolean
	readonly diffState: PullRequestDiffState | undefined
	readonly onPrefetch: (pullRequest: PullRequestItem) => void
	readonly delayMs?: number
}

/**
 * Ensures full-view diffs immediately and delays background prefetches.
 * Revision/cache changes recheck demand; the loader deduplicates live work.
 */
export const useDiffPrefetch = ({ pullRequest, fullView, diffState, onPrefetch, delayMs = DEFAULT_DELAY_MS }: UseDiffPrefetchInput): void => {
	useEffect(() => {
		if (!pullRequest || diffState?._tag === "Ready" || diffState?._tag === "Error") return
		const target = pullRequest
		if (fullView) {
			onPrefetch(target)
			return
		}
		const timeout = globalThis.setTimeout(() => onPrefetch(target), delayMs)
		return () => globalThis.clearTimeout(timeout)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pullRequest?.url, pullRequest?.headRefOid, fullView, diffState?._tag, delayMs])
}
