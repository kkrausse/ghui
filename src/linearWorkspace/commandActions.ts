/** The host registers these actions; Linear owns their live implementations. */
export const linearActionDefinitions = [
	{ action: "myIssues", title: "Linear: Show My Issues", shortcut: "gi" },
	{ action: "inbox", title: "Linear: Show Inbox", shortcut: "gn" },
	{ action: "refresh", title: "Linear: Refresh current view", shortcut: "R" },
	{ action: "search", title: "Linear: Search issues", shortcut: "/" },
	{ action: "group", title: "Linear: Group issues", shortcut: "b" },
	{ action: "toggleAllPrs", title: "Linear: Toggle all linked PR dropdowns", shortcut: "Shift+Space" },
	{ action: "expandAllPrs", title: "Linear: Expand all linked PR dropdowns" },
	{ action: "collapseAllPrs", title: "Linear: Collapse all linked PR dropdowns" },
	{ action: "help", title: "Linear: Show keyboard help", shortcut: "?" },
] as const

export type LinearAction = (typeof linearActionDefinitions)[number]["action"]
export type LinearActions = Partial<Record<LinearAction, () => void>>
