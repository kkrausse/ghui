/** Host integrations, through GHUI's services: one web-URL check and per-platform commands. */
import { Effect } from "effect"
import { BrowserOpener } from "../services/BrowserOpener.ts"
import { Clipboard } from "../services/Clipboard.ts"

/** Failures are dropped, matching the fire-and-forget call sites. */
export async function copyToClipboard(text: string): Promise<void> {
	await Effect.runPromise(Clipboard.use((clipboard) => clipboard.copy(text)).pipe(Effect.provide(Clipboard.layer), Effect.ignore))
}

/** `open` hands off to the Linear desktop app when it has claimed the URL scheme. */
export async function openInBrowser(url: string): Promise<void> {
	await Effect.runPromise(BrowserOpener.use((browser) => browser.openUrl(url)).pipe(Effect.provide(BrowserOpener.layer), Effect.ignore))
}
