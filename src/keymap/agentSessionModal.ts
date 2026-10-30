import { context } from "@ghui/keymap"

/** On top of the review modal's list-then-text keys, which the agent session modal shares. */
export interface AgentSessionModalCtx {
	readonly startAndOpen: () => void
}

const AgentSession = context<AgentSessionModalCtx>()

export const agentSessionModalKeymap = AgentSession({
	id: "agent-session.start-and-open",
	title: "Start the session and open it",
	keys: ["ctrl+o"],
	run: (s) => s.startAndOpen(),
})
