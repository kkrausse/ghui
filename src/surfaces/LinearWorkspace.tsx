import { useEffect, useState } from "react"
import type { LinearWorkspaceProps } from "../linearWorkspace/app.js"
import { colors } from "../ui/colors.js"

/** Load Linear (and its credential lookup) only after the first visit. */
export const LinearWorkspace = (props: LinearWorkspaceProps & { readonly active: boolean; readonly width: number; readonly height: number }) => {
	const [Workspace, setWorkspace] = useState<typeof import("../linearWorkspace/app.js").App | null>(null)
	const [error, setError] = useState<string | null>(null)
	useEffect(() => {
		if (!props.active || Workspace) return
		let cancelled = false
		void import("../linearWorkspace/app.js").then(
			(module) => {
				if (!cancelled) setWorkspace(() => module.App)
			},
			(cause) => {
				if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
			},
		)
		return () => {
			cancelled = true
		}
	}, [props.active, Workspace])

	// Keep the React workspace mounted to preserve navigation state. Its inactive
	// render is null, so no hidden focused inputs can consume GitHub keystrokes.
	if (Workspace) return <Workspace {...props} />
	if (!props.active) return null
	return (
		<box width={props.width} height={props.height} padding={1}>
			<text fg={error ? colors.error : colors.muted}>{error ?? "Loading Linear workspace…"}</text>
		</box>
	)
}
