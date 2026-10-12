import { color } from "../theme.ts"

const KEYS: [string, string][] = [
	["j/k", "move"],
	["↵/→", "open"],
	["R", "refresh"],
	["s", "status"],
	["a", "assign"],
	["p", "prio"],
	["c", "comment"],
	["r", "reply"],
	["t", "activity"],
	["/", "find"],
	["b", "group"],
	["gn", "inbox"],
	["y", "branch"],
	["Y", "link"],
	["o", "open"],
	["O", "pr"],
	["P", "project"],
	["?", "help"],
	["q", "quit"],
]

/**
 * Drops trailing hints that will not fit.
 *
 * The row used to render all of them and let flex squeeze each child, which at
 * 80 columns collided into unreadable runs like "moveopen statuassign".
 */
function fittingKeys(available: number): [string, string][] {
	const shown: [string, string][] = []
	let used = 0
	for (const entry of KEYS) {
		const cost = entry[0].length + 1 + entry[1].length + 2 // key + ":" + label + gap
		if (used + cost > available) break
		shown.push(entry)
		used += cost
	}
	return shown
}

export function StatusBar({ flash, who, width }: { flash: string | null; who: string; width: number }) {
	// 2 for the row padding, 1 for the gap before the user name.
	const available = Math.max(0, width - who.length - 3)

	return (
		<box flexDirection="row" height={1} paddingLeft={1} paddingRight={1}>
			{flash ? (
				<text fg={color.ok} flexGrow={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
					{flash}
				</text>
			) : (
				<box flexDirection="row" flexGrow={1}>
					{fittingKeys(available).map(([key, label]) => (
						<box key={key} flexDirection="row" flexShrink={0}>
							<text fg={color.accent}>{key}</text>
							<text fg={color.faint}>{`:${label}  `}</text>
						</box>
					))}
				</box>
			)}
			<text fg={color.faint} flexShrink={0}>
				{who}
			</text>
		</box>
	)
}

export function HelpOverlay() {
	const sections: [string, [string, string][]][] = [
		[
			"NAVIGATE",
			[
				["j / k, ↓ / ↑", "move selection"],
				["ctrl+d / ctrl+u", "half-page jump"],
				["gg / G", "jump to first / last row"],
				["gi / gn", "go to My Issues / Inbox"],
				["l / →", "into the list, then open the selected row"],
				["h / ←", "back out: close the pane, then back to the sidebar"],
				["tab", "in the list: switch pane · in detail: cycle comments"],
				["t", "in detail: activity feed — every change with its timestamp"],
				["enter", "load view · open issue · drill into project"],
				["space", "ticket: linked PRs · My Projects project: tickets"],
				["shift+space", "any ticket list: toggle all linked PR dropdowns"],
				["ctrl+p / cmd+k", "command palette: every action available on this screen"],
				["1–7", "GHUI host tabs (except while editing or picking)"],
				["esc", "leave detail, search, or drilled-in project"],
				["/", "search every issue — its own scope, no sidebar; esc leaves it"],
				["b", "group by status, assignee, project, priority, cycle, label"],
				["r", "in the list: reload, dropping the cache"],
				["R", "refresh the current page, dropping the cache"],
			],
		],
		[
			"INBOX",
			[
				["enter", "open the issue, project, or update it points at, marking it read"],
				["e", "archive (clears it from the inbox)"],
				["u", "toggle read / unread"],
				["o", "open in the browser"],
			],
		],
		[
			"PROJECT (enter on a project row)",
			[
				["click tabs", "Overview · Updates · Issues (digits belong to GHUI)"],
				["← / →, [ / ]", "previous / next tab (← on Overview backs out)"],
				["u", "post a project update (health, then body)"],
				["c", "comment on the project, or on the selected update"],
				["enter", "on Updates: open the update and its thread"],
				["esc / h", "back to the projects list"],
			],
		],
		[
			"EDIT (needs a write-scoped key)",
			[
				["s", "change status"],
				["a", "change assignee"],
				["p", "change priority"],
				["C", "assign or remove from a cycle / sprint"],
				["c", "add a comment"],
				["r", "in detail: reply to the selected comment (tab picks one)"],
			],
		],
		[
			"OTHER",
			[
				["y", "copy the issue's git branch name"],
				["Y", "copy the issue's link (⎘ in the detail pane)"],
				["o", "open the issue in your browser"],
				["O", "open its linked pull request (picks one when there are several)"],
				["P", "drill into the issue's project (also clickable in the detail pane)"],
				["?", "toggle this help"],
				["q, ctrl+c", "quit"],
			],
		],
	]

	return (
		<box
			flexDirection="column"
			border
			borderColor={color.accent}
			title=" keys "
			titleColor={color.accent}
			bottomTitle=" j/k scrolls · esc closes "
			padding={1}
			flexGrow={1}
			overflow="hidden"
		>
			{/*
			 * Scrolls rather than flexing: the list outgrew a short terminal, and yoga's
			 * response to that was to squeeze every row to height 0 and paint them over
			 * each other rather than clip.
			 */}
			<scrollbox focused flexGrow={1} scrollY contentOptions={{ flexDirection: "column" }}>
				{sections.map(([heading, rows], si) => (
					<box key={heading} flexDirection="column" marginTop={si === 0 ? 0 : 1} flexShrink={0}>
						<text fg={color.faint}>{heading}</text>
						{rows.map(([key, label]) => (
							<box key={key} flexDirection="row" flexShrink={0} height={1}>
								<text fg={color.accent} flexShrink={0}>
									{key.padEnd(18)}
								</text>
								<text fg={color.fg} flexGrow={1} wrapMode="none" truncate>
									{label}
								</text>
							</box>
						))}
					</box>
				))}
				<text fg={color.faint} marginTop={1} wrapMode="word" flexShrink={0}>
					Mouse works too: click a sidebar entry to load it, click a row to select and again to open, click a linked PR row to open it, and hit a ⎘ to copy a PR or comment URL. The
					wheel scrolls whichever pane it is over — in a list that means moving its cursor. Dragging across text copies it — mouse reporting takes the terminal's own selection
					away, so the app does the copying. Hold option (iTerm2) or fn (Terminal.app) for native selection.
				</text>
				<text fg={color.faint} marginTop={1} wrapMode="word" flexShrink={0}>
					Token comes from the macOS Keychain (service: linear-api-token), falling back to $LINEAR_API_TOKEN. Editing needs a write-scoped key.
				</text>
			</scrollbox>
		</box>
	)
}
