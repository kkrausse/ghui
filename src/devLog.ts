// Append-only rolling trace log, always on.
//
// Writes to `GHUI_DEBUG_LOG` if set, else `~/.cache/ghui/ghui.log`. When the
// file passes 5 MB it is renamed to `<path>.1` (replacing the previous one),
// so disk use stays under ~10 MB. Off under `bun test` unless the env var is
// set. Every call is `appendFileSync` so the trace reflects real execution
// order across React renders, Effect fibers, and the renderer event loop.
// Swallows all errors: a broken log file must never crash the app.

import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const MAX_BYTES = 5 * 1024 * 1024

export const devLogPath: string | null = process.env.GHUI_DEBUG_LOG ?? (process.env.NODE_ENV === "test" ? null : join(homedir(), ".cache", "ghui", "ghui.log"))

let bytes = -1

const write = (line: string) => {
	if (!devLogPath) return
	try {
		if (bytes < 0) {
			mkdirSync(dirname(devLogPath), { recursive: true })
			bytes = statSync(devLogPath, { throwIfNoEntry: false })?.size ?? 0
			line = `=== ghui session ${new Date().toISOString()} pid=${process.pid} ===\n${line}`
		}
		if (bytes > MAX_BYTES) {
			renameSync(devLogPath, `${devLogPath}.1`)
			bytes = 0
		}
		appendFileSync(devLogPath, line)
		bytes += Buffer.byteLength(line)
	} catch {
		// no-op
	}
}

const serialize = (data: unknown): string => {
	if (data === undefined) return ""
	if (data instanceof Error) return ` ${data.stack ?? data.message}`
	try {
		return ` ${JSON.stringify(data)}`
	} catch {
		return ` ${String(data)}`
	}
}

export const devLog = (scope: string, data?: unknown): void => {
	if (!devLogPath) return
	write(`${new Date().toISOString()} [${scope}]${serialize(data)}\n`)
}
