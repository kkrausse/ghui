import { githubPullRequestRoute } from "../githubPullRequestRoute.js"
import { gitLinks, type GitLink } from "./git.js"
import type { Issue } from "./linear/schema.js"
import { groupIssues, type GroupBy } from "./views.js"

export type IssueRow =
	| { t: "group"; key: string; label: string; count: number }
	| { t: "issue"; key: string; issue: Issue; index: number }
	| { t: "pr"; key: string; parentKey: string; issue: Issue; index: number; link: GitLink }
export type SelectableIssueRow = Exclude<IssueRow, { t: "group" }>

export const issuePullRequests = (issue: Issue): GitLink[] => {
	const seen = new Set<string>()
	return gitLinks(issue).filter((link) => {
		const route = link.number !== null ? githubPullRequestRoute(link.url) : null
		if (!route || seen.has(route.url)) return false
		seen.add(route.url)
		return true
	})
}

/** Selection belongs to an occurrence (label grouping can repeat an issue). */
export const buildIssueRows = (issues: Issue[], groupBy: GroupBy, expanded: ReadonlySet<string> = new Set()): IssueRow[] => {
	const positions = new Map(issues.map((issue, index) => [issue.id, index]))
	const groups = groupBy === "none" ? [{ label: "", issues }] : groupIssues(issues, groupBy)
	return groups.flatMap((group) => {
		const groupKey = JSON.stringify([groupBy, group.label])
		const rows: IssueRow[] = groupBy === "none" ? [] : [{ t: "group", key: groupKey, label: group.label, count: group.issues.length }]
		for (const issue of group.issues) {
			const key = JSON.stringify([groupKey, issue.id])
			const index = positions.get(issue.id) ?? 0
			rows.push({ t: "issue", key, issue, index })
			if (expanded.has(issue.id))
				for (const link of issuePullRequests(issue)) {
					rows.push({ t: "pr", key: `${key}:${githubPullRequestRoute(link.url)!.url}`, parentKey: key, issue, index, link })
				}
		}
		return rows
	})
}

export const selectableIssueRows = (rows: IssueRow[]): SelectableIssueRow[] => rows.filter((row): row is SelectableIssueRow => row.t !== "group")

export const reconcileIssueRow = (rows: SelectableIssueRow[], key: string | null, index: number): SelectableIssueRow | null =>
	rows.find((row) => row.key === key) ?? rows.find((row) => row.t === "issue" && key?.startsWith(`${row.key}:`)) ?? rows.find((row) => row.index === index) ?? rows[0] ?? null
