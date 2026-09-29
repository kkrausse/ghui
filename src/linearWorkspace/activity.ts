/**
 * The issue's activity feed: what changed, when, and who did it.
 *
 * Linear's `IssueHistory` is one row per *event*, and one event can carry
 * several changes at once -- moving a ticket to In Review while reassigning it
 * is a single node with both `toState` and `toAssignee` set. Every field is
 * nullish, so the only safe read is a guarded one. This fans each node out into
 * a row per change, which is what makes the feed scannable: one line, one fact.
 *
 * Comments are interleaved by timestamp, and the issue's own creation is
 * synthesized from `createdAt` -- Linear does not record it as a history entry,
 * so a feed without it starts mid-story.
 */
import type { Comment, IssueDetail, IssueHistory } from "./linear/schema.ts"
import { color, priorityStyle, stateColor, stateGlyph } from "./theme.ts"

export type ActivityRow = {
	/** Unique per row, not per event: one node fans out into several. */
	key: string
	/** ISO timestamp of the event this row came from. */
	at: string
	actor: string
	text: string
	fg: string
}

/** How much of a comment body stands in for it in the feed. */
const PREVIEW_CHARS = 60

/**
 * Who did it. `actor` is null for anything an integration or a Linear
 * automation did, and `botActor` names those -- a GitHub PR merge moving the
 * status reads as "GitHub", not as a blank.
 */
function actorName(h: IssueHistory): string {
	if (h.actor?.displayName) return h.actor.displayName
	const bot = h.botActor
	if (bot?.name) return bot.userDisplayName ? `${bot.name} (${bot.userDisplayName})` : bot.name
	return "unknown"
}

function cycleLabel(cycle: { number: number; name?: string | null | undefined }): string {
	return cycle.name?.trim() || `Cycle ${cycle.number}`
}

/**
 * `IssueRelationHistoryPayload.type` is a two-letter code Linear's schema does
 * not document: action then relation. Decoded by matching the codes on real
 * issues against those issues' current relations --
 *
 *   ar -> added related, ab -> added blocking, am -> added duplicate
 *
 * -- so the second letter maps here and the first is the sign. An unrecognized
 * code renders as itself rather than as a guess.
 */
const RELATION_KIND: Record<string, string> = { r: "related", b: "blocking", m: "duplicate" }

function relationText(type: string, identifier: string): string {
	const kind = RELATION_KIND[type[1] ?? ""]
	if (!kind) return `relation ${type} ${identifier}`
	return `${type[0] === "r" ? "−" : "+"}${kind} ${identifier}`
}

