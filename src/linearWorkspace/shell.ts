/** Host integrations. Spawned as argv arrays -- never through a shell. */

export async function copyToClipboard(text: string): Promise<void> {
	const proc = Bun.spawn(["pbcopy"], { stdin: "pipe", stderr: "ignore" })
	proc.stdin.write(text)
	await proc.stdin.end()
	await proc.exited
}

/** `open` hands off to the Linear desktop app when it has claimed the URL scheme. */
export async function openInBrowser(url: string): Promise<void> {
	Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" })
}
