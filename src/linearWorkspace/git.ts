/**
 * Linked git work: the PRs and branches Linear's GitHub/GitLab integration
 * attaches to an issue.
 *
 * The integration stores everything in `Attachment.metadata`, an untyped
 * JSONObject whose shape depends on what was linked. Three kinds arrive through
 * the query's `sourceType` filter:
 *
 *   - a pull request -- has `number` and `status`
 *   - a commit or branch push -- has `commitId` and `branch`, but no number
 *   - a bare `api` attachment (a CI run, a link posted by a bot) -- empty metadata
 *
 * Only the first two are links to code, so `classify()` returns null for the
 * third rather than the UI having to know which fields imply which kind.
 */
import type { Attachment, Issue } from "./linear/schema.ts"
import { gitStatusStyle } from "./theme.ts"

export type GitStatus = "draft" | "open" | "inReview" | "merged" | "closed" | "unknown"

/** A PR or a pushed branch, flattened out of the metadata blob. */
export type GitLink = {
	id: string
	url: string
	/** null on a commit attachment: a branch was pushed with no PR behind it. */
	number: number | null
	repo: string
	branch: string | null
	status: GitStatus
	/** Reviewers whose most recent verdict was an approval / a change request. */
	approvals: number
	changesRequested: number
	hasConflicts: boolean
	/** The PR's own timestamp, not the attachment's. Orders the links. */
	updatedAt: string | null
}

const STATUSES = new Set<GitStatus>(["draft", "open", "inReview", "merged", "closed"])

/** A PR nobody can push to anymore. Sorts below anything still in flight. */
function isSettled(status: GitStatus): boolean {
	return status === "merged" || status === "closed"
}

/**
 * `draft` wins over whatever `status` says: the two agree in practice, and when
 * they do not, a draft PR is not something to go review.
 */
function toStatus(raw: string | null | undefined, draft: boolean | null | undefined): GitStatus {
	if (draft) return "draft"
	return STATUSES.has(raw as GitStatus) ? (raw as GitStatus) : "unknown"
}

/**
 * Counts reviewers, not reviews. A reviewer who comments and later approves has
 * two entries, and only the latest one is their verdict -- counting rows would
 * report two approvals from one person. Comments and dismissals are not
 * verdicts, so they neither count nor displace an earlier approval.
 */
function tallyReviews(reviews: NonNullable<Attachment["metadata"]>["reviews"]): {
	approvals: number
	changesRequested: number
} {
	const verdicts = new Map<string, { state: string; at: string }>()
	for (const review of reviews ?? []) {
		if (review.isBot) continue
		const state = review.state ?? ""
		if (state !== "approved" && state !== "changes_requested") continue
		const who = review.reviewerLogin ?? ""
		const at = review.submittedAt ?? ""
		const seen = verdicts.get(who)
		if (!seen || seen.at <= at) verdicts.set(who, { state, at })
	}

	let approvals = 0
	let changesRequested = 0
	for (const { state } of verdicts.values()) {
		if (state === "approved") approvals++
		else changesRequested++
	}
	return { approvals, changesRequested }
}

/** null for anything that is not a link to code. */
export function classify(attachment: Attachment): GitLink | null {
	const m = attachment.metadata
	if (!m) return null

	const number = m.number ?? null
	if (number === null && !m.commitId) return null

	const { approvals, changesRequested } = tallyReviews(m.reviews)
	return {
		id: attachment.id,
		url: attachment.url,
		number,
		repo: m.repoName ?? "",
		branch: m.branch ?? null,
		status: toStatus(m.status, m.draft),
		approvals,
		changesRequested,
		hasConflicts: m.hasConflicts === true,
		updatedAt: m.updatedAt ?? null,
	}
}

/**
 * Every linked PR and branch, in-flight work first and most recently touched
 * first inside that. What you want to see on a ticket with five PRs is the one
 * still open, not the three that merged last week.
 */
export function gitLinks(issue: Pick<Issue, "attachments"> | null | undefined): GitLink[] {
	const links = (issue?.attachments?.nodes ?? []).map(classify).filter((l): l is GitLink => l !== null)

	return links.sort((a, b) => {
		const settled = Number(isSettled(a.status)) - Number(isSettled(b.status))
		if (settled !== 0) return settled
		if (a.updatedAt !== b.updatedAt) return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
		return (b.number ?? 0) - (a.number ?? 0)
	})
}

/**
 * The one link a single-line cell should show, and the one `O` opens without
 * asking. A PR beats a bare branch push; past that it is the order above.
 */
export function primaryGitLink(issue: Pick<Issue, "attachments"> | null | undefined): GitLink | null {
	const links = gitLinks(issue)
	return links.find((l) => l.number !== null) ?? links[0] ?? null
}

/** `●#783`, plus a `+` when the issue has more links behind this one. */
export function gitCell(link: GitLink, more: boolean): string {
	const glyph = gitStatusStyle(link.status).glyph
	const id = link.number === null ? "⎇" : `#${link.number}`
	return `${glyph}${id}${more ? "+" : ""}`
}

/** `PR #783` / `Commit`, the label the detail pane puts in its label column. */
export function gitLabel(link: GitLink): string {
	return link.number === null ? "Commit" : `PR #${link.number}`
}

/**
 * One detail-pane line: `● merged · data-warehouse-pipeline · 2 approved`.
 *
 * The branch is only named when it differs from the issue's own suggested branch,
 * which is the common case and already has its own row. `includeRepo` is off
 * where the caller already prints the repo -- the PR picker puts it in the row
 * title and uses this for the line underneath.
 */
export function gitSummary(link: GitLink, issueBranch: string | null | undefined, includeRepo = true): string {
	const parts: string[] = []
	const style = gitStatusStyle(link.status)

	if (link.number === null) parts.push(`⎇ ${link.branch ?? "branch"}`)
	else parts.push(`${style.glyph} ${style.label}`)

	if (link.repo && includeRepo) parts.push(link.repo)
	if (link.approvals) parts.push(`${link.approvals} approved`)
	if (link.changesRequested) {
		// One reviewer needs no count; "1 changes requested" reads like a typo.
		parts.push(link.changesRequested === 1 ? "changes requested" : `${link.changesRequested} changes requested`)
	}
	if (link.hasConflicts) parts.push("⚠ conflicts")
	if (link.number !== null && link.branch && link.branch !== issueBranch) {
		parts.push(`⎇ ${link.branch}`)
	}

	return parts.join(" · ")
}
