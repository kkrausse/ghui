/**
 * OSC 8 hyperlinks under tmux.
 *
 * OpenTUI decides hyperlink support from TERM/TERM_PROGRAM and always says no
 * inside tmux, so markdown links render as `label (url)` with no escape. tmux
 * itself knows whether the outer terminal takes hyperlinks (`client_termfeatures`,
 * set via `terminal-features ',*:hyperlinks'`). When it does, flip OpenTUI's flag
 * through the native setter it exports but never binds in JS. Failure anywhere
 * just leaves the default behavior.
 */
import type { CliRenderer } from "@opentui/core"
import { dlopen, FFIType } from "bun:ffi"
import { dirname, join } from "node:path"

/** True when this process runs in a tmux pane whose client terminal accepts OSC 8. */
export function tmuxClientHasHyperlinks(env: NodeJS.ProcessEnv = process.env): boolean {
	if (!env.TMUX) return false
	const out = Bun.spawnSync(["tmux", "display-message", "-p", "#{client_termfeatures}"], {
		env,
		stdout: "pipe",
		stderr: "ignore",
	})
	return out.exitCode === 0 && hasHyperlinksFeature(out.stdout.toString())
}

export function hasHyperlinksFeature(termfeatures: string): boolean {
	return termfeatures.trim().split(",").includes("hyperlinks")
}

/** Force OpenTUI's hyperlinks capability on and keep it on across capability re-detection. */
export function enableHyperlinks(renderer: CliRenderer): void {
	let setter: ((handle: number, on: boolean) => void) | null = null
	try {
		const pkg = Bun.resolveSync(`@opentui/core-${process.platform}-${process.arch}/package.json`, import.meta.dir)
		const lib = dlopen(join(dirname(pkg), process.platform === "darwin" ? "libopentui.dylib" : "libopentui.so"), {
			setHyperlinksCapability: { args: [FFIType.u32, FFIType.bool], returns: FFIType.void },
		})
		setter = lib.symbols.setHyperlinksCapability as (handle: number, on: boolean) => void
	} catch {
		return
	}
	const r = renderer as unknown as { rendererPtr: number; capabilities: { hyperlinks: boolean } | null }
	const force = () => {
		setter!(r.rendererPtr, true)
		if (r.capabilities) r.capabilities.hyperlinks = true
	}
	force()
	// Registered before any <markdown> mounts, so it runs first on each event and the
	// markdown listeners see the patched object.
	renderer.on("capabilities", (caps: { hyperlinks: boolean }) => {
		if (caps.hyperlinks !== true) force()
	})
}
