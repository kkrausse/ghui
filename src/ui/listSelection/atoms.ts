import * as Atom from "effect/unstable/reactivity/Atom"

export const selectedIndexAtom = Atom.make(0)
export const selectedIssueIndexAtom = Atom.make(0)

/** The agent session row the cursor is on under the selected PR; ignored once another PR is selected. */
export const selectedPullRequestSessionAtom = Atom.make<{ readonly url: string; readonly key: string } | null>(null)
