/**
 * Write path. Every mutation goes through here so cache invalidation and the
 * "did Linear actually accept it" check live in one place.
 *
 * Requires a write-scoped key. With a Read-only key these fail with a scope
 * error, which surfaces in the status bar -- reads keep working.
 */
import { cached, gql, invalidateCache } from "./linear/client.ts"
import { COMMENT_CREATE, ISSUE_UPDATE, NOTIFICATION_ARCHIVE, NOTIFICATION_UPDATE, PROJECT_UPDATE_CREATE, TEAM_WORKFLOW, UNREAD_COUNT } from "./linear/queries.ts"
import {
	CommentCreateSchema,
	IssueUpdateSchema,
	NotificationArchiveSchema,
	NotificationUpdateSchema,
	ProjectUpdateCreateSchema,
	TeamWorkflowSchema,
	UnreadCountSchema,
	type TeamWorkflow,
} from "./linear/schema.ts"

export const PRIORITIES = [
	{ value: 1, label: "Urgent" },
	{ value: 2, label: "High" },
	{ value: 3, label: "Medium" },
	{ value: 4, label: "Low" },
	{ value: 0, label: "No priority" },
] as const

/** Workflow states, membership, and cycle schedules change slowly; the view cache is plenty. */
export async function loadTeamWorkflow(teamId: string): Promise<TeamWorkflow | null> {
	const d = await cached(`workflow:${teamId}`, () => gql(TEAM_WORKFLOW, { teamId }, TeamWorkflowSchema))
	if (!d.team) return null
	// Linear orders the board by `position`; match it so the picker reads like the UI.
	return {
		...d.team,
		states: { nodes: [...d.team.states.nodes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) },
	}
}

type UpdateInput = { stateId: string } | { assigneeId: string | null } | { priority: number } | { cycleId: string | null }

/**
 * `issueUpdate` returns success:false rather than erroring on some refusals, so
 * both paths have to be checked before we tell the user it worked.
 */
export async function updateIssue(issueId: string, input: UpdateInput): Promise<void> {
	const d = await gql(ISSUE_UPDATE, { id: issueId, input }, IssueUpdateSchema)
	if (!d.issueUpdate.success) throw new Error("Linear rejected the update")
	// The edited issue is in whatever list is on screen; drop everything and refetch.
	invalidateCache()
}

/**
 * Sidebar badge. `notificationsUnreadCount` is flagged internal in Linear's SDL,
 * so a key that cannot read it must not take the sidebar down with it -- a null
 * return means "no badge", and the inbox view still counts what it loaded.
 */
export async function unreadCount(): Promise<number | null> {
	try {
		const d = await gql(UNREAD_COUNT, {}, UnreadCountSchema)
		return d.notificationsUnreadCount
	} catch {
		return null
	}
}

/** `readAt` null marks unread again; a timestamp marks it read. */
export async function setNotificationRead(id: string, read: boolean): Promise<void> {
	const d = await gql(NOTIFICATION_UPDATE, { id, readAt: read ? new Date().toISOString() : null }, NotificationUpdateSchema)
	if (!d.notificationUpdate.success) throw new Error("Linear rejected the notification update")
	invalidateCache()
}

/** Linear's inbox "archive" -- the row leaves the default (unarchived) query. */
export async function archiveNotification(id: string): Promise<void> {
	const d = await gql(NOTIFICATION_ARCHIVE, { id }, NotificationArchiveSchema)
	if (!d.notificationArchive.success) throw new Error("Linear rejected the archive")
	invalidateCache()
}

/**
 * What a comment hangs off. Linear takes a different id per surface and no
 * `projectId` at all -- a project's own thread is addressed by its document
 * content. Exactly one is sent; the other two go null.
 */
export type CommentAnchor = { issueId: string } | { projectUpdateId: string } | { documentContentId: string }

/**
 * `parentId` makes it a threaded reply; null posts at the top level. It has to be
 * a *top-level* comment's id -- Linear threads one level and answers a reply's id
 * with "Parent comment must be a top level comment". `replyTarget()` resolves
 * that before the id gets here.
 *
 * The input is spread from the anchor union so exactly one anchor key exists.
 * Sending the other two as explicit nulls is what Linear rejects; see
 * COMMENT_CREATE.
 */
export async function addComment(anchor: CommentAnchor, body: string, parentId: string | null = null): Promise<void> {
	const trimmed = body.trim()
	if (!trimmed) throw new Error("Empty comment")
	const input = { ...anchor, body: trimmed, ...(parentId ? { parentId } : {}) }
	const d = await gql(COMMENT_CREATE, { input }, CommentCreateSchema)
	if (!d.commentCreate.success) throw new Error("Linear rejected the comment")
	invalidateCache()
}

/** Offered by the health picker that precedes the update composer. */
export const HEALTHS = [
	{ value: "onTrack", label: "On track" },
	{ value: "atRisk", label: "At risk" },
	{ value: "offTrack", label: "Off track" },
] as const

export type Health = (typeof HEALTHS)[number]["value"]

/** Posts a project update. Health is what Linear's own composer asks for first. */
export async function createProjectUpdate(projectId: string, body: string, health: Health): Promise<void> {
	const trimmed = body.trim()
	if (!trimmed) throw new Error("Empty update")
	const d = await gql(PROJECT_UPDATE_CREATE, { projectId, body: trimmed, health }, ProjectUpdateCreateSchema)
	if (!d.projectUpdateCreate.success) throw new Error("Linear rejected the update")
	invalidateCache()
}
