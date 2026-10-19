import { useSyncExternalStore } from "react"
import { withTuiSuspended } from "../tuiSuspension.js"
import type { Issue } from "./linear/schema.js"

/**
 * Agent sessions from faplex (github.com/kkrausse/faplex), nested under the
 * tickets they belong to. One `faplex watch --json` child streams the whole
 * session list; opening or starting a session hands the terminal to
 * `faplex open` / `faplex new`, which return on ctrl+] or ← at an empty prompt.
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
	open?: unknown
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
}

type State = { snapshot: FaplexSnapshot | null; error: string | null }

let state: State = { snapshot: null, error: null }
const listeners = new Set<() => void>()
let running = false

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

/** The latest session list; starts the watch on first use. */
export const useFaplex = (): State => useSyncExternalStore(subscribe, () => state)

/** Sessions for one ticket, most relevant first. */
export type SessionsFor = (issue: Pick<Issue, "identifier">) => FaplexSession[]
export const noSessions: SessionsFor = () => []

const TICKET_ID = /\b[A-Z][A-Z0-9]*-\d+\b/gi
const ORDER: Record<FaplexStatus, number> = { needs: 0, working: 1, failed: 2, interrupted: 3, done: 4, idle: 5 }

/**
 * A session belongs to every ticket it is tagged with (`faplex new --tag`) and
 * every ticket id in its title, status line or directory -- sessions started
 * outside GHUI turn up too. Archived sessions and untouched drafts are left out.
 */
export const indexSessions = (snapshot: FaplexSnapshot | null): SessionsFor => {
	if (!snapshot) return noSessions
	const byTicket = new Map<string, FaplexSession[]>()
	const machines = new Map(snapshot.machines.map((m) => [m.id, m]))
	for (const listed of snapshot.sessions) {
		if (listed.archived || (listed.prompted === false && listed.status === "idle")) continue
		const machine = machines.get(listed.machine)
		const session = { ...listed, host: machine?.short ?? listed.machine, hostColor: machine?.color }
		const mentioned = `${session.title} ${session.detail} ${session.cwd}`.match(TICKET_ID) ?? []
		const ids = new Set([...session.tags, ...mentioned].map((id) => id.toUpperCase()))
		for (const id of ids) byTicket.set(id, [...(byTicket.get(id) ?? []), session])
	}
	for (const sessions of byTicket.values()) sessions.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt)
	return (issue) => byTicket.get(issue.identifier.toUpperCase()) ?? []
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

/** Runs faplex with the terminal; a failure comes back as its stderr. */
const handOver = (args: string[]) =>
	withTuiSuspended(async () => {
		const proc = Bun.spawn(["faplex", ...args], { stdin: "inherit", stdout: "inherit", stderr: "pipe" })
		const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
		if (code !== 0) throw new Error(stderr.trim().replace(/^faplex: /, "") || `faplex ${args[0]} exited ${code}`)
	})

export const openSession = (key: string) => handOver(["open", key])

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
