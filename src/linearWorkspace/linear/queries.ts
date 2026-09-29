/**
 * GraphQL documents for the Linear API.
 *
 * The issue field set is ported from markmarkoh/lt (MIT), extended with cycle,
 * updatedAt, and comments. Kept as one shared fragment so every list view
 * renders from an identical shape.
 */

/**
 * Page size for every issue connection. Small enough that the first paint is
 * quick, and pagination covers the rest -- before cursors existed here this was
 * a flat `first: 250` and anything past that was silently dropped.
 */
export const PAGE_SIZE = 100

/**
 * Project updates are long-form and carry their comment threads inline, so they
 * page far smaller than issues. A project with 25 updates is already unusual.
 */
export const UPDATE_PAGE_SIZE = 25

/**
 * Linked PRs per issue. Ten is past what any real issue carries -- the biggest
 * in this workspace links five.
 */
export const ATTACHMENT_LIMIT = 10

/**
 * Linked git work: GitHub/GitLab PR and commit attachments.
 *
 * `metadata` is a JSONObject, so the whole blob comes down whether or not we
 * read all of it -- including each PR's `reviews` array. Measured on a 100-issue
 * page that is +27KB and +34ms, which is why it rides along on the list queries
 * instead of being fetched per issue.
 *
 * The `sourceType` filter is a coarse pre-filter, not a guarantee: Linear also
 * returns `githubCommit` and bare `api` attachments through it. `git.ts`
 * classifies what actually arrives and drops the rest.
 */
const GIT_ATTACHMENTS = /* GraphQL */ `
  attachments(first: ${ATTACHMENT_LIMIT}, filter: { sourceType: { in: ["github", "gitlab"] } }) {
    nodes {
      id
      title
      url
      sourceType
      metadata
    }
  }
`

/** Relay cursor. Every paginated document selects this so `loadMore` has a cursor. */
const PAGE_INFO = /* GraphQL */ `
  pageInfo {
    hasNextPage
    endCursor
  }
`

/**
 * The selection every list and detail view renders from.
 *
 * Declared as a body rather than a fragment because it has to be spread over two
 * unrelated types: `searchIssues` returns `IssueSearchResult`, not `Issue`, so a
 * `fragment ... on Issue` cannot apply to it. `IssueSearchResult` happens to
 * carry the same fields, `attachments` included, and both fragments below are
 * built from this one string so the two selections cannot drift apart.
 */
const ISSUE_BODY = /* GraphQL */ `
  id
  identifier
  title
  url
  branchName
  priority
  priorityLabel
  estimate
  createdAt
  updatedAt
  state {
    id
    name
    color
    type
  }
  assignee {
    id
    displayName
    isMe
  }
  team {
    id
    key
  }
  project {
    id
    name
    color
  }
  cycle {
    number
    name
  }
  labels(first: 10) {
    nodes {
      name
      color
    }
  }
  ${GIT_ATTACHMENTS}
`

/** Issue fields shared by every list + detail view. */
const ISSUE_FIELDS = /* GraphQL */ `
  fragment IssueFields on Issue {
    ${ISSUE_BODY}
  }
`

/** Same selection, on the type `searchIssues` actually returns. */
const SEARCH_RESULT_FIELDS = /* GraphQL */ `
  fragment SearchResultFields on IssueSearchResult {
    ${ISSUE_BODY}
  }
`

/**
 * Comment selection, shared by issues, project updates, and projects. One string
 * rather than a fragment for the same reason as ISSUE_BODY: it is spread into
 * three unrelated parent types and the client threads all three identically.
 */
const COMMENT_BODY = /* GraphQL */ `
  id
  body
  createdAt
  url
  resolvedAt
  user {
    displayName
    isMe
  }
  parent {
    id
  }
`

/**
 * Only surface work that is still live. `duplicate` is its own state type in
 * Linear, not a flavor of canceled, so it has to be excluded by name or closed
 * dupes keep showing up alongside open work.
 */
const ACTIVE_STATES = `state: { type: { nin: ["completed", "canceled", "duplicate"] } }`

/**
 * One round trip for everything the sidebar needs at startup.
 * `viewer.teamMemberships` is membership-scoped, unlike the root `teams` query,
 * and its `sortOrder` is the order you dragged the teams into in Linear's own
 * sidebar -- `viewer.teams` would come back alphabetical.
 * `activeCycle` is the current sprint -- no date math on our side.
 */
