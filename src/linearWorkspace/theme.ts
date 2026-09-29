/** Palette and glyph mapping. Tuned for dark terminals; readable on light. */

export const color = {
	fg: "#c9d1d9",
	dim: "#6e7681",
	faint: "#484f58",
	accent: "#8b7bd8",
	border: "#30363d",
	borderFocus: "#8b7bd8",
	selectedBg: "#1f2430",
	urgent: "#f85149",
	high: "#f0883e",
	medium: "#d29922",
	low: "#58a6ff",
	started: "#e3b341",
	done: "#8b7bd8",
	canceled: "#6e7681",
	ok: "#3fb950",
} as const

/**
 * Copy-to-clipboard affordance. One cell, from the same Miscellaneous Technical
 * block as the branch glyph the detail pane already renders, so a terminal that
 * shows one shows the other.
 */
export const COPY_ICON = "⎘"

/** Linear priority is 0=none, 1=urgent .. 4=low. */
const PRIORITY: Record<number, { glyph: string; fg: string; label: string }> = {
	1: { glyph: "!!", fg: color.urgent, label: "Urgent" },
	2: { glyph: "↑ ", fg: color.high, label: "High" },
	3: { glyph: "= ", fg: color.medium, label: "Medium" },
	4: { glyph: "↓ ", fg: color.low, label: "Low" },
}

const NO_PRIORITY = { glyph: "· ", fg: color.faint, label: "None" }

export function priorityStyle(priority: number | null | undefined) {
	return PRIORITY[priority ?? 0] ?? NO_PRIORITY
}

/** Workflow state type -> glyph. Mirrors Linear's own status iconography. */
const STATE_GLYPH: Record<string, string> = {
	backlog: "○",
	unstarted: "◌",
	started: "◐",
	completed: "●",
	canceled: "⊘",
	triage: "◆",
}

export function stateGlyph(type: string | null | undefined): string {
	return STATE_GLYPH[type ?? ""] ?? "○"
}

/**
 * Linear ships per-state hex colors; trust them when present so the TUI matches
 * the web UI, and fall back to a type-derived color when it does not.
 */
export function stateColor(type: string | null | undefined, linearColor: string | null | undefined): string {
	if (linearColor && /^#[0-9a-fA-F]{6}$/.test(linearColor)) return linearColor
	switch (type) {
		case "started":
			return color.started
		case "completed":
			return color.done
		case "canceled":
			return color.canceled
		default:
			return color.dim
	}
}

/**
 * Project health, as declared by the last project update. Distinct from the
 * project's workflow status: an In Progress project can be Off track.
 */
const HEALTH: Record<string, { glyph: string; fg: string; label: string }> = {
	onTrack: { glyph: "●", fg: color.ok, label: "On track" },
	atRisk: { glyph: "◐", fg: color.medium, label: "At risk" },
	offTrack: { glyph: "▲", fg: color.urgent, label: "Off track" },
}

const NO_HEALTH = { glyph: "○", fg: color.faint, label: "No update" }

export function healthStyle(health: string | null | undefined) {
	return HEALTH[health ?? ""] ?? NO_HEALTH
}

/** ProjectStatusType, which has two members no issue workflow state has. */
const PROJECT_STATUS_GLYPH: Record<string, string> = {
	backlog: "○",
	planned: "◔",
	started: "◐",
	paused: "◫",
	completed: "●",
	canceled: "⊘",
}

export function projectStatusGlyph(type: string | null | undefined): string {
	return PROJECT_STATUS_GLYPH[type ?? ""] ?? "○"
}

/**
 * Pull request state, as Linear's GitHub integration reports it. `open` and
 * `inReview` are separate states there: `inReview` means a review was requested,
 * `open` means nobody has been asked yet -- worth different colors, since the
 * second one is usually waiting on you.
 */
const GIT_STATUS: Record<string, { glyph: string; fg: string; label: string }> = {
	draft: { glyph: "◌", fg: color.faint, label: "draft" },
	open: { glyph: "○", fg: color.low, label: "open" },
	inReview: { glyph: "◐", fg: color.medium, label: "in review" },
	merged: { glyph: "●", fg: color.done, label: "merged" },
	closed: { glyph: "⊘", fg: color.canceled, label: "closed" },
}

const UNKNOWN_GIT_STATUS = { glyph: "◇", fg: color.dim, label: "unknown" }

export function gitStatusStyle(status: string | null | undefined) {
	return GIT_STATUS[status ?? ""] ?? UNKNOWN_GIT_STATUS
}

/** ProjectMilestoneStatus. `overdue` is the only one that needs to shout. */
const MILESTONE_STYLE: Record<string, { glyph: string; fg: string }> = {
	unstarted: { glyph: "○", fg: color.dim },
	next: { glyph: "◐", fg: color.started },
	overdue: { glyph: "▲", fg: color.urgent },
	done: { glyph: "●", fg: color.ok },
}

export function milestoneStyle(status: string | null | undefined) {
	return MILESTONE_STYLE[status ?? ""] ?? { glyph: "○", fg: color.dim }
}

/** Compact relative age -- absolute timestamps waste columns in a list. */
export function relativeAge(iso: string | null | undefined): string {
	if (!iso) return ""
	const then = Date.parse(iso)
	if (Number.isNaN(then)) return ""
	const mins = Math.floor((Date.now() - then) / 60_000)
	if (mins < 60) return `${Math.max(mins, 0)}m`
	const hours = Math.floor(mins / 60)
	if (hours < 24) return `${hours}h`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days}d`
	const months = Math.floor(days / 30)
	if (months < 12) return `${months}mo`
	return `${Math.floor(months / 12)}y`
}

/**
 * Absolute local stamp for the activity feed, where "3d" is not enough to line
 * an event up against a deploy or a Slack thread. The year only appears when it
 * is not the current one, so a feed of recent events stays narrow.
 */
export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "—"
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return "—"
	const day = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
	const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
	const thisYear = d.getFullYear() === new Date().getFullYear()
	return `${day}${thisYear ? "" : ` '${String(d.getFullYear()).slice(2)}`} ${time}`
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return "—"
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return "—"
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
