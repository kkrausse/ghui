import { githubPullRequestRoute } from "../githubPullRequestRoute.js"
import { getReviewStatus } from "../services/githubNormalize.js"
import { indexSessions, type FaplexSession, type FaplexSnapshot } from "../faplex.js"
import { issuePullRequests } from "./issueRows.js"
import type { Issue } from "./linear/schema.js"
import { contextMarkdown, CONTEXT_PATH, writeContext } from "./overseer.js"
import type { PullRequestStatus } from "./pullRequestStatus.js"
import { cursorOf, hasMore, loadTarget } from "./views.js"

/**
 * `ghui status`: everything the overseer needs, fetched now rather than read
 * from whatever GHUI last saw. My open Linear tickets (every page), each open
 * linked PR's CI and review from GitHub in one GraphQL call through `gh`, and
 * every faplex session. Printed as the overseer context, which is also written
 * to its file. A source that fails is named on stderr and left out; the rest
 * still prints.
 */

const myIssues = async (): Promise<Issue[]> => {
	const all: Issue[] = []
	let after: string | null = null
	for (;;) {
		const page = await loadTarget({ kind: "my-issues" }, after)
		if (page.type !== "issues") break
		all.push(...page.issues)
		if (!hasMore(page)) break
		after = cursorOf(page)
	}
	return all
}

const sessions = async (): Promise<FaplexSnapshot> => {
	const proc = Bun.spawn(["faplex", "ls", "--json"], { stdout: "pipe", stderr: "pipe" })
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
	if (code !== 0) throw new Error(err.trim() || `faplex ls exited ${code}`)
	return { machines: [], harnesses: [], lastPick: null, sources: [], sessions: JSON.parse(out) as FaplexSession[] }
}

const CHECKS: Record<string, PullRequestStatus["checks"]> = { SUCCESS: "passing", FAILURE: "failing", ERROR: "failing", PENDING: "pending", EXPECTED: "pending" }

type GitHubPr = { isDraft: boolean; reviewDecision: string | null; commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] } }

/** Checks and review for every open PR, by canonical url. Merged and closed PRs need neither. */
const pullRequestStatuses = async (issues: readonly Issue[]): Promise<Map<string, PullRequestStatus>> => {
	const routes = [
		...new Map(
			issues
				.flatMap((issue) => issuePullRequests(issue))
				.filter((pr) => pr.status !== "merged" && pr.status !== "closed")
				.flatMap((pr) => {
					const route = githubPullRequestRoute(pr.url)
					return route ? [[route.url, route] as const] : []
				}),
		).values(),
	]
	if (!routes.length) return new Map()
	const fields = "isDraft reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }"
	const query = `{ ${routes
		.map((r, i) => {
			const [owner, name] = r.repository.split("/")
			return `p${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { pullRequest(number: ${r.number}) { ${fields} } }`
		})
		.join(" ")} }`
	const proc = Bun.spawn(["gh", "api", "graphql", "-f", `query=${query}`], { stdout: "pipe", stderr: "pipe" })
	const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
	// A PR GitHub can't find (deleted repo, no access) errors only its own alias; the rest still come back.
	let data: Record<string, { pullRequest: GitHubPr | null } | null> = {}
	try {
		data = JSON.parse(out).data ?? {}
	} catch {
		throw new Error(err.trim() || `gh api graphql exited ${code}`)
	}
	const statuses = new Map<string, PullRequestStatus>()
	routes.forEach((route, i) => {
		const pr = data[`p${i}`]?.pullRequest
		if (!pr) return
		const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup?.state
		statuses.set(route.url, { review: getReviewStatus(pr), checks: (rollup && CHECKS[rollup]) || "none" })
	})
	return statuses
}

const fail = (what: string) => (e: unknown) => {
	process.stderr.write(`ghui status: ${what}: ${e instanceof Error ? e.message : String(e)}\n`)
	return null
}

export async function status(): Promise<number> {
	const [issues, snapshot] = await Promise.all([myIssues().catch(fail("Linear")), sessions().catch(fail("faplex"))])
	if (!issues) return 1
	const prs = (await pullRequestStatuses(issues).catch(fail("GitHub"))) ?? new Map<string, PullRequestStatus>()
	const text = contextMarkdown(issues, snapshot, indexSessions(snapshot), (url) => prs.get(url))
	try {
		writeContext(text)
	} catch (e) {
		fail(`writing ${CONTEXT_PATH}`)(e)
	}
	process.stdout.write(text)
	return 0
}
