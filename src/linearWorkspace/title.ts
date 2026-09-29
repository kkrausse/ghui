/**
 * The window title, so the tab reads `linear` rather than `bun`.
 *
 * Outside tmux the OSC-2 write is the whole of it. Inside, two tmux defaults get
 * in the way: `allow-rename off` means OSC 2 never reaches the window name, and
 * `automatic-rename-format` is the pane's command, which is `bun`. So the window
 * has to be renamed outright -- and the rename undone on the way out, or the
 * window keeps the name long after the app is gone.
 */

export const TITLE = "linear"

/** A `tmux` shell-out. Returns null when the command fails. Injectable for tests. */
export type Tmux = (args: string[]) => string | null

const spawnTmux: Tmux = (args) => {
	const r = Bun.spawnSync(["tmux", ...args], { stdout: "pipe", stderr: "ignore" })
	return r.success ? r.stdout.toString().trim() : null
}

type Deps = {
	env?: Record<string, string | undefined>
	write?: (s: string) => void
	tmux?: Tmux
}

/** Sets the title and returns the undo, to be run before the process leaves. */
export function claimWindowTitle({ env = process.env, write = (s) => void process.stdout.write(s), tmux = spawnTmux }: Deps = {}): () => void {
	write(`\x1b]2;${TITLE}\x07`)

	const pane = env.TMUX_PANE
	if (!env.TMUX || !pane) return () => {}

	// "0" means the window carries a name someone typed. `rename-window` sets that
	// flag itself, so undoing needs what it was before, not what it is after.
	const auto = tmux(["display-message", "-t", pane, "-p", "#{automatic-rename}"])
	if (auto === null) return () => {} // $TMUX set with no reachable server
	const previous = tmux(["display-message", "-t", pane, "-p", "#{window_name}"])
	tmux(["rename-window", "-t", pane, TITLE])

	return () => {
		// Unsetting the option is what re-arms automatic renaming; the name then
		// snaps back to the pane's command on its own.
		if (auto === "1") tmux(["set-window-option", "-t", pane, "-u", "automatic-rename"])
		else if (previous) tmux(["rename-window", "-t", pane, previous])
	}
}