export const BOOTSTRAP = /* GraphQL */ `
	query Bootstrap {
		viewer {
			id
			name
			displayName
			teamMemberships(first: 50) {
				nodes {
					sortOrder
					team {
						id
						key
						name
						activeCycle {
							id
							number
							name
							startsAt
							endsAt
							progress
						}
					}
				}
			}
		}
		customViews(first: 50) {
			nodes {
				id
				name
			}
		}
	}
`

export const MY_ISSUES = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query MyIssues($after: String) {
    issues(
      first: ${PAGE_SIZE}
      after: $after
      filter: { assignee: { isMe: { eq: true } }, ${ACTIVE_STATES} }
      sort: { priority: { order: Descending } }
    ) {
      ${PAGE_INFO}
      nodes {
        ...IssueFields
      }
    }
  }
`

export const TEAM_ISSUES = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query TeamIssues($teamId: ID!, $after: String) {
    issues(
      first: ${PAGE_SIZE}
      after: $after
      filter: { team: { id: { eq: $teamId } }, ${ACTIVE_STATES} }
      sort: { priority: { order: Descending } }
    ) {
      ${PAGE_INFO}
      nodes {
        ...IssueFields
      }
    }
  }
`

/**
 * Sprint view. Cycle issues include completed ones -- that is the point of a
 * sprint board.
 *
 * No `sort` argument: unlike the root `issues` query and `CustomView.issues`,
 * `Cycle.issues` does not accept one, and `orderBy` only offers createdAt /
 * updatedAt. Priority ordering happens client-side via sortByPriority(), which
 * means it can only order what has been paged in so far -- loading another page
 * re-sorts the whole accumulated list rather than appending below it.
 */
export const CYCLE_ISSUES = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query CycleIssues($cycleId: String!, $after: String) {
    cycle(id: $cycleId) {
      id
      number
      name
      startsAt
      endsAt
      progress
      issues(first: ${PAGE_SIZE}, after: $after) {
        ${PAGE_INFO}
        nodes {
          ...IssueFields
        }
      }
    }
  }
`

/**
 * `status` is the workspace's project flow (Backlog / Planned / In Progress /
 * Completed …); `health` is what the last project update declared. Linear's own
 * project list shows both, and they disagree often enough to be worth the two
 * columns -- an In Progress project can be Off track.
 *
 * `Project.state` is the deprecated string form of `status.type`.
 */
const PROJECT_LIST_FIELDS = /* GraphQL */ `
  id
  name
  description
  progress
  targetDate
  health
  status {
    id
    name
    type
    color
  }
  lead {
    displayName
  }
`

export const TEAM_PROJECTS = /* GraphQL */ `
  query TeamProjects($teamId: String!) {
    team(id: $teamId) {
      projects(first: 100) {
        nodes {
          ${PROJECT_LIST_FIELDS}
        }
      }
    }
  }
`

/**
 * Projects you lead or are a member of, across teams, most recently updated
 * first. `orderBy` on a connection is descending, and `updatedAt` is the only
 * server-side order besides `createdAt` -- so this one keeps the server's order
 * instead of the live-first sort the team list applies.
 */
export const MY_PROJECTS = /* GraphQL */ `
  query MyProjects {
    projects(
      first: 100
      orderBy: updatedAt
      filter: { or: [{ lead: { isMe: { eq: true } } }, { members: { isMe: { eq: true } } }] }
    ) {
      nodes {
        ${PROJECT_LIST_FIELDS}
      }
    }
  }
`

/**
 * The project workspace's Overview tab.
 *
 * `documentContent.id` is fetched because it is the only handle
 * `commentCreate` accepts for a project-level comment -- there is no
 * `projectId` on CommentCreateInput. A project whose body was never touched can
 * return null for it, in which case the overview has nothing to comment on.
 */
export const PROJECT_OVERVIEW = /* GraphQL */ `
  query ProjectOverview($projectId: String!) {
    project(id: $projectId) {
      id
      name
      description
      content
      icon
      color
      url
      progress
      scope
      startDate
      targetDate
      health
      healthUpdatedAt
      createdAt
      updatedAt
      status {
        id
        name
        type
        color
      }
      lead {
        id
        displayName
        isMe
      }
      members(first: 25) {
        nodes {
          id
          displayName
          isMe
        }
      }
      teams(first: 10) {
        nodes {
          id
          key
        }
      }
      documentContent {
        id
      }
      lastUpdate {
        id
        body
        health
        createdAt
        user {
          displayName
          isMe
        }
      }
      projectMilestones(first: 25) {
        nodes {
          id
          name
          targetDate
          status
          progress
        }
      }
      comments(first: 50) {
        nodes {
          ${COMMENT_BODY}
        }
      }
    }
  }
