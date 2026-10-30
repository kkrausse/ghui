import { createConnection } from "node:net"
import { createElement, Fragment, useSyncExternalStore } from "react"
import { withTuiSuspended } from "./tuiSuspension.js"
import type { Issue } from "./linearWorkspace/linear/schema.js"

/**
 * Agent sessions from faplex (github.com/kkrausse/faplex), nested under the
 * Linear tickets and GitHub pull requests they belong to. One `faplex watch
 * --json` child streams the whole session list and keeps the clients of
 * sessions opened here, so reopening is a
 * repaint: opening relays the terminal to it over its socket until the session
 * is left (ctrl+] or ← at an empty prompt). Without the socket, `faplex open`
 * takes the terminal instead.
 */

export type FaplexStatus = "needs" | "working" | "done" | "failed" | "interrupted" | "idle"

export type FaplexSession = {
	key: string
	machine: string
	harness: string
	title: string
	cwd: string
	status: FaplexStatus
	detail: string
	updatedAt: number
	archived: boolean
	prompted?: boolean
	/** Absent when the session can't be opened from here (an interactive Claude session). */
	open?: { cmd: string[]; cwd: string }
	tags: string[]
	/** Subagents or a shell still running behind the session (Claude only so far). */
	background?: { kind: "agent" | "shell" }
	/** The machine's short name and label color from faplex's config, filled in by `indexSessions`. */
	host?: string
	hostColor?: string | undefined
}

export type FaplexSnapshot = {
	machines: { id: string; short: string; color?: string; remote: boolean; dir: string }[]
	harnesses: string[]
	lastPick: { machine: string; harness: string } | null
	sources: { machine: string; harness: string; loaded: boolean; problem: { kind: string; message: string } | null }[]
	sessions: FaplexSession[]
	/** Where the watch takes open requests for the clients it keeps. */
	socket?: string
}

type State = { snapshot: FaplexSnapshot | null; error: string | null }

let state: State = { snapshot: null, error: null }
const listeners = new Set<() => void>()
let running = false
/** Writes a control line to the running watch, if there is one. */
let control: (msg: object) => void = () => {}

const set = (next: Partial<State>) => {
	state = { ...state, ...next }
	for (const listener of listeners) listener()
}

/** faplex missing or its watch dying is a status, not a crash; it is retried after a while. */
const RETRY_MS = 60_000

