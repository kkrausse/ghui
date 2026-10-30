import { TextAttributes } from "@opentui/core"
import type { LoadStatus, PullRequestItem } from "../domain.js"
import { daysOpen } from "../date.js"
import { HARNESS_COLOR, HARNESS_SHORT, noPullRequestSessions, sessionColor, SessionMarkText, type FaplexSession, type PullRequestSessionsFor } from "../faplex.js"
import { relativeAge } from "../linearWorkspace/theme.js"
import { colors } from "./colors.js"
import { SelectableRow, useHoverState } from "./listSelection/SelectableRow.js"
import { fitCell, MatchedCell, PlainLine, SectionTitle, TextLine } from "./primitives.js"
import { pullRequestRowDisplay, repoColor, reviewIcon } from "./pullRequests.js"

export type PullRequestGroups = Array<[string, PullRequestItem[]]>

const pullRequestListRowHeight = (row: PullRequestListRow) => (row._tag === "pull-request" && !row.compact ? 2 : 1)

/** PR rows sit under their repository header, lined up with its name. */
const GROUPED_INDENT = 2

export type PullRequestListRow =
	| { readonly _tag: "title" }
	| { readonly _tag: "message"; readonly text: string; readonly color: string }
	| { readonly _tag: "group"; readonly repository: string; readonly pullRequests: readonly PullRequestItem[] }
	| { readonly _tag: "section"; readonly label: string }
	| {
			readonly _tag: "pull-request"
			readonly pullRequest: PullRequestItem
			readonly numberWidth: number
			readonly ageWidth: number
			readonly compact: boolean
			readonly indent: number
	  }
	| { readonly _tag: "session"; readonly pullRequest: PullRequestItem; readonly session: FaplexSession; readonly indent: number; readonly last: boolean }
	| { readonly _tag: "load-more"; readonly text: string }

const GROUP_ICON = "◆"

const getRowLayout = (contentWidth: number, numberWidth: number, ageWidth: number) => {
	const reviewWidth = 1
	const checkWidth = 2
	const fixedWidth = reviewWidth + 1 + numberWidth + 1 + checkWidth + ageWidth
	const titleWidth = Math.max(8, contentWidth - fixedWidth)
	return { reviewWidth, checkWidth, ageWidth, numberWidth, titleWidth }
}

const groupNumberWidth = (pullRequests: readonly PullRequestItem[]) => {
	if (pullRequests.length === 0) return 4
	const maxLen = Math.max(...pullRequests.map((pr) => String(pr.number).length))
	return maxLen + 1
}

const groupAgeWidth = (pullRequests: readonly PullRequestItem[]) => {
	if (pullRequests.length === 0) return 4
	const maxLen = Math.max(...pullRequests.map((pr) => `${daysOpen(pr.updatedAt)}d`.length))
	return Math.max(4, maxLen + 1)
}

const GroupTitle = ({ label, color, filterText }: { label: string; color: string; filterText: string }) => (
	<TextLine>
		<span fg={color}>{GROUP_ICON} </span>
		<span fg={color} attributes={TextAttributes.BOLD}>
			<MatchedCell text={label} width={label.length} query={filterText} />
		</span>
	</TextLine>
)

