/**
 * Valibot schemas for Linear API responses.
 *
 * Everything Linear can return null for is `nullish` -- a missing assignee or
 * project must not blank the whole list. Unknown extra fields are ignored, so
 * schema drift on Linear's side degrades to missing data, not a crash.
 */
import * as v from "valibot"

const NamedColor = v.object({
	name: v.string(),
	color: v.nullish(v.string()),
})

const WorkflowState = v.object({
	id: v.nullish(v.string()),
	name: v.string(),
	color: v.nullish(v.string()),
	type: v.string(),
})

const User = v.object({
	id: v.nullish(v.string()),
	displayName: v.string(),
	isMe: v.nullish(v.boolean()),
})

/**
 * One GitHub/GitLab review, as the PR attachment's metadata carries it. A
 * reviewer appears once per submitted review, so the same person shows up twice
 * if they commented and then approved -- `git.ts` collapses that.
 */
const AttachmentReview = v.object({
	state: v.nullish(v.string()),
	reviewerLogin: v.nullish(v.string()),
	isBot: v.nullish(v.boolean()),
	submittedAt: v.nullish(v.string()),
})

/**
 * `metadata` is a free-form JSONObject whose shape depends on the integration.
 * Every field is nullish because a commit attachment carries a different subset
 * than a PR, and an `api` attachment carries an empty object. Unknown keys are
 * dropped by valibot, so the ones Linear adds later cost nothing.
 */
const AttachmentMetadata = v.object({
	number: v.nullish(v.number()),
	/** draft · open · inReview · merged · closed. Absent on commit attachments. */
	status: v.nullish(v.string()),
	draft: v.nullish(v.boolean()),
	branch: v.nullish(v.string()),
	targetBranch: v.nullish(v.string()),
	repoName: v.nullish(v.string()),
	repoLogin: v.nullish(v.string()),
	hasConflicts: v.nullish(v.boolean()),
	commitId: v.nullish(v.string()),
	reviews: v.nullish(v.array(AttachmentReview)),
	mergedAt: v.nullish(v.string()),
	closedAt: v.nullish(v.string()),
	updatedAt: v.nullish(v.string()),
})

export const AttachmentSchema = v.object({
	id: v.string(),
	title: v.nullish(v.string()),
	url: v.string(),
	sourceType: v.nullish(v.string()),
	metadata: v.nullish(AttachmentMetadata),
})

export type Attachment = v.InferOutput<typeof AttachmentSchema>

export const IssueSchema = v.object({
	id: v.string(),
	identifier: v.string(),
	title: v.string(),
	url: v.string(),
	branchName: v.nullish(v.string()),
	priority: v.nullish(v.number()),
	priorityLabel: v.nullish(v.string()),
	estimate: v.nullish(v.number()),
	createdAt: v.string(),
	updatedAt: v.nullish(v.string()),
	state: v.nullish(WorkflowState),
	assignee: v.nullish(User),
	/** `id` is what the project drill-down keys off; name and color are what the row paints. */
	project: v.nullish(v.object({ id: v.string(), name: v.string(), color: v.nullish(v.string()) })),
	cycle: v.nullish(v.object({ number: v.number(), name: v.nullish(v.string()) })),
	labels: v.nullish(v.object({ nodes: v.array(NamedColor) })),
	/** Needed to look up which workflow states and members the edit pickers may offer. */
	team: v.nullish(v.object({ id: v.string(), key: v.string() })),
	/** Linked PRs and commits. Raw; `gitLinks()` turns these into renderable rows. */
	attachments: v.nullish(v.object({ nodes: v.array(AttachmentSchema) })),
})

export type Issue = v.InferOutput<typeof IssueSchema>

/**
 * Relay cursor. `nullish` rather than required so a connection that predates
 * pagination -- or a stubbed response in a test -- degrades to "one page" instead
 * of failing validation.
 */
export const PageInfoSchema = v.object({
	hasNextPage: v.nullish(v.boolean()),
	endCursor: v.nullish(v.string()),
})

export type PageInfo = v.InferOutput<typeof PageInfoSchema>

const IssueNodes = v.object({
	nodes: v.array(IssueSchema),
	pageInfo: v.nullish(PageInfoSchema),
})

export const CycleSchema = v.object({
	id: v.string(),
	number: v.number(),
	name: v.nullish(v.string()),
	startsAt: v.nullish(v.string()),
	endsAt: v.nullish(v.string()),
	progress: v.nullish(v.number()),
})

