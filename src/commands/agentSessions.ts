import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { faplexState, indexPullRequestSessions, openSession, pullRequestSessionTargets } from "../faplex.js"
import { selectedPullRequestSessionAtom } from "../ui/listSelection/atoms.js"
import { activeModalAtom } from "../ui/modals/atoms.js"
import { Modal } from "../ui/modals/types.js"
import { noticeAtom } from "../ui/notice/atoms.js"
import { selectedPullRequestAtom } from "../ui/pullRequests/atoms.js"
import { noPullRequestReasonAtom, selectedPullRequestLabelAtom } from "./derivations.js"
import { defineCommand, type CommandDefinition } from "./registry.js"

const DEFAULT_INSTRUCTIONS = "Review this pull request."

const noSessionReasonAtom = Atom.make((get): string | null => {
	const reason = get(noPullRequestReasonAtom)
	if (reason !== null) return reason
	return get(selectedPullRequestSessionAtom)?.url === get(selectedPullRequestAtom)?.url ? null : "Select an agent session under a pull request first."
})

/** faplex agent sessions on pull requests; the Linear view has its own for tickets. */
export const agentSessionCommands: readonly CommandDefinition[] = [
	defineCommand({
		id: "agent.start-pull-request-session",
		title: "Start an agent session on the pull request",
		scope: "Pull request",
		subtitle: selectedPullRequestLabelAtom,
		shortcut: "n",
		keywords: ["agent", "faplex", "claude", "review", "session"],
		disabledReason: noPullRequestReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			if (!pr) return
			const { snapshot, error } = faplexState()
			const targets = snapshot ? pullRequestSessionTargets(snapshot, pr) : []
			if (targets.length === 0) {
				yield* Atom.set(noticeAtom, snapshot ? "faplex has no harness running on any machine" : (error ?? "waiting for faplex…"))
				return
			}
			yield* Atom.set(
				activeModalAtom,
				Modal.AgentSession({
					pullRequest: { repository: pr.repository, number: pr.number, title: pr.title, url: pr.url },
					targets,
					focus: "action",
					selectedIndex: 0,
					body: DEFAULT_INSTRUCTIONS,
					cursor: DEFAULT_INSTRUCTIONS.length,
					running: false,
					error: null,
				}),
			)
		}),
	}),
	defineCommand({
		id: "agent.open-session",
		title: "Open the selected agent session",
		scope: "Pull request",
		shortcut: "enter",
		keywords: ["agent", "faplex", "claude", "session", "attach"],
		disabledReason: noSessionReasonAtom,
		run: Effect.gen(function* () {
			const pr = yield* Atom.get(selectedPullRequestAtom)
			const selection = yield* Atom.get(selectedPullRequestSessionAtom)
			const session = pr && selection?.url === pr.url ? indexPullRequestSessions(faplexState().snapshot)(pr).find((s) => s.key === selection.key) : undefined
			if (!session) return
			if (!session.open) {
				yield* Atom.set(noticeAtom, "interactive session · open it in its own terminal")
				return
			}
			const failure = yield* Effect.promise(() =>
				openSession(session).then(
					() => null,
					(e: unknown) => (e instanceof Error ? e.message : String(e)),
				),
			)
			if (failure) yield* Atom.set(noticeAtom, failure)
		}),
	}),
]