export const buildPullRequestListRows = ({
	groups,
	status,
	error,
	filterText,
	loadedCount,
	hasMore,
	isLoadingMore,
	loadingIndicator = "-",
	showTitle = true,
	showRepositoryGroups = true,
	repositorySections = false,
	compact = false,
	sessionsFor = noPullRequestSessions,
}: {
	readonly groups: PullRequestGroups
	readonly status: LoadStatus
	readonly error: string | null
	readonly filterText: string
	readonly loadedCount: number
	readonly hasMore: boolean
	readonly isLoadingMore: boolean
	readonly loadingIndicator?: string
	readonly showTitle?: boolean
	readonly showRepositoryGroups?: boolean
	readonly repositorySections?: boolean
	readonly compact?: boolean
	readonly sessionsFor?: PullRequestSessionsFor
}): readonly PullRequestListRow[] => {
	const itemCount = groups.reduce((count, [, pullRequests]) => count + pullRequests.length, 0)
	const rows: PullRequestListRow[] = showTitle ? [{ _tag: "title" }] : []
	if (status === "loading" && itemCount === 0) rows.push({ _tag: "message", text: "- Loading pull requests...", color: colors.muted })
	if (status === "error") rows.push({ _tag: "message", text: `- ${error ?? "Could not load pull requests."}`, color: colors.error })
	if (status === "ready" && itemCount === 0)
		rows.push({
			_tag: "message",
			text: filterText.length > 0 ? "- No matching pull requests." : repositorySections ? "- No pull requests." : "- No open pull requests.",
			color: colors.muted,
		})
	for (const [repository, pullRequests] of groups) {
		if (showRepositoryGroups) rows.push({ _tag: "group", repository, pullRequests })
		const numberWidth = groupNumberWidth(pullRequests)
		const ageWidth = groupAgeWidth(pullRequests)
		let previousSection: string | null = null
		for (const pullRequest of pullRequests) {
			const section = pullRequest.state === "merged" ? "MERGED" : pullRequest.state === "closed" ? "CLOSED" : pullRequest.reviewStatus === "draft" ? "DRAFT" : "OPEN"
			if (repositorySections && section !== previousSection) rows.push({ _tag: "section", label: section })
			const indent = showRepositoryGroups ? GROUPED_INDENT : 0
			rows.push({ _tag: "pull-request", pullRequest, numberWidth, ageWidth, compact, indent })
			const sessions = sessionsFor(pullRequest)
			sessions.forEach((session, i) => rows.push({ _tag: "session", pullRequest, session, indent, last: i === sessions.length - 1 }))
			previousSection = section
		}
	}
	if (status === "ready" && itemCount > 0 && (hasMore || isLoadingMore)) {
		rows.push({
			_tag: "load-more",
			text: isLoadingMore ? `${loadingIndicator} Loading more pull requests... (${loadedCount} loaded)` : `↓ Press enter to load more  ·  ${loadedCount} loaded`,
		})
	}
	return rows
}

export const pullRequestListRowIndex = (rows: readonly PullRequestListRow[], url: string | null, loadMoreSelected = false, sessionKey: string | null = null) => {
	if (!url && !loadMoreSelected) return null
	let line = 0
	for (const row of rows) {
		if (row._tag === "pull-request" && row.pullRequest.url === url && !sessionKey) return line
		if (row._tag === "session" && row.pullRequest.url === url && row.session.key === sessionKey) return line
		if (row._tag === "load-more" && loadMoreSelected) return line
		line += pullRequestListRowHeight(row)
	}
	return null
}

export const pullRequestListVisualLineCount = (rows: readonly PullRequestListRow[]) => rows.reduce((count, row) => count + pullRequestListRowHeight(row), 0)

/**
 * An agent session under its pull request, laid out like faplex's list row:
 * status mark, `host·harness`, title, then the status line in the status color.
 */