`

/**
 * The Updates tab. Comment threads come down with the list rather than on demand:
 * an update's thread is a handful of comments, and inlining them means opening
 * one costs no request and posting to one needs no separate detail refetch.
 */
export const PROJECT_UPDATES = /* GraphQL */ `
  query ProjectUpdates($projectId: String!, $after: String) {
    project(id: $projectId) {
      id
      name
      projectUpdates(first: ${UPDATE_PAGE_SIZE}, after: $after) {
        ${PAGE_INFO}
        nodes {
          id
          body
          health
          createdAt
          editedAt
          url
          isStale
          user {
            displayName
            isMe
          }
          comments(first: 50) {
            nodes {
              ${COMMENT_BODY}
            }
          }
        }
      }
    }
  }
`

/** `health` is required by Linear's composer, so the TUI asks for it too. */
export const PROJECT_UPDATE_CREATE = /* GraphQL */ `
	mutation ProjectUpdateCreate($projectId: String!, $body: String!, $health: ProjectUpdateHealthType) {
		projectUpdateCreate(input: { projectId: $projectId, body: $body, health: $health }) {
			success
			projectUpdate {
				id
				url
			}
		}
	}
`

/** `Project.issues` takes no `sort` either -- see CYCLE_ISSUES. */
export const PROJECT_ISSUES = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query ProjectIssues($projectId: String!, $after: String) {
    project(id: $projectId) {
      id
      name
      issues(first: ${PAGE_SIZE}, after: $after) {
        ${PAGE_INFO}
        nodes {
          ...IssueFields
        }
      }
    }
  }
`

export const CUSTOM_VIEW_ISSUES = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query CustomViewIssues($viewId: String!, $after: String) {
    customView(id: $viewId) {
      id
      name
      issues(first: ${PAGE_SIZE}, after: $after, sort: { priority: { order: Descending } }) {
        ${PAGE_INFO}
        nodes {
          ...IssueFields
        }
      }
    }
  }
`

export const SEARCH_ISSUES = /* GraphQL */ `
  ${SEARCH_RESULT_FIELDS}
  query SearchIssues($term: String!, $after: String) {
    searchIssues(term: $term, first: ${PAGE_SIZE}, after: $after) {
      ${PAGE_INFO}
      nodes {
        ...SearchResultFields
      }
    }
  }
`

/**
 * Picker contents for the edit bindings. Cached per team -- workflow states,
 * membership, and the cycle schedule change on the order of days, not minutes.
 */
export const TEAM_WORKFLOW = /* GraphQL */ `
	query TeamWorkflow($teamId: String!) {
		team(id: $teamId) {
			id
			states(first: 50) {
				nodes {
					id
					name
					color
					type
					position
				}
			}
			members(first: 150) {
				nodes {
					id
					displayName
					isMe
				}
			}
			activeCycle {
				id
				number
				name
				startsAt
				endsAt
			}
			cycles(first: 50) {
				nodes {
					id
					number
					name
					startsAt
					endsAt
				}
			}
		}
	}
`

/** Status, assignee, priority, cycle, and estimate all go through this one mutation. */
export const ISSUE_UPDATE = /* GraphQL */ `
	mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
		issueUpdate(id: $id, input: $input) {
			success
			issue {
				id
				identifier
			}
		}
	}
`

/**
 * One mutation for all three comment surfaces. The anchor is `issueId` for an
 * issue, `projectUpdateId` for an update's thread, and `documentContentId` for a
 * project's own thread -- CommentCreateInput has no `projectId`, so the
 * project's document content is the handle Linear exposes.
 *
 * The whole input arrives as one variable, built in `addComment`, rather than as
 * a field per anchor. Linear requires that **exactly one** anchor be defined and
 * counts an explicit `null` as defined, so a document that names all three and
 * passes nulls for the two that do not apply is rejected outright:
 *
 *   Argument Validation Error — Exactly one of projectUpdateId, ... or issueId
 *   must be defined.
 *
 * That is what this used to do, and it broke every comment and reply the app
 * sent. One object built from the anchor union cannot express the bad shape.
 *
 * `parentId` threads the comment as a reply, and Linear only threads one level:
 * it must be a top-level comment's id, never another reply's.
 */
export const COMMENT_CREATE = /* GraphQL */ `
	mutation CommentCreate($input: CommentCreateInput!) {
		commentCreate(input: $input) {
			success
			comment {
				id
			}
		}
	}
