import type { PullRequestUserQueueMode } from "./domain.js"
import type { PullRequestView } from "./pullRequestViews.js"
import { workspaceSurfaceLabels, type WorkspaceSurface } from "./workspaceSurfaces.js"

export type WorkspaceTab = WorkspaceSurface | PullRequestUserQueueMode

export const userWorkspaceTabs: readonly WorkspaceTab[] = ["repos", "authored", "review", "assigned", "mentioned", "issues", "linear"]

export const workspaceTabLabels: Record<WorkspaceTab, string> = {
	...workspaceSurfaceLabels,
	authored: "MY PRS",
	review: "REVIEW REQUESTED",
	assigned: "ASSIGNED PRS",
	mentioned: "MENTIONED PRS",
}

export const isQueueTab = (tab: WorkspaceTab): tab is PullRequestUserQueueMode => tab === "authored" || tab === "review" || tab === "assigned" || tab === "mentioned"

export const activeWorkspaceTab = (surface: WorkspaceSurface, view: PullRequestView, repository: string | null): WorkspaceTab =>
	surface === "pullRequests" && repository === null && view._tag === "Queue" ? view.mode : surface

export const nextWorkspaceTab = (tab: WorkspaceTab, delta: 1 | -1, tabs: readonly WorkspaceTab[]): WorkspaceTab => {
	const index = Math.max(0, tabs.indexOf(tab))
	return tabs[(index + delta + tabs.length) % tabs.length] ?? tab
}
