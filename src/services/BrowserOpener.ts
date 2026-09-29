import { Context, Effect, Layer } from "effect"
import type { PullRequestItem } from "../domain.js"
import { CommandError, CommandRunner } from "./CommandRunner.js"

// `open` ships on macOS; `xdg-open` is the Linux/BSD convention; `start` is the
// Windows shell built-in and requires a dummy title argument before the URL.
const platformOpener = (): { readonly command: string; readonly prefix: readonly string[] } => {
	if (process.platform === "darwin") return { command: "open", prefix: [] }
	if (process.platform === "win32") return { command: "cmd", prefix: ["/c", "start", ""] }
	return { command: "xdg-open", prefix: [] }
}

export const isWebUrl = (value: string): boolean => {
	try {
		const { protocol } = new URL(value)
		return protocol === "https:" || protocol === "http:"
	} catch {
		return false
	}
}

export class BrowserOpener extends Context.Service<
	BrowserOpener,
	{
		readonly openPullRequest: (pullRequest: PullRequestItem) => Effect.Effect<void, CommandError>
		readonly openUrl: (url: string) => Effect.Effect<void, CommandError>
	}
>()("ghui/BrowserOpener") {
	static readonly layerNoDeps = Layer.effect(
		BrowserOpener,
		Effect.gen(function* () {
			const command = yield* CommandRunner
			const opener = platformOpener()

			const openPullRequest = Effect.fn("BrowserOpener.openPullRequest")(function* (pullRequest: PullRequestItem) {
				yield* command.run("gh", ["pr", "view", String(pullRequest.number), "--repo", pullRequest.repository, "--web"])
			})

			const openUrl = Effect.fn("BrowserOpener.openUrl")(function* (url: string) {
				// Links come from Markdown anyone can write; `open` would also launch file:// and app schemes.
				if (!isWebUrl(url)) return yield* new CommandError({ command: opener.command, args: [url], detail: `Refusing to open non-web link: ${url}`, cause: url })
				yield* command.run(opener.command, [...opener.prefix, url])
			})

			return BrowserOpener.of({ openPullRequest, openUrl })
		}),
	)

	static readonly layer = BrowserOpener.layerNoDeps.pipe(Layer.provide(CommandRunner.layer))
}
