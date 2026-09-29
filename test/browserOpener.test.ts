import { describe, expect, test } from "bun:test"
import { isWebUrl } from "../src/services/BrowserOpener.ts"

describe("isWebUrl", () => {
	test("accepts http and https", () => {
		expect(isWebUrl("https://github.com/owner/repo/pull/1")).toBe(true)
		expect(isWebUrl("http://example.com")).toBe(true)
	})

	test("refuses local files, app schemes, flags, and garbage", () => {
		expect(isWebUrl("file:///Applications/Calculator.app")).toBe(false)
		expect(isWebUrl("x-apple.systempreferences:com.apple.preference.security")).toBe(false)
		expect(isWebUrl("javascript:alert(1)")).toBe(false)
		expect(isWebUrl("-a Terminal")).toBe(false)
		expect(isWebUrl("not a url")).toBe(false)
	})
})