const SessionRow = ({
	session,
	indent,
	last,
	selected,
	contentWidth,
	onSelect,
}: {
	session: FaplexSession
	indent: number
	last: boolean
	selected: boolean
	contentWidth: number
	onSelect: () => void
}) => {
	const status = session.status === "failed" || session.status === "interrupted" ? session.status : ""
	const tree = `${" ".repeat(indent + 1)}${last ? "└" : "├"} `
	const host = session.host ?? session.machine
	const harness = `·${HARNESS_SHORT[session.harness] ?? session.harness}  `
	const age = relativeAge(new Date(session.updatedAt).toISOString()).padStart(5)
	const fixed = tree.length + 2 + host.length + harness.length + age.length
	const titleWidth = Math.min(session.title.length, 48, Math.max(0, contentWidth - fixed))
	const detailWidth = Math.max(0, contentWidth - fixed - titleWidth)
	return (
		<SelectableRow width={contentWidth} selected={selected} hovered={false} onSelect={onSelect} onHoverChange={() => {}}>
			{(rowBg) => (
				<TextLine width={contentWidth} fg={colors.muted} bg={rowBg}>
					<span fg={colors.separator}>{tree}</span>
					<span fg={sessionColor(session.status)}>
						<SessionMarkText session={session} />
					</span>
					<span fg={session.hostColor ?? colors.muted}>{host}</span>
					<span fg={HARNESS_COLOR[session.harness] ?? colors.muted}>{harness}</span>
					<span fg={selected || session.open ? colors.text : colors.muted}>{fitCell(session.title, titleWidth)}</span>
					<span fg={sessionColor(session.status)}>{fitCell(`  ${(session.detail || status).split("\n")[0]}`, detailWidth)}</span>
					<span fg={colors.muted}>{age}</span>
				</TextLine>
			)}
		</SelectableRow>
	)
}

const PullRequestRow = ({
	pullRequest,
	indent,
	selected,
	hovered,
	contentWidth,
	numWidth,
	ageColWidth,
	filterText,
	compact,
	onSelect,
	onHoverChange,
}: {
	pullRequest: PullRequestItem
	indent: number
	selected: boolean
	hovered: boolean
	contentWidth: number
	numWidth: number
	ageColWidth: number
	filterText: string
	compact: boolean
	onSelect: () => void
	onHoverChange: (hovered: boolean) => void
}) => {
	const ageText = `${daysOpen(pullRequest.updatedAt)}d`
	const title = pullRequest.title.trim()
	const { reviewWidth, checkWidth, ageWidth, numberWidth, titleWidth } = getRowLayout(contentWidth - indent, numWidth, ageColWidth)
	const rowWidth = indent + reviewWidth + 1 + numberWidth + 1 + titleWidth + checkWidth + ageWidth
	const fillerWidth = Math.max(0, contentWidth - rowWidth)
	const metaIndentWidth = indent + reviewWidth + 1
	const metaWidth = Math.max(8, contentWidth - metaIndentWidth)
	const branchText =
		pullRequest.headRefName === pullRequest.baseRefName
			? null
			: pullRequest.baseRefName === pullRequest.defaultBranchName
				? pullRequest.headRefName
				: `${pullRequest.headRefName} → ${pullRequest.baseRefName}`
	const authorText = `@${pullRequest.author}`
	const branchWidth = branchText ? Math.max(0, metaWidth - authorText.length - 1) : 0
	const display = pullRequestRowDisplay(pullRequest, selected)

	return (
		<SelectableRow width={contentWidth} selected={selected} hovered={hovered} onSelect={onSelect} onHoverChange={onHoverChange}>
			{(rowBg) => (
				<>
					<TextLine width={contentWidth} fg={display.rowFg} bg={rowBg}>
						{indent > 0 ? <span>{" ".repeat(indent)}</span> : null}
						<span fg={display.indicatorFg}>{fitCell(reviewIcon(pullRequest), reviewWidth)}</span>
						<span> </span>
						<span fg={display.numberFg}>
							<MatchedCell text={`#${pullRequest.number}`} width={numberWidth} query={filterText} align="right" />
						</span>
						<span> </span>
						<span>
							<MatchedCell text={title} width={titleWidth} query={filterText} />
						</span>
						<span fg={colors.muted}>{fitCell(ageText, ageWidth, "right")}</span>
						<span fg={display.checkFg}>{fitCell(display.checkText, checkWidth, "right")}</span>
						{fillerWidth > 0 ? <span>{" ".repeat(fillerWidth)}</span> : null}
					</TextLine>
					{compact ? null : (
						<TextLine width={contentWidth} fg={colors.muted} bg={rowBg}>
							<span>{" ".repeat(metaIndentWidth)}</span>
							<MatchedCell text={authorText} width={branchText ? authorText.length : metaWidth} query={filterText} />
							{branchText ? <span> </span> : null}
							{branchText ? (
								<span fg={colors.separator}>
									<MatchedCell text={branchText} width={branchWidth} query={filterText} />
								</span>
							) : null}
						</TextLine>
					)}
				</>
			)}
		</SelectableRow>
	)
}

