import { activityTruncated, buildActivity } from "../activity.ts"
import type { IssueDetail } from "../linear/schema.ts"
import { color, formatDateTime } from "../theme.ts"

/**
 * Column widths. Fixed rather than measured so every row's change text starts
 * at the same column -- the point of the feed is scanning down one column.
 */
const STAMP_WIDTH = 15
const ACTOR_WIDTH = 16

/**
 * The issue's history as a log: one line per change, newest first.
 *
 * `flexShrink={0}` and `height={1}` on every row for the same reason the detail
 * pane's field rows carry them -- yoga answers an overflowing column by
 * squeezing one-line rows to height 0 and painting them over each other.
 */
export function ActivityFeed({ detail }: { detail: IssueDetail }) {
	const rows = buildActivity(detail)

	return (
		<box flexDirection="column">
			<text fg={color.faint} flexShrink={0}>{`ACTIVITY (${rows.length}) · newest first`}</text>

			{rows.map((row) => (
				<box key={row.key} flexDirection="row" flexShrink={0} height={1}>
					<text fg={color.faint} flexShrink={0}>
						{formatDateTime(row.at).padEnd(STAMP_WIDTH)}
					</text>
					<text fg={color.dim} flexShrink={0}>
						{(row.actor.length > ACTOR_WIDTH - 1 ? `${row.actor.slice(0, ACTOR_WIDTH - 2)}…` : row.actor).padEnd(ACTOR_WIDTH)}
					</text>
					<text fg={row.fg} flexGrow={1} flexBasis={0} minWidth={0} wrapMode="none" truncate>
						{row.text}
					</text>
				</box>
			))}

			{activityTruncated(detail) ? (
				<text fg={color.faint} flexShrink={0}>
					{"…older activity not loaded"}
				</text>
			) : null}
		</box>
	)
}