export type Cycle = v.InferOutput<typeof CycleSchema>

export const TeamSchema = v.object({
	id: v.string(),
	key: v.string(),
	name: v.string(),
	activeCycle: v.nullish(CycleSchema),
})

export type Team = v.InferOutput<typeof TeamSchema>

/** The workspace's project flow: backlog / planned / started / paused / completed / canceled. */
export const ProjectStatusSchema = v.object({
	id: v.nullish(v.string()),
	name: v.string(),
	type: v.string(),
	color: v.nullish(v.string()),
})

export type ProjectStatus = v.InferOutput<typeof ProjectStatusSchema>

/** `onTrack` / `atRisk` / `offTrack`, or null until the first update is posted. */
export const HealthSchema = v.nullish(v.string())

export const ProjectSchema = v.object({
	id: v.string(),
	name: v.string(),
	description: v.nullish(v.string()),
	progress: v.nullish(v.number()),
	targetDate: v.nullish(v.string()),
	health: HealthSchema,
	status: v.nullish(ProjectStatusSchema),
	lead: v.nullish(v.object({ displayName: v.string() })),
})

export type Project = v.InferOutput<typeof ProjectSchema>

export const CustomViewSchema = v.object({ id: v.string(), name: v.string() })
export type CustomView = v.InferOutput<typeof CustomViewSchema>

export const BootstrapSchema = v.object({
	viewer: v.object({
		id: v.string(),
		name: v.string(),
		displayName: v.string(),
		teamMemberships: v.object({
			nodes: v.array(v.object({ sortOrder: v.number(), team: TeamSchema })),
		}),
	}),
	customViews: v.object({ nodes: v.array(CustomViewSchema) }),
})

export type Bootstrap = v.InferOutput<typeof BootstrapSchema>

export const MyIssuesSchema = v.object({ issues: IssueNodes })
export const TeamIssuesSchema = v.object({ issues: IssueNodes })
export const SearchIssuesSchema = v.object({ searchIssues: IssueNodes })

export const CycleIssuesSchema = v.object({
	cycle: v.nullish(v.object({ ...CycleSchema.entries, issues: IssueNodes })),
})

export const TeamProjectsSchema = v.object({
	team: v.nullish(v.object({ projects: v.object({ nodes: v.array(ProjectSchema) }) })),
})

export const MyProjectsSchema = v.object({ projects: v.object({ nodes: v.array(ProjectSchema) }) })

export const ProjectIssuesSchema = v.object({
	project: v.nullish(v.object({ id: v.string(), name: v.string(), issues: IssueNodes })),
})

export const CustomViewIssuesSchema = v.object({
	customView: v.nullish(v.object({ id: v.string(), name: v.string(), issues: IssueNodes })),
})

/**
 * Inbox row. Only `IssueNotification` carries `issue`/`comment` and only
 * `ProjectNotification` carries `project`/`projectUpdate`, so all four are
 * nullish here and the UI falls back to opening `url` for the notification
 * types that name neither.
 */
export const NotificationSchema = v.object({
	id: v.string(),
	type: v.string(),
	title: v.string(),
	subtitle: v.nullish(v.string()),
	url: v.string(),
	createdAt: v.string(),
	readAt: v.nullish(v.string()),
	snoozedUntilAt: v.nullish(v.string()),
	actor: v.nullish(v.object({ displayName: v.string() })),
	issue: v.nullish(
		v.object({
			id: v.string(),
			identifier: v.string(),
			title: v.string(),
			state: v.nullish(WorkflowState),
			team: v.nullish(v.object({ id: v.string(), key: v.string() })),
		}),
	),
	comment: v.nullish(v.object({ id: v.string(), body: v.string() })),
	/**
	 * Enough of the project to drill into it -- the project panes refetch by id,
	 * and `name` is only the pane title until they land.
	 */
	project: v.nullish(v.object({ id: v.string(), name: v.string() })),
	/** Set when the notification is about one posted update rather than the project. */
	projectUpdate: v.nullish(v.object({ id: v.string() })),
})

export type Notification = v.InferOutput<typeof NotificationSchema>

export const NotificationsSchema = v.object({
	notifications: v.object({
		nodes: v.array(NotificationSchema),
		pageInfo: v.nullish(PageInfoSchema),
	}),
})

export const UnreadCountSchema = v.object({ notificationsUnreadCount: v.number() })

