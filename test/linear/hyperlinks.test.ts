import { describe, expect, test } from "bun:test"
import { hasHyperlinksFeature, tmuxClientHasHyperlinks } from "../../src/linearWorkspace/hyperlinks.ts"

describe("hasHyperlinksFeature", () => {
	test("matches the tmux client_termfeatures list", () => {
		expect(hasHyperlinksFeature("bpaste,ccolour,clipboard,hyperlinks,cstyle,focus,RGB,title\n")).toBe(true)
		expect(hasHyperlinksFeature("clipboard,RGB,title")).toBe(false)
		expect(hasHyperlinksFeature("")).toBe(false)
	})
})

describe("tmuxClientHasHyperlinks", () => {
	test("is false outside tmux without spawning anything", () => {
		expect(tmuxClientHasHyperlinks({ PATH: process.env.PATH })).toBe(false)
	})
})