/** First non-empty line of a comment, flattened and clipped. */
function preview(body: string): string {
	const line = body
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 0)
	if (!line) return ""
	return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS - 1)}…` : line
}

/**
 * Every change one history node carries, in the order they are worth reading.
 * Returns nothing for a node whose only fields are ones this does not render --
 * an empty event is dropped rather than shown as a blank line.
 */
function changes(h: IssueHistory): { text: string; fg: string }[] {
	const rows: { text: string; fg: string }[] = []

	// Linear reports auto-close and auto-archive alongside the state move they
	// caused, so they qualify that row rather than earning one of their own.
	const auto = h.autoClosed ? " · auto-closed" : h.autoArchived ? " · auto-archived" : ""

	if (h.toState) {
		const to = `${stateGlyph(h.toState.type)} ${h.toState.name}`
		const from = h.fromState ? `${stateGlyph(h.fromState.type)} ${h.fromState.name} → ` : ""
		rows.push({
			text: `${from}${to}${auto}`,
			fg: stateColor(h.toState.type, h.toState.color),
		})
	} else if (auto) {
		rows.push({ text: auto.replace(" · ", ""), fg: color.dim })
	}

	if (h.toAssignee || h.fromAssignee) {
		const text = h.toAssignee
			? h.fromAssignee
				? `reassigned ${h.fromAssignee.displayName} → ${h.toAssignee.displayName}`
				: `assigned to ${h.toAssignee.displayName}`
			: `unassigned ${h.fromAssignee!.displayName}`
		rows.push({ text, fg: color.fg })
	}

	if (h.toPriority != null || h.fromPriority != null) {
		const from = h.fromPriority != null ? `${priorityStyle(h.fromPriority).label} → ` : ""
		rows.push({
			text: `priority ${from}${priorityStyle(h.toPriority).label}`,
			fg: priorityStyle(h.toPriority).fg,
		})
	}

	for (const label of h.addedLabels ?? []) {
		rows.push({ text: `+label ${label.name}`, fg: color.fg })
	}
	for (const label of h.removedLabels ?? []) {
		rows.push({ text: `−label ${label.name}`, fg: color.dim })
	}

	if (h.toCycle || h.fromCycle) {
		const from = h.fromCycle ? `${cycleLabel(h.fromCycle)} → ` : ""
		rows.push({
			text: `cycle ${from}${h.toCycle ? cycleLabel(h.toCycle) : "none"}`,
			fg: color.fg,
		})
	}

	if (h.toProject || h.fromProject) {
		const from = h.fromProject ? `${h.fromProject.name} → ` : ""
		rows.push({ text: `project ${from}${h.toProject?.name ?? "none"}`, fg: color.fg })
	}

	if (h.toTeam || h.fromTeam) {
		const from = h.fromTeam ? `${h.fromTeam.key} → ` : ""
		rows.push({ text: `team ${from}${h.toTeam?.key ?? "none"}`, fg: color.fg })
	}

	if (h.toParent || h.fromParent) {
		const text = h.toParent ? `parent ${h.toParent.identifier}` : `removed parent ${h.fromParent!.identifier}`
		rows.push({ text, fg: color.fg })
	}

	if (h.toEstimate != null || h.fromEstimate != null) {
		const from = h.fromEstimate != null ? `${h.fromEstimate} → ` : ""
		rows.push({ text: `estimate ${from}${h.toEstimate ?? "none"}`, fg: color.fg })
	}

	if (h.toDueDate || h.fromDueDate) {
		const from = h.fromDueDate ? `${h.fromDueDate} → ` : ""
		rows.push({ text: `due ${from}${h.toDueDate ?? "none"}`, fg: color.fg })
	}

	if (h.toTitle) rows.push({ text: `renamed to "${h.toTitle}"`, fg: color.fg })

	if (h.updatedDescription) rows.push({ text: "edited the description", fg: color.dim })

	for (const relation of h.relationChanges ?? []) {
		rows.push({ text: relationText(relation.type, relation.identifier), fg: color.fg })
	}

	if (h.attachment) {
		rows.push({
			text: `linked ${h.attachment.title || h.attachment.url || "an attachment"}`,
			fg: color.low,
		})
	}

	// `false` is a real value here -- it is how Linear records a restore.
	if (h.archived != null) {
		rows.push({ text: h.archived ? "archived" : "unarchived", fg: color.dim })
	}
	if (h.trashed != null) {
		rows.push({ text: h.trashed ? "trashed" : "restored", fg: color.dim })
	}

	return rows
}

function commentRow(comment: Comment): ActivityRow {
	const body = preview(comment.body)
	return {
		key: `comment:${comment.id}`,
		at: comment.createdAt,
		actor: comment.user?.displayName ?? "someone",
		text: body ? `commented: ${body}` : "commented",
		fg: color.low,
	}
}

/**
 * The whole feed, newest first. Ties keep insertion order -- `sort` is stable --
 * so the several changes of one event stay in the order `changes()` emits them,
 * and the synthesized creation row stays last however the timestamps land.
 */
export function buildActivity(detail: IssueDetail): ActivityRow[] {
	const rows: ActivityRow[] = []

	for (const h of detail.history?.nodes ?? []) {
		const actor = actorName(h)
		changes(h).forEach((change, i) => {
			rows.push({ key: `${h.id}:${i}`, at: h.createdAt, actor, ...change })
		})
	}

	for (const comment of detail.comments?.nodes ?? []) rows.push(commentRow(comment))

	rows.push({
		key: "created",
		at: detail.createdAt,
		actor: detail.creator?.displayName ?? "someone",
		text: "created the issue",
		fg: color.dim,
	})

	return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/**
 * Whether Linear has activity older than what came down. Only the newest
 * HISTORY_LIMIT entries are fetched, so a long-running ticket has a gap between
 * its creation row and its oldest loaded change -- the pane says so rather than
 * implying the feed is complete.
 */
export function activityTruncated(detail: IssueDetail): boolean {
	return detail.history?.pageInfo?.hasNextPage === true
}
