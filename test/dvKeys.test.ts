import { describe, expect, test } from "bun:test"
import { dvKeyCode, hostOwnsKey } from "../src/ui/diff/dvKeys.js"
import { DV_KEY } from "../src/ui/diff/dvNative.js"

const key = (name: string, sequence = name, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) => ({
	name,
	sequence,
	ctrl: mods.ctrl ?? false,
	meta: mods.meta ?? false,
	shift: mods.shift ?? false,
})

const dv = (wantsEscape: boolean, textInput: boolean) => ({ wantsEscape: () => wantsEscape, textInput: () => textInput })

describe("dvKeyCode", () => {
	test("maps special keys, shifted characters, and ctrl letters", () => {
		expect(dvKeyCode(key("return", "\r"))).toBe(DV_KEY.enter)
		expect(dvKeyCode(key("tab", "\x1b[Z", { shift: true }))).toBe(DV_KEY.backtab)
		expect(dvKeyCode(key("g", "G", { shift: true }))).toBe("G".codePointAt(0)!)
		expect(dvKeyCode(key("d", "\x04", { ctrl: true }))).toBe("d".codePointAt(0)!)
		expect(dvKeyCode(key("space", " "))).toBe(0x20)
		expect(dvKeyCode(key("f1", "\x1bOP"))).toBeNull()
	})
})

describe("hostOwnsKey", () => {
	test("GHUI keeps quit, palette, and review keys", () => {
		expect(hostOwnsKey(key("q"), dv(false, false))).toBe(true)
		expect(hostOwnsKey(key("p", "\x10", { ctrl: true }), dv(false, false))).toBe(true)
		expect(hostOwnsKey(key("r", "R", { shift: true }), dv(false, false))).toBe(true)
		expect(hostOwnsKey(key("j"), dv(false, false))).toBe(false)
		expect(hostOwnsKey(key("left", "\x1b[D"), dv(false, false))).toBe(true)
		expect(hostOwnsKey(key("right", "\x1b[C"), dv(false, false))).toBe(false)
	})

	test("Esc goes to dv while it has something to clear", () => {
		expect(hostOwnsKey(key("escape", "\x1b"), dv(true, false))).toBe(false)
		expect(hostOwnsKey(key("escape", "\x1b"), dv(false, false))).toBe(true)
	})

	test("an open search prompt gets every key", () => {
		expect(hostOwnsKey(key("q"), dv(true, true))).toBe(false)
		expect(hostOwnsKey(key("p", "\x10", { ctrl: true }), dv(true, true))).toBe(false)
	})
})
