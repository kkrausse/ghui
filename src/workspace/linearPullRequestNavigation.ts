import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { commentsViewActiveAtom } from "../ui/comments/atoms.js"
import { detailFullViewAtom } from "../ui/detail/atoms.js"
import { diffFullViewAtom } from "../ui/diff/atoms.js"
import { linearPullRequestAtom, linearPullRequestTrailAtom, type LinkedPullRequestPage } from "../ui/pullRequests/linkedSelection.js"
import { runsFullViewAtom } from "../ui/runs/atoms.js"

/** Capture the preceding PR page without changing host queue/scope selection. */
export const rememberLinkedPullRequestPage = (registry: AtomRegistry.AtomRegistry, next: LinkedPullRequestPage): void => {
	if (!registry.get(linearPullRequestAtom)) return
	const current: LinkedPullRequestPage = registry.get(runsFullViewAtom)
		? "runs"
		: registry.get(diffFullViewAtom)
			? "diff"
			: registry.get(commentsViewActiveAtom)
				? "comments"
				: "detail"
	if (next !== current) registry.set(linearPullRequestTrailAtom, [...registry.get(linearPullRequestTrailAtom), current])
	if (next !== "runs") registry.set(runsFullViewAtom, false)
}

/** Return one PR page; the description root separately owns return to Linear. */
export const restoreLinkedPullRequestPage = (registry: AtomRegistry.AtomRegistry): boolean => {
	if (!registry.get(linearPullRequestAtom)) return false
	const trail = registry.get(linearPullRequestTrailAtom)
	const previous = trail.at(-1) ?? "detail"
	registry.set(linearPullRequestTrailAtom, trail.slice(0, -1))
	registry.set(detailFullViewAtom, previous === "detail")
	registry.set(diffFullViewAtom, previous === "diff")
	registry.set(commentsViewActiveAtom, previous === "comments")
	registry.set(runsFullViewAtom, previous === "runs")
	return true
}
