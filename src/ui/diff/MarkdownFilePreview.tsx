import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useState, type MutableRefObject } from "react"
import type { PullRequestItem } from "../../domain.js"
import { errorMessage } from "../../errors.js"
import { useRequest } from "../../hooks/useRequest.js"
import { pullRequestHeadRef } from "../diff.js"
import { pullRequestFileContentRequest } from "./atoms.js"
import { colors } from "../colors.js"
import { LoadingPane, StatusCard } from "../DetailsPane.js"
import { MarkdownBody } from "../MarkdownBody.js"
import { Divider, fitCell, HintRow, ModalFrame, PaddedRow, TextLine } from "../primitives.js"

type PreviewState = { readonly _tag: "loading" } | { readonly _tag: "ready"; readonly content: string } | { readonly _tag: "error"; readonly message: string }

export interface MarkdownFilePreviewProps {
	readonly pullRequest: PullRequestItem
	readonly path: string
	readonly modalWidth: number
	readonly modalHeight: number
	readonly offsetLeft: number
	readonly offsetTop: number
	readonly loadingIndicator: string
	readonly scrollRef: MutableRefObject<ScrollBoxRenderable | null>
	// Bumped by `r` to refetch the same path.
	readonly reloadKey: number
	readonly showScrollbar: boolean
	readonly onLinkOpen?: ((url: string) => void) | undefined
}

export const MarkdownFilePreview = ({
	pullRequest,
	path,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
	loadingIndicator,
	scrollRef,
	reloadKey,
	showScrollbar,
	onLinkOpen,
}: MarkdownFilePreviewProps) => {
	const loadContent = useRequest(pullRequestFileContentRequest)
	const [state, setState] = useState<PreviewState>({ _tag: "loading" })

	useEffect(() => {
		let active = true
		setState({ _tag: "loading" })
		scrollRef.current?.scrollTo({ x: 0, y: 0 })
		void loadContent({ repository: pullRequest.repository, path, ref: pullRequestHeadRef(pullRequest) }).then(
			(content) => {
				if (active) setState({ _tag: "ready", content })
			},
			(cause) => {
				if (active) setState({ _tag: "error", message: errorMessage(cause) })
			},
		)
		return () => {
			active = false
		}
	}, [loadContent, path, pullRequest.headRefOid, pullRequest.repository, scrollRef, reloadKey])

	const contentWidth = Math.max(1, modalWidth - 2)
	const bodyHeight = Math.max(1, modalHeight - 6)
	return (
		<ModalFrame left={offsetLeft} top={offsetTop} width={modalWidth} height={modalHeight} junctionRows={[1, modalHeight - 4]}>
			<PaddedRow>
				<TextLine>
					<span fg={colors.count}>Markdown </span>
					<span fg={colors.text}>{fitCell(path, Math.max(1, contentWidth - 11))}</span>
				</TextLine>
			</PaddedRow>
			<Divider width={contentWidth} />
			{state._tag === "loading" ? (
				<LoadingPane content={{ title: `${loadingIndicator} Loading Markdown`, hint: "Fetching the complete file at the PR head" }} width={contentWidth} height={bodyHeight} />
			) : state._tag === "error" ? (
				<box height={bodyHeight} flexDirection="column" justifyContent="center">
					<StatusCard content={{ title: "Could not load Markdown", hint: state.message }} width={contentWidth} />
				</box>
			) : (
				<scrollbox ref={scrollRef} focusable={false} flexGrow={1} scrollY scrollX={false} {...(showScrollbar ? {} : { verticalScrollbarOptions: { visible: false } })}>
					<box flexDirection="column" flexShrink={0} paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
						<MarkdownBody body={state.content || "_Empty document._"} width={Math.max(1, contentWidth - 2)} repository={pullRequest.repository} onLinkOpen={onLinkOpen} />
					</box>
				</scrollbox>
			)}
			<Divider width={contentWidth} />
			<HintRow
				items={[
					{ key: "↑↓", label: "scroll" },
					{ key: "drag", label: "select" },
					{ key: "y/cmd-c", label: "copy selection/file" },
					{ key: "m/esc", label: "close" },
				]}
			/>
		</ModalFrame>
	)
}