const start = () => {
	if (running || process.env.NODE_ENV === "test") return
	let proc: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">>
	try {
		// stdin stays open for as long as GHUI runs; faplex quits when it closes.
		proc = Bun.spawn(["faplex", "watch", "--json"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
	} catch {
		set({ error: "faplex is not installed" })
		setTimeout(start, RETRY_MS)
		return
	}
	running = true
	control = (msg) => void proc.stdin.write(JSON.stringify(msg) + "\n")
	const sendSize = () => control({ size: { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 } })
	sendSize()
	process.stdout.on("resize", sendSize)
	void (async () => {
		const decoder = new TextDecoder()
		let buffered = ""
		for await (const chunk of proc.stdout) {
			buffered += decoder.decode(chunk, { stream: true })
			let nl: number
			while ((nl = buffered.indexOf("\n")) !== -1) {
				const line = buffered.slice(0, nl)
				buffered = buffered.slice(nl + 1)
				try {
					const snapshot = JSON.parse(line) as FaplexSnapshot
					if (Array.isArray(snapshot.sessions)) set({ snapshot, error: null })
				} catch {
					// A partial or foreign line; the next full one replaces everything anyway.
				}
			}
		}
	})()
	void proc.exited.then(async (code) => {
		running = false
		control = () => {}
		process.stdout.off("resize", sendSize)
		const stderr = (await new Response(proc.stderr).text()).trim()
		set({ error: `faplex watch exited ${code}${stderr ? `: ${stderr.split("\n")[0]}` : ""}` })
		setTimeout(start, RETRY_MS)
	})
}

const subscribe = (listener: () => void) => {
	listeners.add(listener)
	start()
	return () => listeners.delete(listener)
}

/** The latest session list, for code outside React (commands). */
export const faplexState = (): State => state

/** The latest session list; starts the watch on first use (the PR list, at launch). */
export const useFaplex = (): State => useSyncExternalStore(subscribe, () => state)

/** Sessions for one ticket, most relevant first. */
export type SessionsFor = (issue: Pick<Issue, "identifier">) => FaplexSession[]
export const noSessions: SessionsFor = () => []

/** The tag on the overseer session (overseer.ts), which belongs above the tickets, not under them. */
export const OVERSEER_TAG = "overseer"

const TICKET_ID = /\b[A-Z][A-Z0-9]*-\d+\b/gi
const ORDER: Record<FaplexStatus, number> = { needs: 0, working: 1, failed: 2, interrupted: 3, done: 4, idle: 5 }

/** Sessions worth listing, with their machine's short name and color. Archived sessions, untouched drafts and the overseer are left out. */
const listedSessions = (snapshot: FaplexSnapshot): FaplexSession[] => {
	const machines = new Map(snapshot.machines.map((m) => [m.id, m]))
	return snapshot.sessions
		.filter((s) => !s.archived && !(s.prompted === false && s.status === "idle") && !s.tags.includes(OVERSEER_TAG))
		.map((s) => ({ ...s, host: machines.get(s.machine)?.short ?? s.machine, hostColor: machines.get(s.machine)?.color }))
}

const groupBy = (entries: Iterable<[string, FaplexSession]>) => {
	const grouped = new Map<string, FaplexSession[]>()
	for (const [id, session] of entries) grouped.set(id, [...(grouped.get(id) ?? []), session])
	for (const sessions of grouped.values()) sessions.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt)
	return grouped
}

/**
 * A session belongs to every ticket it is tagged with (`faplex new --tag`) and
 * every ticket id in its title, status line or directory -- sessions started
 * outside GHUI turn up too.
 */
export const indexSessions = (snapshot: FaplexSnapshot | null): SessionsFor => {
	if (!snapshot) return noSessions
	const byTicket = groupBy(
		listedSessions(snapshot).flatMap((session) => {
			const mentioned = `${session.title} ${session.detail} ${session.cwd}`.match(TICKET_ID) ?? []
			return [...new Set([...session.tags, ...mentioned].map((id) => id.toUpperCase()))].map((id): [string, FaplexSession] => [id, session])
		}),
	)
	return (issue) => byTicket.get(issue.identifier.toUpperCase()) ?? []
}

/** Sessions for one pull request, most relevant first. */
export type PullRequestSessionsFor = (pr: { repository: string; number: number }) => FaplexSession[]
export const noPullRequestSessions: PullRequestSessionsFor = () => []

/** The tag GHUI puts on a session started on a pull request: `owner/repo#123`. */
export const pullRequestTag = (pr: { repository: string; number: number }) => `${pr.repository}#${pr.number}`.toLowerCase()

const PR_TAG = /^[\w.-]+\/[\w.-]+#\d+$/
const PR_URL = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/gi

/**
 * A session belongs to every pull request it is tagged with (`owner/repo#123`)
 * and every pull request URL in its title or status line, so a review started
 * by pasting the link turns up too.
 */
export const indexPullRequestSessions = (snapshot: FaplexSnapshot | null): PullRequestSessionsFor => {
	if (!snapshot) return noPullRequestSessions
	const byPullRequest = groupBy(
		listedSessions(snapshot).flatMap((session) => {
			const tagged = session.tags.filter((tag) => PR_TAG.test(tag))
			const linked = [...`${session.title} ${session.detail}`.matchAll(PR_URL)].map((m) => `${m[1]}#${m[2]}`)
			return [...new Set([...tagged, ...linked].map((id) => id.toLowerCase()))].map((id): [string, FaplexSession] => [id, session])
		}),
	)
	return (pr) => byPullRequest.get(pullRequestTag(pr)) ?? []
}

/** How many start directories the picker offers per machine × harness. */
const DIRS_PER_TARGET = 4

/** A harness can't start there: not installed, or too old. A stopped daemon is started by the harness's CLI. */
const UNAVAILABLE = new Set(["missing", "unsupported"])

export type SessionTarget = { machine: string; harness: string; dirs: string[]; note: string }

/**
 * Where a new session can start: every machine × harness that is available
 * (`faplex new` waits for one that hasn't reported yet), last picked first.
 * Directories come from the ticket's own sessions, then the machine's default,
 * then where its recent sessions ran.
 */
export const sessionTargets = (snapshot: FaplexSnapshot, ticketSessions: readonly FaplexSession[] = []): SessionTarget[] => {
	const recent = [...snapshot.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
	const last = snapshot.lastPick
	const isLast = (s: { machine: string; harness: string }) => s.machine === last?.machine && s.harness === last?.harness
	return snapshot.sources
		.filter((s) => !s.problem || !UNAVAILABLE.has(s.problem.kind))
		.sort((a, b) => Number(isLast(b)) - Number(isLast(a)))
		.map((s) => {
			const fallback = snapshot.machines.find((m) => m.id === s.machine)?.dir ?? "~"
			const cwds = (sessions: readonly FaplexSession[]) => sessions.filter((r) => r.machine === s.machine).map((r) => r.cwd)
			const dirs = [...new Set([...cwds(ticketSessions), fallback, ...cwds(recent)])].slice(0, DIRS_PER_TARGET)
			return { machine: s.machine, harness: s.harness, dirs, note: s.problem ? `${s.problem.message} · starts with the session` : "" }
		})
}

/**
 * Every machine × harness × directory a session on this pull request can start
 * in. Directories of the PR's own sessions come first, then ones named after
 * its repository (likely a checkout of it).
 */
export const pullRequestSessionTargets = (snapshot: FaplexSnapshot, pr: { repository: string; number: number }) => {
	const repoName = pr.repository.split("/").pop()!.toLowerCase()
	const checkouts = snapshot.sessions.filter((s) => s.cwd.toLowerCase().split("/").includes(repoName))
	const preferred = [...indexPullRequestSessions(snapshot)(pr), ...checkouts.sort((a, b) => b.updatedAt - a.updatedAt)]
	const host = (machine: string) => snapshot.machines.find((m) => m.id === machine)?.short ?? machine
	return sessionTargets(snapshot, preferred).flatMap((target) =>
		target.dirs.map((dir) => ({ machine: target.machine, host: host(target.machine), harness: target.harness, dir, note: target.note })),
	)
}

/** Runs faplex with the terminal; a failure comes back as its stderr. */
const runFaplex = async (args: string[]) => {
	const proc = Bun.spawn(["faplex", ...args], { stdin: "inherit", stdout: "inherit", stderr: "pipe" })
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
	if (code !== 0) throw new Error(stderr.trim().replace(/^faplex: /, "") || `faplex ${args[0]} exited ${code}`)
}
const handOver = (args: string[]) => withTuiSuspended(() => runFaplex(args))

/**
 * Relays the terminal to the watch's client for `key` until the watch ends the
 * connection (the session was left). False when the socket can't be reached.
 */
const relay = (socket: string, key: string) =>
	new Promise<boolean>((resolve) => {
		const conn = createConnection(socket)
		const keys = (data: Uint8Array) => conn.write(data)
		let connected = false
		conn.on("connect", () => {
			connected = true
			conn.write(JSON.stringify({ key, cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }) + "\n")
			process.stdin.setRawMode?.(true)
			process.stdin.on("data", keys)
			process.stdin.resume()
		})
		conn.on("data", (data: Uint8Array) => process.stdout.write(data))
		conn.on("error", () => {})
		conn.on("close", () => {
			process.stdin.off("data", keys)
			resolve(connected)
		})
	})

/** Hands the terminal to the session; its client stays with the watch for a quick reopen. */
export const openSession = (session: Pick<FaplexSession, "key" | "open">) =>
	withTuiSuspended(async () => {
		const socket = state.snapshot?.socket
		if (socket && (await relay(socket, session.key))) return
		// Passing `open` lets faplex attach at once instead of listing every session first.
		await runFaplex(["open", session.key, ...(session.open ? ["--open", JSON.stringify(session.open)] : [])])
	})

/** Have the watch attach this session's client now, so opening it is a repaint. */
let warmed: string | null = null
export const warmSession = (key: string) => {
	if (key === warmed) return
	warmed = key
	control({ warm: key })
}

/** `faplex new --background` exits with this when the folder's trust prompt has to be answered on screen. */
const NEEDS_TRUST = 3

/**
 * Starts the session without leaving the current page and resolves once it is
 * running. Only a folder whose trust prompt needs answering takes the terminal.
 */
export const startSession = async (input: { machine: string; harness: string; dir: string; prompt: string; tags: string[] }) => {
	const args = ["new", "--machine", input.machine, "--harness", input.harness, "--dir", input.dir, "--prompt", input.prompt, ...input.tags.flatMap((t) => ["--tag", t])]
	const proc = Bun.spawn(["faplex", ...args, "--background"], { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
	if (code === NEEDS_TRUST) return handOver(args)
	if (code !== 0) throw new Error(stderr.trim().replace(/^faplex: /, "") || `faplex new exited ${code}`)
}

// faplex's spinner: one shared ticker, running only while a working session is on screen.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
let frame = 0
const spinListeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null
const subscribeSpinner = (listener: () => void) => {
	spinListeners.add(listener)
	ticker ??= setInterval(() => {
		frame = (frame + 1) % FRAMES.length
		for (const l of spinListeners) l()
	}, 80)
	return () => {
		spinListeners.delete(listener)
		if (!spinListeners.size && ticker) {
			clearInterval(ticker)
			ticker = null
		}
	}
}
export const useSpinner = () => FRAMES[useSyncExternalStore(subscribeSpinner, () => frame)]!

// faplex's list, mark for mark and color for color (faplex/src/list.tsx, theme.ts).
const SESSION_COLOR = { working: "#fde047", needs: "#f59e0b", failed: "#ef4444", other: "#a1a1aa" }
export const HARNESS_COLOR: Record<string, string> = { claude: "#d97757", codex: "#e4e4e7", opencode: "#a78bfa", "opencode-mini": "#a78bfa" }
export const HARNESS_SHORT: Record<string, string> = { claude: "clau", opencode: "oc", "opencode-mini": "ocm" }

export const sessionColor = (status: FaplexStatus) => (status === "working" || status === "needs" || status === "failed" ? SESSION_COLOR[status] : SESSION_COLOR.other)

/** Its own component, so the 80ms tick re-renders only working marks. */
const Spinner = () => useSpinner()

/** faplex's gutter, two cells: a spinner while working, `!` needs input, `×` failed, `-` interrupted; then `⑂`/`$` for background work. */
export const SessionMarkText = ({ session }: { session: Pick<FaplexSession, "status" | "background"> }) => {
	const mark =
		session.status === "working" ? createElement(Spinner) : session.status === "needs" ? "!" : session.status === "failed" ? "×" : session.status === "interrupted" ? "-" : " "
	const also = session.background?.kind === "agent" ? "⑂" : session.background?.kind === "shell" ? "$" : " "
	return createElement(Fragment, null, mark, also)
}
