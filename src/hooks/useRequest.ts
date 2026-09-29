import { RegistryContext } from "@effect/atom-react"
import { Effect } from "effect"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { useCallback, useContext } from "react"

export const runRequest = <I, A, E>(registry: AtomRegistry.AtomRegistry, request: (input: I) => Atom.Atom<AsyncResult.AsyncResult<A, E>>, input: I): Promise<A> =>
	Effect.runPromise(AtomRegistry.getResult(registry, request(input), { suspendOnWaiting: true }))

/** Await the invocation's own result, never a shared latest-wins function atom. */
export const useRequest = <I, A, E>(request: (input: I) => Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
	const registry = useContext(RegistryContext)
	return useCallback((input: I) => runRequest(registry, request, input), [registry, request])
}
