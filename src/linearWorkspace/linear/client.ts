/**
 * Linear GraphQL client.
 *
 * Token resolution prefers the macOS Keychain over an env var so the credential
 * is not inherited by every child process this shell spawns, and never lands in
 * a dotfile. See README for the one-time `security add-generic-password` call.
 */
import * as v from "valibot"
import { devLog } from "../../devLog.js"

export const LINEAR_ENDPOINT = "https://api.linear.app/graphql"

export const KEYCHAIN_SERVICE = "linear-api-token"

/** Personal API keys go in Authorization raw -- no "Bearer" prefix (OAuth tokens differ). */
let cachedToken: string | null = null

/**
 * `security` can block indefinitely -- a locked keychain prompts, and with no
 * controlling terminal that prompt never resolves. Without this bound the app
 * hangs before it draws anything, which looks like a freeze rather than a
 * missing credential.
 */
const KEYCHAIN_TIMEOUT_MS = 3000

export async function readKeychain(): Promise<string | null> {
	let proc: Bun.Subprocess<"ignore", "pipe", "ignore"> | null = null
	try {
		proc = Bun.spawn(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		})
		const read = (async () => {
			const out = (await new Response(proc!.stdout).text()).trim()
			return (await proc!.exited) === 0 && out.length > 0 ? out : null
		})()
		const timeout = Bun.sleep(KEYCHAIN_TIMEOUT_MS).then(() => "__timeout__" as const)
		const result = await Promise.race([read, timeout])
		if (result === "__timeout__") {
			proc.kill()
			return null
		}
		return result
	} catch {
		return null
	} finally {
		try {
			proc?.kill()
		} catch {
			/* already exited */
		}
	}
}

export class MissingTokenError extends Error {
	constructor() {
		super(
			[
				"No Linear API token found.",
				"",
				"  ghui --linear-login",
				"",
				"That opens Linear's key page, stores the key in your Keychain, and",
				"reports what it can see. Or export LINEAR_API_TOKEN to override.",
			].join("\n"),
		)
		this.name = "MissingTokenError"
	}
}

/** Env wins so a one-off override works; Keychain is the recommended resting place. */
export async function resolveToken(): Promise<string> {
	if (cachedToken) return cachedToken
	const token = process.env.LINEAR_API_TOKEN?.trim() || (await readKeychain())
	if (!token) throw new MissingTokenError()
	cachedToken = token
	return token
}

const GraphQLErrorsSchema = v.object({
	errors: v.optional(v.array(v.object({ message: v.string() }))),
})

/**
 * Runs a query and validates the payload. Validation failures surface as
 * errors rather than undefined field reads deep inside a render pass.
 */
export async function gql<TSchema extends v.GenericSchema>(document: string, variables: Record<string, unknown>, schema: TSchema): Promise<v.InferOutput<TSchema>> {
	const startedAt = Date.now()
	try {
		const token = await resolveToken()

		const res = await fetch(LINEAR_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: token,
				"User-Agent": "kevin-scripts-linear-tui/0.1",
			},
			body: JSON.stringify({ query: document, variables }),
		})

		if (res.status === 401 || res.status === 403) {
			throw new Error(`Linear rejected the token (HTTP ${res.status}). If you scoped it to specific ` + `teams, the data you requested may sit outside that scope.`)
		}

		const raw: unknown = await res.json().catch(() => null)
		if (raw === null) throw new Error(`Linear returned non-JSON (HTTP ${res.status})`)

		const withErrors = v.safeParse(GraphQLErrorsSchema, raw)
		if (withErrors.success && withErrors.output.errors?.length) {
			throw new Error(withErrors.output.errors.map((e) => e.message).join("; "))
		}

		if (!res.ok) throw new Error(`Linear HTTP ${res.status}`)

		const data = (raw as { data?: unknown }).data
		const parsed = v.safeParse(schema, data)
		if (!parsed.success) {
			const first = parsed.issues[0]
			const path = first?.path?.map((p) => String(p.key)).join(".") ?? "?"
			throw new Error(`Unexpected Linear response at "${path}": ${first?.message}`)
		}
		return parsed.output
	} catch (e) {
		const operation = /^\s*(?:query|mutation)\s+(\w+)/.exec(document)?.[1] ?? "anonymous"
		devLog("linear:failed", { operation, ms: Date.now() - startedAt, error: e instanceof Error ? e.message : String(e) })
		throw e
	}
}

/**
 * Per-view response cache. Views are re-entered constantly while navigating;
 * without this, every Tab keypress refires a 250-issue query.
 */
const cache = new Map<string, { at: number; value: unknown }>()
const TTL_MS = 60_000

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
	const value = await fetcher()
	cache.set(key, { at: Date.now(), value })
	return value
}

export function invalidateCache(): void {
	cache.clear()
}
