export interface GitHubPullRequestRoute {
	readonly repository: string
	readonly number: number
	readonly url: string
}

/** Only a PR root is supported: never reinterpret files, commits or anchors. */
export const githubPullRequestRoute = (value: string): GitHubPullRequestRoute | null => {
	try {
		const url = new URL(value)
		if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null
		const match = /^\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?$/.exec(url.pathname)
		if (!match) return null
		const number = Number(match[3])
		if (!Number.isSafeInteger(number)) return null
		const repository = `${match[1]}/${match[2]}`
		return { repository, number, url: `https://github.com/${repository}/pull/${number}` }
	} catch {
		return null
	}
}
