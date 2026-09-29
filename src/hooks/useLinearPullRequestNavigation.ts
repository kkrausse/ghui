import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { Effect } from "effect"
import { useCallback, useContext, useEffect, useRef } from "react"
import { errorMessage } from "../errors.js"
import { githubPullRequestRoute, type GitHubPullRequestRoute } from "../githubPullRequestRoute.js"
import { GitHubService } from "../services/GitHubService.js"
import { githubRequest } from "../services/runtime.js"
import { detailFullViewAtom, detailScrollOffsetAtom } from "../ui/detail/atoms.js"
import { linearPullRequestAtom, linearPullRequestTrailAtom } from "../ui/pullRequests/linkedSelection.js"
import { workspaceSurfaceAtom } from "../workspace/atoms.js"
import { useRequest } from "./useRequest.js"

export const linkedPullRequestRequest = githubRequest<GitHubPullRequestRoute>()((route) =>
	Effect.flatMap(GitHubService, (github) => github.getPullRequestDetails(route.repository, route.number)),
)

export const useLinearPullRequestNavigation = (flashNotice: (message: string) => void, locked: boolean, navigationLockRef?: { readonly current: boolean }) => {
	const registry = useContext(RegistryContext)
	const surface = useAtomValue(workspaceSurfaceAtom)
	const lockedRef = useRef(locked)
	lockedRef.current = locked
	const fetch = useRequest(linkedPullRequestRequest)
	const generation = useRef(0)
	useEffect(() => {
		generation.current++
	}, [surface])
	useEffect(
		() => () => {
			generation.current++
		},
		[],
	)
	return useCallback(
		(url: string): boolean => {
			const route = githubPullRequestRoute(url)
			if (!route) return false
			const token = ++generation.current
			flashNotice(`Opening ${route.repository}#${route.number}…`)
			void fetch(route)
				.then((pr) => {
					if (token !== generation.current || (navigationLockRef?.current ?? lockedRef.current) || registry.get(workspaceSurfaceAtom) !== "linear") return
					// Do not trust a fuzzy queue result or silently open a different entity.
					if (pr.repository.toLowerCase() !== route.repository.toLowerCase() || pr.number !== route.number) throw new Error("GitHub returned a different pull request")
					registry.set(linearPullRequestAtom, pr)
					registry.set(linearPullRequestTrailAtom, [])
					registry.set(detailScrollOffsetAtom, 0)
					registry.set(detailFullViewAtom, true)
					registry.set(workspaceSurfaceAtom, "pullRequests")
				})
				.catch((error) => {
					if (token === generation.current) flashNotice(errorMessage(error))
				})
			return true
		},
		[fetch, flashNotice, registry, navigationLockRef],
	)
}
