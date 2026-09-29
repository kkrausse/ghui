import * as Atom from "effect/unstable/reactivity/Atom"
import type { PullRequestItem } from "../../domain.js"

/** A Linear drill-in is an entity selection, not an insertion into an open queue. */
export const linearPullRequestAtom = Atom.make<PullRequestItem | null>(null).pipe(Atom.keepAlive)

export type LinkedPullRequestPage = "detail" | "diff" | "comments" | "runs"
/** Only the pages inside a Linear drill-in, not a generic GHUI history. */
export const linearPullRequestTrailAtom = Atom.make<readonly LinkedPullRequestPage[]>([]).pipe(Atom.keepAlive)
