/**
 * Window title, and above all the undo.
 *
 * A rename left behind outlives the process: the window reads `linear` for the
 * rest of the session, and a window that had a name someone typed has lost it.
 *
 *   bun test linear-tui/title.test.ts
 */
import { expect, test } from "bun:test"
import { claimWindowTitle, type Tmux } from "../../src/linearWorkspace/title.ts"

/** Records the calls and answers `display-message` from the given window state. */
function fakeTmux(state: { auto: string; name: string }): { tmux: Tmux; calls: string[][] } {
	const calls: string[][] = []
	const tmux: Tmux = (args) => {
		calls.push(args)
		if (args[0] !== "display-message") return ""
		return args[args.length - 1] === "#{automatic-rename}" ? state.auto : state.name
	}
	return { tmux, calls }
}

const IN_TMUX = { TMUX: "/tmp/tmux-502/default,123,0", TMUX_PANE: "%7" }

function run(env: Record<string, string | undefined>, state = { auto: "1", name: "zsh" }) {
	const written: string[] = []
	const { tmux, calls } = fakeTmux(state)
	const release = claimWindowTitle({ env, write: (s) => written.push(s), tmux })
	return { written, calls, release }
}

test("the terminal gets an OSC-2 title either way", () => {
	expect(run({}).written).toEqual(["\x1b]2;linear\x07"])
	expect(run(IN_TMUX).written).toEqual(["\x1b]2;linear\x07"])
})

test("outside tmux nothing is spawned and the undo is a no-op", () => {
	const { calls, release } = run({})
	release()
	expect(calls).toEqual([])
})

test("in tmux the window is renamed, and automatic renaming re-armed on the way out", () => {
	const { calls, release } = run(IN_TMUX, { auto: "1", name: "zsh" })
	expect(calls).toContainEqual(["rename-window", "-t", "%7", "linear"])

	release()
	// Unsetting the option is the restore: the name recomputes from the pane's
	// command, which by then is the shell again.
	expect(calls.at(-1)).toEqual(["set-window-option", "-t", "%7", "-u", "automatic-rename"])
})

test("a window someone named by hand gets that name back, not automatic renaming", () => {
	const { calls, release } = run(IN_TMUX, { auto: "0", name: "notes" })
	release()

	expect(calls.at(-1)).toEqual(["rename-window", "-t", "%7", "notes"])
	expect(calls.some(([c]) => c === "set-window-option")).toBe(false)
})

test("$TMUX set with no reachable server renames nothing", () => {
	const calls: string[][] = []
	const release = claimWindowTitle({
		env: IN_TMUX,
		write: () => {},
		tmux: (args) => {
			calls.push(args)
			return null
		},
	})
	release()

	expect(calls).toEqual([["display-message", "-t", "%7", "-p", "#{automatic-rename}"]])
})
