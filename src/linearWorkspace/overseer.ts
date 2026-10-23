import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { OVERSEER_TAG, type FaplexSession, type FaplexSnapshot, type SessionsFor } from "./faplex.js"
import { githubPullRequestRoute } from "../githubPullRequestRoute.js"
import { issuePullRequests } from "./issueRows.js"
import type { Issue } from "./linear/schema.js"
import type { PullRequestStatusFor } from "./pullRequestStatus.js"

/**
 * The overseer: one agent session that sees every open ticket and every agent
 * session, and reaches the sessions through faplex (`ls`, `tail`, `send`). It
 * is an ordinary faplex session tagged `overseer`. What it knows about the
 * tickets comes from a context file GHUI rewrites whenever My Issues or the
 * session list changes, so it never works from a stale first prompt.
 */

export const CONTEXT_PATH = join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "ghui", "overseer.md")

/** The newest overseer that hasn't been archived. */
export const overseerSession = (snapshot: FaplexSnapshot | null): FaplexSession | undefined => {
	const found = snapshot?.sessions.filter((s) => !s.archived && s.tags.includes(OVERSEER_TAG)).sort((a, b) => b.updatedAt - a.updatedAt)[0]
	if (!found) return undefined
	const machine = snapshot!.machines.find((m) => m.id === found.machine)
	return { ...found, host: machine?.short ?? found.machine, hostColor: machine?.color }
}

const sessionLine = (s: FaplexSession) => {
	const detail = s.detail.split("\n")[0]!.trim()
	return `${s.key} · ${s.status} · "${s.title}"${detail ? ` · ${detail}` : ""} · ${s.cwd.replace(homedir(), "~")}`
}

/** GitHub's word on a PR when it is known: CI, then review. */
const githubNote = (url: string, prStatus: PullRequestStatusFor) => {
	const status = prStatus(githubPullRequestRoute(url)?.url ?? url)
	if (!status) return ""
	const checks = status.checks === "none" ? "" : `checks ${status.checks}`
	const review = status.review === "approved" ? "approved" : status.review === "changes" ? "changes requested" : status.review === "review" ? "review required" : ""
	return [checks, review]
		.filter(Boolean)
		.map((note) => ` · ${note}`)
		.join("")
}

/**
 * Tickets grouped by project, each with its PRs and sessions, then the sessions
 * no listed ticket claims. PRs carry GitHub's checks and review when `prStatus` knows them.
 */
export const contextMarkdown = (issues: readonly Issue[], snapshot: FaplexSnapshot | null, sessionsFor: SessionsFor, prStatus: PullRequestStatusFor = () => undefined) => {
	const out = [
		`# Open tickets and agent sessions`,
		``,
		`As of ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. \`ghui status\` refetches all of it and rewrites this file.`,
		``,
		`Kevin's open Linear tickets (My Issues in GHUI), their linked PRs, and the faplex sessions working on them.`,
		`Session keys work with \`faplex tail\` and \`faplex send\`; \`faplex ls\` has their live status.`,
		``,
	]
	const claimed = new Set<string>()
	const byProject = new Map<string, Issue[]>()
	for (const issue of issues) {
		const project = issue.project?.name ?? "No project"
		byProject.set(project, [...(byProject.get(project) ?? []), issue])
	}
	for (const [project, group] of byProject) {
		out.push(`## ${project}`, ``)
		for (const issue of group) {
			out.push(`- ${issue.identifier} [${issue.state?.name ?? "?"}] ${issue.title} · ${issue.url}`)
			for (const pr of issuePullRequests(issue)) {
				// Linear's draft flag lags GitHub's; GitHub's wins when it is known.
				const github = prStatus(githubPullRequestRoute(pr.url)?.url ?? pr.url)
				const state = !github || pr.status === "merged" || pr.status === "closed" ? pr.status : github.review === "draft" ? "draft" : pr.status === "draft" ? "open" : pr.status
				out.push(`  - PR ${pr.repo}#${pr.number} ${state}${githubNote(pr.url, prStatus)}${pr.branch ? ` · ${pr.branch}` : ""} · ${pr.url}`)
			}
			for (const s of sessionsFor(issue)) {
				claimed.add(s.key)
				out.push(`  - session ${sessionLine(s)}`)
			}
		}
		out.push(``)
	}
	const others = (snapshot?.sessions ?? []).filter((s) => !claimed.has(s.key) && !s.archived && !(s.prompted === false && s.status === "idle") && !s.tags.includes(OVERSEER_TAG))
	if (others.length) {
		out.push(`## Sessions not on a listed ticket`, ``)
		for (const s of others.sort((a, b) => b.updatedAt - a.updatedAt)) out.push(`- ${sessionLine(s)}`)
		out.push(``)
	}
	return out.join("\n")
}

let written = ""
/** Writes the context file when its text changed; returns whether it did. */
export const writeContext = (text: string) => {
	if (text === written) return false
	mkdirSync(dirname(CONTEXT_PATH), { recursive: true })
	const tmp = `${CONTEXT_PATH}.${process.pid}`
	writeFileSync(tmp, text)
	renameSync(tmp, CONTEXT_PATH)
	written = text
	return true
}

/** The overseer's first prompt; Kevin's own instructions, if any, follow it. */
export const briefing = (instructions: string) =>
	[
		`You are the overseer for Kevin's agent sessions, started from GHUI.`,
		`For the current state of everything, run \`ghui status\`: it refetches his open Linear tickets, each linked PR's state, CI and review from GitHub, and every faplex session (with its key), prints it, and rewrites ${CONTEXT_PATH}. Run it before answering about tickets or PRs, rather than trusting an older read.`,
		``,
		`Reach sessions only through faplex:`,
		`- \`faplex ls\`: every session's status and last note, one line each. Start here for "status of everything".`,
		`- \`faplex tail <key> [-n N]\`: a session's last prompts and replies. Read-only.`,
		`- \`faplex send <key> "text"\`: types a message at its prompt; a busy session takes it after its current turn. It is for giving direction, not asking for status: tail first.`,
		`- \`faplex new --background --machine <id> --harness claude --dir <dir> --prompt "..." --tag <TICKET-ID>\`: start a session on a ticket.`,
		``,
		`To dig into one session in depth, have a subagent read its transcript and keep only the summary. Tickets and PRs are the durable record; session transcripts are the day-to-day status.`,
		`Only send messages to sessions or start new ones when Kevin asks.`,
		...(instructions.trim() ? [``, instructions.trim()] : []),
	].join("\n")
