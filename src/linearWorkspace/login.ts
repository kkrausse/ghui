/**
 * Guided credential setup:  bun run linear --login
 *
 * Opens Linear's key page, hands the secret prompt to `security` (so the key
 * never passes through this process, the shell, or history), then proves what
 * the key can actually see.
 *
 * Not OAuth: Linear's OAuth flow needs a registered application, which is
 * admin-gated at the workspace level. A personal key also scopes *narrower* --
 * it can be restricted to specific teams, which OAuth's `read` scope cannot.
 */
import * as v from "valibot"
import { KEYCHAIN_SERVICE, LINEAR_ENDPOINT, readKeychain } from "./linear/client.ts"
import { openInBrowser } from "./shell.ts"

const SETTINGS_URL = "https://linear.app/settings/account/security"

const ProbeSchema = v.object({
	viewer: v.object({
		displayName: v.string(),
		teams: v.object({ nodes: v.array(v.object({ key: v.string(), name: v.string() })) }),
	}),
})

/** Confirms the key works and reports its reach, so a too-narrow scope is obvious now. */
async function probe(token: string) {
	const res = await fetch(LINEAR_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: token },
		body: JSON.stringify({
			query: `query Probe { viewer { displayName teams(first: 50) { nodes { key name } } } }`,
		}),
	})
	if (!res.ok) throw new Error(`Linear rejected the key (HTTP ${res.status})`)
	const body = (await res.json()) as { data?: unknown; errors?: { message: string }[] }
	if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "))
	return v.parse(ProbeSchema, body.data)
}

/** Write-scope check: attempting a mutation is the only way to know for sure. */
async function isReadOnly(token: string): Promise<boolean | null> {
	const res = await fetch(LINEAR_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: token },
		// Deliberately invalid input: a write-scoped key fails validation, a
		// read-only key is refused for lacking the scope. Neither creates anything.
		body: JSON.stringify({
			query: `mutation ScopeProbe { issueCreate(input: { title: "", teamId: "" }) { success } }`,
		}),
	})
	const body = (await res.json()) as { errors?: { message: string }[] }
	const text = (body.errors ?? [])
		.map((e) => e.message)
		.join(" ")
		.toLowerCase()
	if (!text) return false // mutation went through -- key can write
	if (text.includes("scope") || text.includes("access denied") || text.includes("not authorized")) {
		return true
	}
	return null // failed on validation instead, so scope is unproven
}

export async function login(): Promise<number> {
	console.log(`Opening ${SETTINGS_URL}`)
	console.log("")
	console.log("  1. Personal API keys -> Create key")
	console.log("  2. Set access to Read only")
	console.log("  3. Restrict it to the teams you actually browse")
	console.log("  4. Copy the key, then paste it at the prompt below")
	console.log("")
	await openInBrowser(SETTINGS_URL)

	// `-w` last makes `security` prompt for the value itself, hidden and confirmed.
	const proc = Bun.spawn(["security", "add-generic-password", "-U", "-a", process.env.USER ?? "linear", "-s", KEYCHAIN_SERVICE, "-w"], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})
	if ((await proc.exited) !== 0) {
		console.error("Keychain write failed or was canceled.")
		return 1
	}

	const token = await readKeychain()
	if (!token) {
		console.error("Stored, but could not read the key back from the Keychain.")
		return 1
	}

	try {
		const { viewer } = await probe(token)
		const readOnly = await isReadOnly(token)

		console.log("")
		console.log(`Authenticated as ${viewer.displayName}`)
		console.log(`Teams visible: ${viewer.teams.nodes.map((t) => t.key).join(", ") || "(none)"}`)
		console.log(
			readOnly === true
				? "Scope: read-only (confirmed)"
				: readOnly === false
					? "Scope: this key CAN WRITE. Use a read-only key if you do not need editing."
					: "Scope: could not confirm; check it is Read only in Linear.",
		)
		console.log("")
		console.log("Open the Linear tab in GHUI to start.")
		return 0
	} catch (err) {
		console.error(`Key stored but unusable: ${err instanceof Error ? err.message : err}`)
		return 1
	}
}

export async function logout(): Promise<number> {
	const proc = Bun.spawn(["security", "delete-generic-password", "-s", KEYCHAIN_SERVICE], { stdout: "ignore", stderr: "ignore" })
	const ok = (await proc.exited) === 0
	console.log(ok ? "Removed the key from the Keychain." : "No key found in the Keychain.")
	return 0
}
