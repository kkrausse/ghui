/**
 * Classification of Linear's GitHub attachments.
 *
 * The fixtures are trimmed copies of real `Attachment.metadata` blobs from this
 * workspace, because the field is an untyped JSONObject -- nothing but a real
 * payload tells you that a draft PR reports `status: "draft"`, that a commit
 * attachment reports `status: "open"` with no number, or that a reviewer who
 * commented and later approved appears twice.
 *
 *   bun test linear-tui/git.test.ts
 */
import { expect, test } from "bun:test"
import { classify, gitCell, gitLabel, gitLinks, gitSummary, primaryGitLink } from "../../src/linearWorkspace/git.ts"
import type { Attachment } from "../../src/linearWorkspace/linear/schema.ts"

function attachment(id: string, metadata: Record<string, unknown>): Attachment {
	return {
		id,
		title: "a pull request",
		url: `https://github.com/acme/repo/pull/${metadata.number ?? 0}`,
		sourceType: "github",
		metadata: metadata as Attachment["metadata"],
	}
}

const MERGED = attachment("a-merged", {
	number: 783,
	status: "merged",
	draft: false,
	branch: "backend-1335-implement-billing-aggregation",
	repoName: "data-warehouse-pipeline",
	hasConflicts: false,
	updatedAt: "2026-07-30T16:40:22Z",
	reviews: [
		// Same reviewer twice: a comment, then the approval that is their verdict.
		{ state: "commented", reviewerLogin: "rshelley", isBot: false, submittedAt: "2026-07-29T23:27:09Z" },
		{ state: "approved", reviewerLogin: "rshelley", isBot: false, submittedAt: "2026-07-29T23:30:00Z" },
		{
			state: "approved",
			reviewerLogin: "ellamcmorristb",
			isBot: false,
			submittedAt: "2026-07-29T17:33:20Z",
		},
	],
})

const IN_REVIEW = attachment("a-review", {
	number: 575,
	status: "inReview",
	draft: false,
	branch: "backend-1339-disable-old-cron-jobs",
	repoName: "form-permissions-v2-service",
	hasConflicts: true,
	updatedAt: "2026-08-06T20:25:52Z",
	reviews: [
		{
			state: "changes_requested",
			reviewerLogin: "richmoni",
			isBot: false,
			submittedAt: "2026-08-06T20:14:29Z",
		},
		{ state: "approved", reviewerLogin: "ci-bot", isBot: true, submittedAt: "2026-08-06T20:20:00Z" },
	],
})

const DRAFT = attachment("a-draft", {
	number: 288,
	status: "draft",
	draft: true,
	branch: "backend-1339-disable-old-cron-jobs",
	repoName: "ird-service",
	updatedAt: "2026-07-22T20:03:41Z",
	reviews: [],
})

/** A branch push with no PR behind it: `commitId`, no `number`. */
const COMMIT = attachment("a-commit", {
	status: "open",
	branch: "cursor/configurable-default-concurrency-cap-7f57",
	commitId: "3831766e54ac29579f2826adb05233e93ed22173",
	repoName: "scheduler-orchestrator",
})

/** A CI run link. Same query, no code behind it. */
const CI_RUN: Attachment = {
	id: "a-ci",
	title: "Failing OAuth Staging deploy",
	url: "https://github.com/acme/x/actions/runs/1/job/2",
	sourceType: "api",
	metadata: {} as Attachment["metadata"],
}

test("a pull request keeps its number, repo, status, and conflict flag", () => {
	const link = classify(IN_REVIEW)!
	expect(link.number).toBe(575)
	expect(link.repo).toBe("form-permissions-v2-service")
	expect(link.status).toBe("inReview")
	expect(link.hasConflicts).toBe(true)
})

test("reviews count reviewers, not rows, and ignore bots", () => {
	const merged = classify(MERGED)!
	expect(merged.approvals).toBe(2) // rshelley's comment does not double-count
	expect(merged.changesRequested).toBe(0)

	const inReview = classify(IN_REVIEW)!
	expect(inReview.approvals).toBe(0) // the approval is a bot's
	expect(inReview.changesRequested).toBe(1)
})

test("a commit attachment classifies with no PR number", () => {
	const link = classify(COMMIT)!
	expect(link.number).toBeNull()
	expect(link.branch).toBe("cursor/configurable-default-concurrency-cap-7f57")
	expect(gitLabel(link)).toBe("Commit")
})

test("an attachment with no code behind it is dropped", () => {
	expect(classify(CI_RUN)).toBeNull()
})

test("draft wins over status, however the two are reported", () => {
	expect(classify(DRAFT)!.status).toBe("draft")
	const bothWays = classify(attachment("x", { number: 1, status: "open", draft: true }))!
	expect(bothWays.status).toBe("draft")
})

test("in-flight PRs sort above merged ones, newest first", () => {
	const issue = { attachments: { nodes: [MERGED, DRAFT, IN_REVIEW] } } as never
	expect(gitLinks(issue).map((l) => l.number)).toEqual([575, 288, 783])
})

test("the primary link prefers a PR over a bare branch push", () => {
	const issue = { attachments: { nodes: [COMMIT, MERGED] } } as never
	expect(primaryGitLink(issue)!.number).toBe(783)

	const noPrs = { attachments: { nodes: [COMMIT] } } as never
	expect(primaryGitLink(noPrs)!.number).toBeNull()

	expect(primaryGitLink({ attachments: { nodes: [] } } as never)).toBeNull()
	expect(primaryGitLink(null)).toBeNull()
})

test("the list cell fits a glyph, the number, and a more-than-one marker", () => {
	expect(gitCell(classify(MERGED)!, false)).toBe("●#783")
	expect(gitCell(classify(IN_REVIEW)!, true)).toBe("◐#575+")
	expect(gitCell(classify(COMMIT)!, false)).toBe("○⎇")
})

test("the detail line names status, repo, reviews, and conflicts", () => {
	const branch = "backend-1335-implement-billing-aggregation"
	expect(gitSummary(classify(MERGED)!, branch)).toBe("● merged · data-warehouse-pipeline · 2 approved")
	// A branch that is not the issue's own is worth naming; its own is not.
	expect(gitSummary(classify(IN_REVIEW)!, branch)).toBe("◐ in review · form-permissions-v2-service · changes requested · ⚠ conflicts · " + "⎇ backend-1339-disable-old-cron-jobs")
	expect(gitSummary(classify(COMMIT)!, branch)).toBe("⎇ cursor/configurable-default-concurrency-cap-7f57 · scheduler-orchestrator")
})
