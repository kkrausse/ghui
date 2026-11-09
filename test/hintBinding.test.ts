import { describe, expect, test } from "bun:test"
import { hintBinding } from "../src/ui/primitives.js"

describe("hintBinding", () => {
	test("maps hint labels to keymap bindings", () => {
		expect(hintBinding("d")).toBe("d")
		expect(hintBinding("/")).toBe("/")
		expect(hintBinding("esc")).toBe("escape")
		expect(hintBinding("↵")).toBe("return")
		expect(hintBinding("shift-enter")).toBe("shift+return")
		expect(hintBinding("ctrl-p")).toBe("ctrl+p")
		expect(hintBinding("R")).toBe("shift+r")
		expect(hintBinding("⇧F")).toBe("shift+f")
		expect(hintBinding("esc/←")).toBe("escape")
		expect(hintBinding("y/cmd-c")).toBe("y")
	})

	test("leaves non-key hints unclickable", () => {
		expect(hintBinding("↑↓")).toBeNull()
		expect(hintBinding("pgup/dn")).toBeNull()
		expect(hintBinding("[]")).toBeNull()
		expect(hintBinding("retry")).toBeNull()
		expect(hintBinding("⠏")).toBeNull()
	})
})
