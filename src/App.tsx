import { colors } from "./ui/colors.js"
import { LoadingLogoPane } from "./ui/LoadingLogo.js"
import { centerCell, Divider, TextLine } from "./ui/primitives.js"
import { WorkspaceTabs } from "./ui/WorkspaceTabs.js"
import { WorkspaceContent } from "./surfaces/WorkspaceContent.js"
import { WorkspaceFooter } from "./surfaces/WorkspaceFooter.js"
import { WorkspaceHeader } from "./surfaces/WorkspaceHeader.js"
import { WorkspaceModals } from "./surfaces/WorkspaceModals.js"
import { useAppShell } from "./hooks/useAppShell.js"
import { LinearWorkspace } from "./surfaces/LinearWorkspace.js"
import { useState, useRef, useCallback } from "react"

interface AppProps {
	readonly systemThemeGeneration?: number
}

/**
 * Top-level render manifest. All state, hooks, derivations, atom
 * subscriptions, keymap wiring, and side-effects live inside
 * `useAppShell`; this component is purely the JSX layout that
 * consumes the shell bundle.
 */
export const App = ({ systemThemeGeneration = 0 }: AppProps) => {
	const [linearNavigationLocked, setLinearNavigationLocked] = useState(false)
	const linearNavigationLockRef = useRef(false)
	const updateLinearNavigationLock = useCallback((locked: boolean) => {
		linearNavigationLockRef.current = locked
		setLinearNavigationLocked(locked)
	}, [])
	const shell = useAppShell({ systemThemeGeneration, linearNavigationLocked, linearNavigationLockRef })

	return (
		<box width={shell.terminalWidth} height={shell.terminalHeight} flexDirection="column" backgroundColor={colors.background}>
			{shell.terminalTooSmall ? (
				<box width={shell.terminalWidth} height={shell.terminalHeight} flexDirection="column" justifyContent="center">
					{["Terminal too small", `Need 60x16; current ${shell.terminalWidth}x${shell.terminalHeight}`, "Resize to continue"].map((line) => (
						<TextLine key={line} width={shell.terminalWidth}>
							{centerCell(line, shell.terminalWidth)}
						</TextLine>
					))}
				</box>
			) : shell.isInitialLoading ? (
				<LoadingLogoPane content={shell.detailPlaceholderContent} width={shell.contentWidth} height={shell.terminalHeight} frame={shell.loadingFrame} />
			) : (
				<>
					<box paddingLeft={1} paddingRight={1} flexDirection="column" backgroundColor={colors.background}>
						<box width={shell.headerFooterWidth} height={1} flexDirection="row">
							<WorkspaceHeader {...shell.headerProps} />
							{shell.headerRight ? (
								<TextLine width={shell.headerRight.length}>
									<span fg={colors.muted}>{shell.headerRight}</span>
								</TextLine>
							) : null}
						</box>
					</box>
					<Divider width={shell.contentWidth} junctions={shell.workspaceTopDividerJunctions} />
					{shell.showWorkspaceTabs ? (
						<>
							<box paddingRight={1} backgroundColor={colors.background}>
								<WorkspaceTabs
									activeSurface={shell.selectedWorkspaceTab}
									width={Math.max(24, shell.contentWidth - 1)}
									surfaces={shell.workspaceTabSurfaces}
									counts={shell.workspaceTabCounts}
									onSelect={shell.switchWorkspaceSurface}
								/>
							</box>
							<Divider width={shell.contentWidth} junctions={shell.workspaceBottomDividerJunctions} />
						</>
					) : null}
					{shell.activeWorkspaceSurface !== "linear" ? (
						<>
							<WorkspaceContent {...shell.contentProps} />
							<Divider width={shell.contentWidth} junctions={shell.preFooterDividerJunctions} />
							<WorkspaceFooter {...shell.footerProps} />
						</>
					) : null}
					<WorkspaceModals {...shell.modalsProps} />
				</>
			)}
			<LinearWorkspace
				inputBlocked={shell.linearInputBlocked}
				onOpenGitHubLink={shell.openLinearGitHubLink}
				navigationNotice={shell.linearNavigationNotice}
				onNavigationLockChange={updateLinearNavigationLock}
				active={!shell.terminalTooSmall && !shell.isInitialLoading && shell.activeWorkspaceSurface === "linear"}
				width={shell.terminalWidth}
				height={Math.max(1, shell.terminalHeight - 4)}
				onQuit={() => {
					if (!shell.isInitialLoading) shell.quit()
				}}
			/>
		</box>
	)
}
