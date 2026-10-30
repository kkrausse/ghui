import { TextAttributes } from "@opentui/core"
import { HARNESS_COLOR } from "../../faplex.js"
import { colors } from "../colors.js"
import { clampCursor, commentEditorLines, cursorLineIndexForLines } from "../commentEditor.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, PlainLine, standardModalDims, TextLine } from "../primitives.js"
import type { AgentSessionModalState } from "./types.js"

const PLACEHOLDER = "Optional instructions..."

/**
 * `n` on a pull request: pick where a faplex agent session runs (machine ×
 * harness × directory), then write its first instructions. The session is
 * tagged with the PR, so it shows up under it in the list.
 */
export const AgentSessionModal = ({
	state,
	loadingIndicator,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: AgentSessionModalState
	loadingIndicator: string
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { innerWidth, contentWidth } = standardModalDims(modalWidth, modalHeight)
	const selectedIndex = Math.max(0, Math.min(state.selectedIndex, state.targets.length - 1))
	const headerRows = 1
	const errorHeight = state.error ? 1 : 0
	const footerRows = 1
	const dividerRows = 3
	const frameBorderRows = 2
	const minEditorHeight = 3
	const targetHeight = Math.max(1, Math.min(state.targets.length, modalHeight - frameBorderRows - headerRows - errorHeight - footerRows - dividerRows - minEditorHeight))
	const targetStart = Math.min(Math.max(0, state.targets.length - targetHeight), Math.max(0, selectedIndex - targetHeight + 1))
	const editorHeight = Math.max(1, modalHeight - frameBorderRows - headerRows - targetHeight - errorHeight - footerRows - dividerRows)
	const targetDividerRow = headerRows
	const editorDividerRow = headerRows + 1 + targetHeight
	const footerDividerRow = editorDividerRow + 1 + errorHeight + editorHeight
	const lineRanges = commentEditorLines(state.body)
	const cursor = clampCursor(state.body, state.cursor)
	const cursorLineIndex = cursorLineIndexForLines(lineRanges, cursor)
	const visibleStart = Math.min(Math.max(0, lineRanges.length - editorHeight), Math.max(0, cursorLineIndex - editorHeight + 1))
	const visibleLines = lineRanges.slice(visibleStart, visibleStart + editorHeight)
	const pr = state.pullRequest
	const title = pr ? `New agent session · ${pr.repository}#${pr.number}` : "New agent session"
	const editorFocused = state.focus === "body"
	const renderEditorLine = (line: { readonly text: string; readonly start: number; readonly end: number }, index: number) => {
		const lineIndex = visibleStart + index
		const isCursorLine = lineIndex === cursorLineIndex
		const cursorColumn = Math.max(0, Math.min(cursor - line.start, line.text.length))
		const viewStart = editorFocused && isCursorLine ? Math.max(0, cursorColumn - contentWidth + 1) : 0
		const visibleText = line.text.slice(viewStart, viewStart + contentWidth)

		if (!editorFocused || !isCursorLine) {
			if (state.body.length === 0 && lineIndex === 0) return <PlainLine key={lineIndex} text={fitCell(PLACEHOLDER, contentWidth)} fg={colors.muted} />
			return <PlainLine key={lineIndex} text={fitCell(visibleText, contentWidth)} fg={colors.text} />
		}

		const cursorInView = cursorColumn - viewStart
		const before = visibleText.slice(0, cursorInView)
		const placeholder = state.body.length === 0 ? PLACEHOLDER : ""
		const cursorChar = placeholder ? (placeholder[0] ?? " ") : (visibleText[cursorInView] ?? " ")
		const after = placeholder ? placeholder.slice(1) : visibleText.slice(cursorInView + 1)

		return (
			<TextLine key={lineIndex}>
				{before ? <span fg={colors.text}>{before}</span> : null}
				<span bg={colors.accent} fg={colors.background}>
					{cursorChar}
				</span>
				{after ? <span fg={placeholder ? colors.muted : colors.text}>{after}</span> : null}
			</TextLine>
		)
	}

	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[targetDividerRow, editorDividerRow, footerDividerRow]}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.accent} attributes={TextAttributes.BOLD}>
						{fitCell(title, contentWidth)}
					</span>
				</TextLine>
			</PaddedRow>
			<Divider width={innerWidth} />
			<box height={targetHeight} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{state.targets.slice(targetStart, targetStart + targetHeight).map((target, offset) => {
					const index = targetStart + offset
					const isSelected = index === selectedIndex
					const isFocusedSelection = isSelected && state.focus === "action"
					const where = `${target.host} · ${target.harness}`
					const whereWidth = Math.min(24, Math.max(8, Math.floor(contentWidth / 3)))
					const dirWidth = Math.max(1, contentWidth - whereWidth - 3)
					return (
						<TextLine key={`${where}:${target.dir}`} bg={isFocusedSelection ? colors.selectedBg : undefined} fg={isFocusedSelection ? colors.selectedText : colors.text}>
							<span fg={HARNESS_COLOR[target.harness] ?? colors.muted}>{isFocusedSelection ? "›" : isSelected ? "✓" : " "}</span>
							<span> {fitCell(where, whereWidth)}</span>
							<span fg={isFocusedSelection ? colors.selectedText : colors.muted}> {fitCell(target.note ? `${target.dir} · ${target.note}` : target.dir, dirWidth)}</span>
						</TextLine>
					)
				})}
			</box>
			<Divider width={innerWidth} />
			{state.error ? (
				<PaddedRow>
					<PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} />
				</PaddedRow>
			) : null}
			<box height={editorHeight} flexDirection="column" paddingLeft={1} paddingRight={1}>
				{visibleLines.map(renderEditorLine)}
			</box>
			<Divider width={innerWidth} />
			<PaddedRow>
				{state.running ? (
					<PlainLine text={fitCell(`${loadingIndicator} Starting session...`, contentWidth)} fg={colors.muted} />
				) : (
					<HintRow
						items={
							editorFocused
								? [
										{ key: "shift-enter", label: "newline" },
										{ key: "enter", label: "start" },
										{ key: "ctrl-o", label: "open" },
										{ key: "esc", label: "where" },
									]
								: [
										{ key: "↑↓", label: "where" },
										{ key: "enter", label: "instructions" },
										{ key: "ctrl-o", label: "open" },
										{ key: "esc", label: "cancel" },
									]
						}
					/>
				)}
			</PaddedRow>
		</ModalFrame>
	)
}