`

/**
 * Inbox.
 *
 * `Notification` is an interface with eight implementations; only
 * `IssueNotification` carries an issue and only `ProjectNotification` carries a
 * project, so each selection sits behind its own inline fragment. Both let the
 * inbox open the row in the app; everything else falls back to opening `url`.
 *
 * Archived notifications are excluded by default (`includeArchived: false`),
 * which is what makes archiving equivalent to Linear's "clear from inbox".
 */
export const NOTIFICATIONS = /* GraphQL */ `
  query Notifications($after: String) {
    notifications(first: ${PAGE_SIZE}, after: $after) {
      ${PAGE_INFO}
      nodes {
        id
        type
        title
        subtitle
        url
        createdAt
        readAt
        snoozedUntilAt
        actor {
          displayName
        }
        ... on IssueNotification {
          issue {
            id
            identifier
            title
            state {
              name
              type
            }
            team {
              id
              key
            }
          }
          comment {
            id
            body
          }
        }
        ... on ProjectNotification {
          project {
            id
            name
          }
          projectUpdate {
            id
          }
        }
      }
    }
  }
`

/**
 * Sidebar badge. Split out from BOOTSTRAP on purpose: `notificationsUnreadCount`
 * is flagged internal in Linear's SDL, so if a personal key cannot read it this
 * request fails alone and the app still starts. Callers fall back to counting
 * the unread rows they have actually loaded.
 */
export const UNREAD_COUNT = /* GraphQL */ `
	query UnreadCount {
		notificationsUnreadCount
	}
`

/** `readAt: null` marks unread again; any timestamp marks read. */
export const NOTIFICATION_UPDATE = /* GraphQL */ `
	mutation NotificationUpdate($id: String!, $readAt: DateTime) {
		notificationUpdate(id: $id, input: { readAt: $readAt }) {
			success
		}
	}
`

export const NOTIFICATION_ARCHIVE = /* GraphQL */ `
	mutation NotificationArchive($id: String!) {
		notificationArchive(id: $id) {
			success
		}
	}
`

/**
 * Activity feed depth. Every entry Linear kept for the issue, newest first --
 * the busiest ticket in this workspace has 14, so one page covers everything
 * and `hasNextPage` tells the pane to admit when it does not.
 */
export const HISTORY_LIMIT = 50

/**
 * One entry in the issue's activity feed. Every `from`/`to` pair is nullish and
 * a single entry can carry several of them at once (a status change that also
 * reassigns), which is why `activity.ts` fans one node out into a row per change.
 *
 * `actor` is null for anything an integration or a Linear automation did --
 * `botActor` names those. Both null means Linear would not say who.
 *
 * Measured at +3-13KB on the detail query and no extra latency, since it rides
 * along on the round trip that already fetches the description and comments.
 */
const ISSUE_HISTORY = /* GraphQL */ `
  history(first: ${HISTORY_LIMIT}) {
    ${PAGE_INFO}
    nodes {
      id
      createdAt
      updatedDescription
      fromTitle
      toTitle
      fromPriority
      toPriority
      fromEstimate
      toEstimate
      fromDueDate
      toDueDate
      archived
      trashed
      autoClosed
      autoArchived
      actor {
        displayName
      }
      botActor {
        name
        userDisplayName
      }
      fromState {
        name
        type
        color
      }
      toState {
        name
        type
        color
      }
      fromAssignee {
        displayName
      }
      toAssignee {
        displayName
      }
      fromCycle {
        number
        name
      }
      toCycle {
        number
        name
      }
      fromProject {
        name
      }
      toProject {
        name
      }
      fromTeam {
        key
      }
      toTeam {
        key
      }
      fromParent {
        identifier
      }
      toParent {
        identifier
      }
      addedLabels {
        name
      }
      removedLabels {
        name
      }
      relationChanges {
        identifier
        type
      }
      attachment {
        title
        url
      }
    }
  }
`

/**
 * Detail pane. Fetched lazily on selection so list views stay cheap --
 * description and comment bodies are the bulk of an issue's payload.
 */
export const ISSUE_DETAIL = /* GraphQL */ `
  ${ISSUE_FIELDS}
  query IssueDetail($issueId: String!) {
    issue(id: $issueId) {
      ...IssueFields
      description
      creator {
        displayName
      }
      parent {
        identifier
        title
      }
      children(first: 25) {
        nodes {
          identifier
          title
          state {
            name
            type
          }
        }
      }
      comments(first: 100) {
        nodes {
          ${COMMENT_BODY}
        }
      }
      ${ISSUE_HISTORY}
    }
  }
`
