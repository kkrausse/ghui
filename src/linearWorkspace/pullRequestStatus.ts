/**
 * GitHub's view of a linked PR: review decision and CI rollup. Linear's
 * attachment metadata has neither -- its review tally counts verdicts, not
 * whether the PR is mergeable, and it carries no checks at all -- so the host
 * fetches these from GitHub and the Linear tab only caches and paints them.
 */
import { createContext } from "react"
import { color } from "./theme.ts"

export type PullRequestStatus = {
	review: "draft" | "approved" | "changes" | "review" | "none"
	checks: "passing" | "failing" | "pending" | "none"
}

export type LoadPullRequestStatus = (url: string) => Promise<PullRequestStatus>

/** Keyed by the canonical PR url; undefined until GitHub answers. */
export type PullRequestStatusFor = (url: string) => PullRequestStatus | undefined

export const PullRequestStatusContext = createContext<PullRequestStatusFor>(() => undefined)

// The host PR list's glyphs, except pending: ◐ is already Linear's "in review".
export const CHECK_STYLE: Record<PullRequestStatus["checks"], { glyph: string; fg: string } | null> = {
	passing: { glyph: "✓", fg: color.ok },
	failing: { glyph: "×", fg: color.urgent },
	pending: { glyph: "…", fg: color.medium },
	none: null,
}

// Draft is already the row's status glyph, and `none` means nothing to say.
export const REVIEW_STYLE: Record<PullRequestStatus["review"], { label: string; fg: string } | null> = {
	approved: { label: "approved", fg: color.ok },
	changes: { label: "changes requested", fg: color.urgent },
	review: { label: "review required", fg: color.medium },
	draft: null,
	none: null,
}