export const NotificationUpdateSchema = v.object({
	notificationUpdate: v.object({ success: v.boolean() }),
})

export const NotificationArchiveSchema = v.object({
	notificationArchive: v.object({ success: v.boolean() }),
})

export const CommentSchema = v.object({
	id: v.string(),
	body: v.string(),
	createdAt: v.string(),
	url: v.nullish(v.string()),
	resolvedAt: v.nullish(v.string()),
	user: v.nullish(v.object({ displayName: v.string(), isMe: v.nullish(v.boolean()) })),
	/** Present on replies. Threads are rebuilt client-side from this. */
	parent: v.nullish(v.object({ id: v.string() })),
})

export type Comment = v.InferOutput<typeof CommentSchema>

const CommentNodes = v.object({ nodes: v.array(CommentSchema) })

// ---- project workspace ----

/**
 * One posted project update. Its comment thread arrives with it so opening an
 * update costs no request -- see PROJECT_UPDATES.
 */
export const ProjectUpdateSchema = v.object({
	id: v.string(),
	body: v.string(),
	health: HealthSchema,
	createdAt: v.string(),
	editedAt: v.nullish(v.string()),
	url: v.nullish(v.string()),
	/** Linear's own "this update is older than the reminder cadence" flag. */
	isStale: v.nullish(v.boolean()),
	user: v.nullish(User),
	comments: v.nullish(CommentNodes),
})

export type ProjectUpdate = v.InferOutput<typeof ProjectUpdateSchema>

export const ProjectMilestoneSchema = v.object({
	id: v.string(),
	name: v.string(),
	targetDate: v.nullish(v.string()),
	status: v.nullish(v.string()),
	progress: v.nullish(v.number()),
})

export type ProjectMilestone = v.InferOutput<typeof ProjectMilestoneSchema>

export const ProjectDetailSchema = v.object({
	project: v.nullish(
		v.object({
			...ProjectSchema.entries,
			content: v.nullish(v.string()),
			icon: v.nullish(v.string()),
			color: v.nullish(v.string()),
			url: v.nullish(v.string()),
			scope: v.nullish(v.number()),
			startDate: v.nullish(v.string()),
			healthUpdatedAt: v.nullish(v.string()),
			createdAt: v.nullish(v.string()),
			updatedAt: v.nullish(v.string()),
			lead: v.nullish(User),
			members: v.nullish(v.object({ nodes: v.array(User) })),
			teams: v.nullish(v.object({ nodes: v.array(v.object({ id: v.string(), key: v.string() })) })),
			/** The only handle `commentCreate` takes for a project-level comment. */
			documentContent: v.nullish(v.object({ id: v.string() })),
			lastUpdate: v.nullish(ProjectUpdateSchema),
			projectMilestones: v.nullish(v.object({ nodes: v.array(ProjectMilestoneSchema) })),
			comments: v.nullish(CommentNodes),
		}),
	),
})

export type ProjectDetail = NonNullable<v.InferOutput<typeof ProjectDetailSchema>["project"]>

export const ProjectUpdatesSchema = v.object({
	project: v.nullish(
		v.object({
			id: v.string(),
			name: v.string(),
			projectUpdates: v.object({
				nodes: v.array(ProjectUpdateSchema),
				pageInfo: v.nullish(PageInfoSchema),
			}),
		}),
	),
})

export const ProjectUpdateCreateSchema = v.object({
	projectUpdateCreate: v.object({
		success: v.boolean(),
		projectUpdate: v.nullish(v.object({ id: v.string(), url: v.nullish(v.string()) })),
	}),
})

/**
 * One entry in an issue's activity feed. Every change field is nullish and one
 * entry can set several at once, so nothing here may be read without a guard --
 * `activity.ts` is the only thing that does the reading.
 */
