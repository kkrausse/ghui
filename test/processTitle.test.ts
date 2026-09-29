import { describe, expect, test } from "bun:test"
import { processTitleFor, terminalTitleSequence } from "../src/processTitle.ts"

describe("processTitleFor", () => {
	test("uses ghui outside a repository workspace", () => {
		expect(processTitleFor({ repository: null, pullRequest: null, pullRequestFocused: false })).toBe("ghui")
	})

	test("includes the repository while browsing a repository workspace", () => {
		expect(processTitleFor({ repository: "owner/repo", pullRequest: null, pullRequestFocused: false })).toBe("ghui — owner/repo")
	})

	test("includes the pull request when a PR-focused view is active", () => {
		expect(
			processTitleFor({
				repository: "owner/repo",
				pullRequest: { repository: "owner/repo", number: 42 },
				pullRequestFocused: true,
			}),
		).toBe("ghui — owner/repo #42")
	})

	test("does not change with list selection alone", () => {
		expect(
			processTitleFor({
				repository: null,
				pullRequest: { repository: "owner/repo", number: 42 },
				pullRequestFocused: false,
			}),
		).toBe("ghui")
	})

	test("emits a sanitized terminal title sequence", () => {
		expect(terminalTitleSequence("ghui — owner/repo\u0007 #42")).toBe("\x1b]0;ghui — owner/repo #42\x07")
	})
})
