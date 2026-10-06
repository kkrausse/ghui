#!/usr/bin/env bun

import { addDefaultParsers, createCliRenderer } from "@opentui/core"
import { createRoot, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Effect } from "effect"
import { appendFileSync, mkdirSync } from "node:fs"
import { appendFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react"
import { errorMessage } from "./errors.js"
import { createSystemThemeReloader, type SystemThemeReloadEvent } from "./systemThemeReload.js"
import { setTuiSuspender } from "./tuiSuspension.js"
import { loadStoredSystemThemeAutoReload } from "./themeStore.js"
import { colors, setSystemThemeColors } from "./ui/colors.js"
import { LoadingLogoPane } from "./ui/LoadingLogo.js"
import { SPINNER_INTERVAL_MS } from "./ui/spinner.js"
import { refreshApplicationTitle, setApplicationTitle } from "./processTitle.js"

if (Bun.argv[2] === "--linear-login" || Bun.argv[2] === "--linear-logout") {
	const { login, logout } = await import("./linearWorkspace/login.js")
	process.exit(await (Bun.argv[2] === "--linear-login" ? login() : logout()))
}

process.env.OTUI_USE_ALTERNATE_SCREEN = "true"
setApplicationTitle("ghui")

const addGhUiParsers = () =>
	addDefaultParsers([
		{
			filetype: "bash",
			aliases: ["sh", "shell", "zsh", "ksh"],
			wasm: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.1/tree-sitter-bash.wasm",
			queries: {
				highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-bash/v0.25.1/queries/highlights.scm"],
			},
		},
	])

const FOCUS_REPORTING_ENABLE = "\x1b[?1004h"
const FOCUS_REPORTING_DISABLE = "\x1b[?1004l"
// tmux 3.4 negotiates modifyOtherKeys rather than forwarding Kitty's full flags.
const EXTENDED_KEYS_ENABLE = process.env.TMUX ? "\x1b[>4;2m" : ""
const EXTENDED_KEYS_DISABLE = process.env.TMUX ? "\x1b[>4;0m" : ""
const FULL_SCREEN_REPAINT = "\x1b[2J\x1b[3J\x1b[H"

type AppBundle = {
	readonly RegistryProvider: (typeof import("@effect/atom-react"))["RegistryProvider"]
	readonly App: (typeof import("./App.js"))["App"]
}

let notifySystemThemeReload = () => {}

const SYSTEM_THEME_READ_TIMEOUT_MS = 500
const SYSTEM_THEME_DEBUG_LOG_PATH = process.env.GHUI_DEBUG_THEME_RELOAD_LOG ?? null

const logReloadEvent = (event: SystemThemeReloadEvent) => {
	if (SYSTEM_THEME_DEBUG_LOG_PATH === null) return
	const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`
	void appendFile(SYSTEM_THEME_DEBUG_LOG_PATH, line).catch(() => {})
}

const StartupLogo = ({ hint }: { readonly hint: string }) => {
	const startupRenderer = useRenderer()
	const { width, height } = useTerminalDimensions()
	const [frame, setFrame] = useState(0)

	useEffect(() => {
		startupRenderer.setBackgroundColor(colors.background)
	}, [startupRenderer])

	useEffect(() => {
		const interval = globalThis.setInterval(() => setFrame((current) => current + 1), SPINNER_INTERVAL_MS)
		return () => globalThis.clearInterval(interval)
	}, [])

	return (
		<box width={width} height={height} flexDirection="column" backgroundColor={colors.background}>
			<LoadingLogoPane content={{ hint }} width={width} height={height} frame={frame} />
		</box>
	)
}

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	screenMode: "alternate-screen",
	externalOutputMode: "passthrough",
	// Shift+Space is printable text under Kitty's default disambiguation mode.
	// Request all key events so native Ghostty and ghostty-web preserve its Shift.
	useKittyKeyboard: { allKeysAsEscapes: true },
	onDestroy: () => {
		process.stdout.write(EXTENDED_KEYS_DISABLE)
		process.stdout.write(FOCUS_REPORTING_DISABLE)
		setApplicationTitle("ghui")
		if (crashMessage) process.stderr.write(crashMessage)
		process.exit(crashMessage ? 1 : 0)
	},
})
process.stdout.write(EXTENDED_KEYS_ENABLE)

// Let editor-launch (and any future hand-off) suspend the renderer so an
// interactive subprocess (nvim, etc.) can own the terminal, then reacquire it.
setTuiSuspender({
	suspend: () => {
		process.stdout.write(EXTENDED_KEYS_DISABLE)
		process.stdout.write(FOCUS_REPORTING_DISABLE)
		renderer.suspend()
	},
	resume: () => {
		renderer.resume()
		refreshApplicationTitle()
		process.stdout.write(FOCUS_REPORTING_ENABLE)
		process.stdout.write(EXTENDED_KEYS_ENABLE)
		process.stdout.write(FULL_SCREEN_REPAINT)
		renderer.requestRender()
	},
})

const systemThemeReloader = createSystemThemeReloader({
	readPalette: (timeoutMs) => {
		renderer.clearPaletteCache()
		return renderer.getPalette({ timeout: timeoutMs, size: 16 })
	},
	applyColors: (terminalColors) => {
		setSystemThemeColors(terminalColors)
		renderer.setBackgroundColor(colors.background)
	},
	notify: () => notifySystemThemeReload(),
	isAutoReloadEnabled: () => Effect.runPromise(loadStoredSystemThemeAutoReload),
	setTimer: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
	delay: (ms) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms)),
	config: { readTimeoutMs: SYSTEM_THEME_READ_TIMEOUT_MS },
	onEvent: logReloadEvent,
})

void systemThemeReloader.primeBaseline().catch(() => {})

process.on("SIGUSR2", () => {
	systemThemeReloader.requestReload()
})

const Bootstrap = () => {
	const [appBundle, setAppBundle] = useState<AppBundle | null>(null)
	const [bootHint, setBootHint] = useState("Starting ghui")
	const [systemThemeGeneration, setSystemThemeGeneration] = useState(0)

	useEffect(() => {
		let cancelled = false
		notifySystemThemeReload = () => setSystemThemeGeneration((current) => current + 1)
		const timer = globalThis.setTimeout(() => {
			setBootHint("Registering syntax parsers")
			addGhUiParsers()

			setBootHint("Loading ghui app")
			void Promise.all([import("@effect/atom-react"), import("./App.js")]).then(
				([{ RegistryProvider }, { App }]) => {
					if (cancelled) return
					setBootHint("Mounting ghui app")
					setAppBundle({ RegistryProvider, App })
				},
				(error) => {
					if (cancelled) return
					setBootHint(errorMessage(error))
				},
			)
		}, 0)

		return () => {
			cancelled = true
			notifySystemThemeReload = () => {}
			globalThis.clearTimeout(timer)
		}
	}, [])

	if (appBundle) {
		const { RegistryProvider, App } = appBundle
		return (
			<RegistryProvider>
				<App systemThemeGeneration={systemThemeGeneration} />
			</RegistryProvider>
		)
	}

	return <StartupLogo hint={bootHint} />
}

process.stdout.write(FOCUS_REPORTING_ENABLE)
if (process.env.GHUI_FORCE_FULL_REPAINT_ON_START === "1") {
	process.stdout.write(FULL_SCREEN_REPAINT)
	renderer.requestRender()
}
globalThis.setTimeout(() => {
	if (process.platform !== "win32") process.kill(process.pid, "SIGWINCH")
	renderer.requestRender()
}, 0)

// OpenTUI's own boundary renders the error as text, which fails when the
// failure is native text-buffer exhaustion; React then unmounts everything and
// leaves a blank screen that ignores input. Log, restore the terminal, and exit.
const CRASH_LOG = join(homedir(), ".cache", "ghui", "crash.log")
let crashMessage: string | null = null

class CrashBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
	override state = { failed: false }

	static getDerivedStateFromError() {
		return { failed: true }
	}

	override componentDidCatch(error: unknown, info: ErrorInfo) {
		try {
			mkdirSync(dirname(CRASH_LOG), { recursive: true })
			appendFileSync(CRASH_LOG, `${new Date().toISOString()} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n${info.componentStack ?? ""}\n\n`)
		} catch {
			// A broken log file must not block the exit.
		}
		crashMessage = `ghui crashed: ${errorMessage(error)}\nDetails: ${CRASH_LOG}\n`
		globalThis.setTimeout(() => renderer.destroy(), 0)
	}

	override render() {
		return this.state.failed ? null : this.props.children
	}
}

createRoot(renderer).render(
	<CrashBoundary>
		<Bootstrap />
	</CrashBoundary>,
)