export const IssueHistorySchema = v.object({
	id: v.string(),
	createdAt: v.string(),
	updatedDescription: v.nullish(v.boolean()),
	fromTitle: v.nullish(v.string()),
	toTitle: v.nullish(v.string()),
	fromPriority: v.nullish(v.number()),
	toPriority: v.nullish(v.number()),
	fromEstimate: v.nullish(v.number()),
	toEstimate: v.nullish(v.number()),
	fromDueDate: v.nullish(v.string()),
	toDueDate: v.nullish(v.string()),
	archived: v.nullish(v.boolean()),
	trashed: v.nullish(v.boolean()),
	autoClosed: v.nullish(v.boolean()),
	autoArchived: v.nullish(v.boolean()),
	/** Null when an integration or a Linear automation made the change. */
	actor: v.nullish(v.object({ displayName: v.string() })),
	/** Names that integration or automation. `userDisplayName` is who it acted for. */
	botActor: v.nullish(v.object({ name: v.nullish(v.string()), userDisplayName: v.nullish(v.string()) })),
	fromState: v.nullish(WorkflowState),
	toState: v.nullish(WorkflowState),
	fromAssignee: v.nullish(v.object({ displayName: v.string() })),
	toAssignee: v.nullish(v.object({ displayName: v.string() })),
	fromCycle: v.nullish(v.object({ number: v.number(), name: v.nullish(v.string()) })),
	toCycle: v.nullish(v.object({ number: v.number(), name: v.nullish(v.string()) })),
	fromProject: v.nullish(v.object({ name: v.string() })),
	toProject: v.nullish(v.object({ name: v.string() })),
	fromTeam: v.nullish(v.object({ key: v.string() })),
	toTeam: v.nullish(v.object({ key: v.string() })),
	fromParent: v.nullish(v.object({ identifier: v.string() })),
	toParent: v.nullish(v.object({ identifier: v.string() })),
	addedLabels: v.nullish(v.array(v.object({ name: v.string() }))),
	removedLabels: v.nullish(v.array(v.object({ name: v.string() }))),
	/** `type` is Linear's relation verb: blocks, duplicate, related. */
	relationChanges: v.nullish(v.array(v.object({ identifier: v.string(), type: v.string() }))),
	attachment: v.nullish(v.object({ title: v.nullish(v.string()), url: v.nullish(v.string()) })),
})

export type IssueHistory = v.InferOutput<typeof IssueHistorySchema>

export const IssueDetailSchema = v.object({
	issue: v.nullish(
		v.object({
			...IssueSchema.entries,
			description: v.nullish(v.string()),
			creator: v.nullish(v.object({ displayName: v.string() })),
			parent: v.nullish(v.object({ identifier: v.string(), title: v.string() })),
			children: v.nullish(
				v.object({
					nodes: v.array(
						v.object({
							identifier: v.string(),
							title: v.string(),
							state: v.nullish(v.object({ name: v.string(), type: v.string() })),
						}),
					),
				}),
			),
			comments: v.nullish(v.object({ nodes: v.array(CommentSchema) })),
			history: v.nullish(
				v.object({
					nodes: v.array(IssueHistorySchema),
					pageInfo: v.nullish(PageInfoSchema),
				}),
			),
		}),
	),
})

export type IssueDetail = NonNullable<v.InferOutput<typeof IssueDetailSchema>["issue"]>

export const TeamWorkflowSchema = v.object({
	team: v.nullish(
		v.object({
			id: v.string(),
			states: v.object({
				nodes: v.array(
					v.object({
						id: v.string(),
						name: v.string(),
						color: v.nullish(v.string()),
						type: v.string(),
						position: v.nullish(v.number()),
					}),
				),
			}),
			members: v.object({
				nodes: v.array(
					v.object({
						id: v.string(),
						displayName: v.string(),
						isMe: v.nullish(v.boolean()),
					}),
				),
			}),
			activeCycle: v.nullish(CycleSchema),
			cycles: v.object({
				nodes: v.array(
					v.object({
						id: v.string(),
						number: v.number(),
						name: v.nullish(v.string()),
						startsAt: v.nullish(v.string()),
						endsAt: v.nullish(v.string()),
					}),
				),
			}),
		}),
	),
})

export type TeamWorkflow = NonNullable<v.InferOutput<typeof TeamWorkflowSchema>["team"]>
export type WorkflowStateOption = TeamWorkflow["states"]["nodes"][number]
export type MemberOption = TeamWorkflow["members"]["nodes"][number]
export type CycleOption = TeamWorkflow["cycles"]["nodes"][number]

/** Mutations report their own success flag rather than throwing on refusal. */
export const IssueUpdateSchema = v.object({
	issueUpdate: v.object({
		success: v.boolean(),
		issue: v.nullish(v.object({ id: v.string(), identifier: v.string() })),
	}),
})

export const CommentCreateSchema = v.object({
	commentCreate: v.object({
		success: v.boolean(),
		comment: v.nullish(v.object({ id: v.string() })),
	}),
})
