import { PROJECT_TABS, projectTabLabel, type ProjectTab } from "../views.ts"
import { color } from "../theme.ts"

type Props = {
	active: ProjectTab
	/** Dimmed when the sidebar has focus, matching the pane border. */
	focused: boolean
	onPick: (tab: ProjectTab) => void
}

/**
 * The project workspace's tab strip. One row, rendered by each of the three
 * panes as their first child rather than wrapped around them -- a wrapper would
 * mean a second border, and every pane already draws its own.
 *
 * Click a label or use brackets; digits belong to GHUI's host tabs.
 */
export function ProjectTabs({ active, focused, onPick }: Props) {
	return (
		<box flexDirection="row" height={1} flexShrink={0} marginBottom={1}>
			{PROJECT_TABS.map((tab) => {
				const on = tab === active
				return (
					<box
						key={tab}
						flexDirection="row"
						flexShrink={0}
						height={1}
						marginRight={1}
						paddingLeft={1}
						paddingRight={1}
						{...(on ? { backgroundColor: color.selectedBg } : {})}
						onMouseDown={() => onPick(tab)}
					>
						<text flexShrink={0} fg={on ? (focused ? color.accent : color.fg) : color.dim}>
							{projectTabLabel(tab)}
						</text>
					</box>
				)
			})}
		</box>
	)
}
