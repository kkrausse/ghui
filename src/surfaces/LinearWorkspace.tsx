import { useCallback, useEffect, useRef, useState } from "react"
import { useAtomSet } from "@effect/atom-react"
import { registerHandoff } from "../commands/handoffs.js"
import { linearAvailableActionsAtom } from "../commands/linear.js"
import { linearActionDefinitions, type LinearAction, type LinearActions } from "../linearWorkspace/commandActions.js"
import type { LinearWorkspaceProps } from "../linearWorkspace/app.js"
import { colors } from "../ui/colors.js"

/** Load Linear (and its credential lookup) only after the first visit. */
export const LinearWorkspace = (props: LinearWorkspaceProps & { readonly active: boolean; readonly width: number; readonly height: number }) => {
	const setAvailableActions = useAtomSet(linearAvailableActionsAtom)
	const actionsRef = useRef<LinearActions>({})
	const availableRef = useRef<readonly LinearAction[]>([])
	const onCommandsChange = useCallback(
		(actions: LinearActions) => {
			actionsRef.current = actions
			const available = linearActionDefinitions.filter(({ action }) => actions[action]).map(({ action }) => action)
			if (available.join() !== availableRef.current.join()) {
				availableRef.current = available
				setAvailableActions(available)
			}
		},
		[setAvailableActions],
	)
	useEffect(() => {
		setAvailableActions([])
		const unregister = linearActionDefinitions.map(({ action }) => registerHandoff(`linear.${action}`, () => actionsRef.current[action]?.()))
		return () => {
			unregister.forEach((dispose) => dispose())
			actionsRef.current = {}
		}
	}, [setAvailableActions])
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
	if (Workspace) return <Workspace {...props} onCommandsChange={onCommandsChange} />
	if (!props.active) return null
	return (
		<box width={props.width} height={props.height} padding={1}>
			<text fg={error ? colors.error : colors.muted}>{error ?? "Loading Linear workspace…"}</text>
		</box>
	)
}