export const PullRequestList = ({
	groups,
	selectedUrl,
	loadMoreSelected = false,
	status,
	error,
	contentWidth,
	filterText,
	loadedCount,
	hasMore,
	isLoadingMore,
	loadingIndicator,
	onSelectPullRequest,
	onSelectLoadMore,
	showTitle = true,
	showRepositoryGroups = true,
	repositorySections = false,
	compact = false,
	sessionsFor = noPullRequestSessions,
	selectedSessionKey = null,
	onSelectSession,
}: {
	groups: PullRequestGroups
	selectedUrl: string | null
	loadMoreSelected?: boolean
	status: LoadStatus
	error: string | null
	contentWidth: number
	filterText: string
	loadedCount: number
	hasMore: boolean
	isLoadingMore: boolean
	loadingIndicator: string
	onSelectPullRequest: (url: string) => void
	onSelectLoadMore?: () => void
	showTitle?: boolean
	showRepositoryGroups?: boolean
	repositorySections?: boolean
	compact?: boolean
	sessionsFor?: PullRequestSessionsFor
	/** The session row the cursor is on under the selected PR, instead of the PR itself. */
	selectedSessionKey?: string | null
	onSelectSession?: (url: string, key: string) => void
}) => {
	const rows = buildPullRequestListRows({
		groups,
		status,
		error,
		filterText,
		loadedCount,
		hasMore,
		isLoadingMore,
		loadingIndicator,
		showTitle,
		showRepositoryGroups,
		repositorySections,
		compact,
		sessionsFor,
	})
	const { isHovered, onHoverChange } = useHoverState<string>()

	return (
		<box width={contentWidth} flexDirection="column">
			{rows.map((row, index) => {
				if (row._tag === "title") return <SectionTitle key="title" title="PULL REQUESTS" />
				if (row._tag === "message") return <PlainLine key={`message-${index}`} text={row.text} fg={row.color} />
				if (row._tag === "section") return <PlainLine key={`section-${row.label}`} text={`  ${row.label}`} fg={colors.muted} />
				if (row._tag === "load-more")
					return (
						<SelectableRow key="load-more" width={contentWidth} selected={loadMoreSelected} hovered={false} onSelect={() => onSelectLoadMore?.()} onHoverChange={() => {}}>
							{(rowBg) => (
								<TextLine width={contentWidth} fg={colors.muted} bg={rowBg}>
									<span>{row.text}</span>
								</TextLine>
							)}
						</SelectableRow>
					)
				if (row._tag === "group") return <GroupTitle key={`group-${row.repository}`} label={row.repository} color={repoColor(row.repository)} filterText={filterText} />
				if (row._tag === "session")
					return (
						<SessionRow
							key={`${row.pullRequest.url}:${row.session.key}`}
							session={row.session}
							indent={row.indent}
							last={row.last}
							selected={row.pullRequest.url === selectedUrl && row.session.key === selectedSessionKey}
							contentWidth={contentWidth}
							onSelect={() => onSelectSession?.(row.pullRequest.url, row.session.key)}
						/>
					)

				const pullRequestUrl = row.pullRequest.url
				return (
					<PullRequestRow
						key={pullRequestUrl}
						pullRequest={row.pullRequest}
						indent={row.indent}
						selected={pullRequestUrl === selectedUrl && !selectedSessionKey}
						hovered={isHovered(pullRequestUrl)}
						contentWidth={contentWidth}
						numWidth={row.numberWidth}
						ageColWidth={row.ageWidth}
						filterText={filterText}
						compact={row.compact}
						onSelect={() => onSelectPullRequest(pullRequestUrl)}
						onHoverChange={onHoverChange(pullRequestUrl)}
					/>
				)
			})}
		</box>
	)
}
