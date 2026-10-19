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
	/** The machine's short name from faplex's config, filled in by `indexSessions`. */
	host?: string
}

export type FaplexSnapshot = {
	machines: { id: string; short: string; remote: boolean; dir: string }[]
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
 * outside GHUI turn up too. Untouched drafts are left out.
 */
export const indexSessions = (snapshot: FaplexSnapshot | null): SessionsFor => {
	if (!snapshot) return noSessions
	const byTicket = new Map<string, FaplexSession[]>()
	const short = new Map(snapshot.machines.map((m) => [m.id, m.short]))
	for (const listed of snapshot.sessions) {
		if (listed.prompted === false && listed.status === "idle") continue
		const session = { ...listed, host: short.get(listed.machine) ?? listed.machine }
		const mentioned = `${session.title} ${session.detail} ${session.cwd}`.match(TICKET_ID) ?? []
		const ids = new Set([...session.tags, ...mentioned].map((id) => id.toUpperCase()))
		for (const id of ids) byTicket.set(id, [...(byTicket.get(id) ?? []), session])
	}
	for (const sessions of byTicket.values()) sessions.sort((a, b) => Number(a.archived) - Number(b.archived) || ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt)
	return (issue) => byTicket.get(issue.identifier.toUpperCase()) ?? []
}

/** How many start directories the picker offers per machine × harness. */
const DIRS_PER_TARGET = 3

/**
 * Where a new session can start: every machine × harness without a problem
 * (`faplex new` waits for one that hasn't reported yet), last picked first.
 * Directories come from the ticket's own sessions, then the machine's default,
 * then where its recent sessions ran.
 */
export const sessionTargets = (snapshot: FaplexSnapshot, ticketSessions: readonly FaplexSession[] = []) => {
	const recent = [...ticketSessions, ...[...snapshot.sessions].sort((a, b) => b.updatedAt - a.updatedAt)]
	const last = snapshot.lastPick
	const isLast = (s: { machine: string; harness: string }) => s.machine === last?.machine && s.harness === last?.harness
	return snapshot.sources
		.filter((s) => !s.problem)
		.sort((a, b) => Number(isLast(b)) - Number(isLast(a)))
		.flatMap((s) => {
			const fallback = snapshot.machines.find((m) => m.id === s.machine)?.dir ?? "~"
			const onMachine = recent.filter((r) => r.machine === s.machine).map((r) => r.cwd)
			const dirs = [...new Set([...ticketSessions.filter((r) => r.machine === s.machine).map((r) => r.cwd), fallback, ...onMachine])]
			return dirs.slice(0, DIRS_PER_TARGET).map((dir) => ({ machine: s.machine, harness: s.harness, dir }))
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

export const startSession = (input: { machine: string; harness: string; dir: string; prompt: string; tags: string[] }) =>
	handOver(["new", "--machine", input.machine, "--harness", input.harness, "--dir", input.dir, "--prompt", input.prompt, ...input.tags.flatMap((t) => ["--tag", t])])
