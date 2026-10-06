import { beforeAll, describe, expect, test } from "bun:test"
import { act } from "react"

// App-side modules select their runtime once per test process. Keep this in
// sync with scrolling.test.tsx so file execution order cannot change either
// suite's fixture shape on CI.
process.env.GHUI_MOCK_PR_COUNT = "80"
process.env.GHUI_MOCK_REPO_COUNT = "4"
process.env.GHUI_MOCK_FIXTURE_PATH = "/var/folders/dd/5fz89drs5p9_r0fk7rwqqnbr0000gn/T/opencode/ghui-test-no-fixture.json"
process.env.GHUI_MOCK_WORKSPACE_PREFERENCES_PATH = "off"
process.env.GHUI_PR_PAGE_SIZE = "100"

const loadApp = async () => {
	const { createTestRenderer } = await import("@opentui/core/testing")
	const { createRoot } = await import("@opentui/react")
	const { RegistryContext } = await import("@effect/atom-react")
	const { App } = await import("../src/App.tsx")
	return { createTestRenderer, createRoot, RegistryContext, App }
}

let cached: Awaited<ReturnType<typeof loadApp>>

beforeAll(async () => {
	// @ts-expect-error -- React's act environment flag is intentionally global.
	globalThis.IS_REACT_ACT_ENVIRONMENT = true
	cached = await loadApp()
})

const stepFrame = async (renderOnce: () => Promise<void>, delay = 1) => {
	await act(async () => {
		await renderOnce()
		await new Promise<void>((resolve) => setTimeout(resolve, delay))
	})
}

const settle = async (renderOnce: () => Promise<void>, predicate: () => boolean, attempts = 80) => {
	for (let i = 0; i < attempts; i++) {
		await stepFrame(renderOnce)
		if (predicate()) return true
	}
	return false
}

const setupApp = async (width: number, height: number) => {
	const { AtomRegistry } = await import("effect/unstable/reactivity")
	const registry = AtomRegistry.make()
	const setup = await cached.createTestRenderer({ width, height })
	const root = cached.createRoot(setup.renderer)
	act(() => {
		root.render(
			<cached.RegistryContext.Provider value={registry}>
				<cached.App />
			</cached.RegistryContext.Provider>,
		)
	})
	await stepFrame(setup.renderOnce)
	return { ...setup, root, registry }
}

const cleanup = (setup: Awaited<ReturnType<typeof setupApp>>) => {
	act(() => setup.root.unmount())
	setup.renderer.destroy()
	setup.registry.dispose()
}

describe("small terminal fallback", () => {
	test("Linear uses the shared palette for PR expansion and isolates palette input", async () => {
		const { installLinearStub, requests } = await import("./linear/stub.tsx")
		const { invalidateCache } = await import("../src/linearWorkspace/linear/client.ts")
		const { workspaceSurfaceAtom } = await import("../src/workspace/atoms.ts")
		const { commandSnapshotsAtom } = await import("../src/commands/atoms.ts")
		const token = process.env.LINEAR_API_TOKEN
		const restore = installLinearStub()
		invalidateCache()
		const setup = await setupApp(140, 42)
		const palette = async (query: string, useMeta = false) => {
			act(() => setup.mockInput.pressKey(useMeta ? "k" : "p", useMeta ? { meta: true } : { ctrl: true }))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Commands"))).toBe(true)
			await act(async () => {
				await setup.mockInput.typeText(query)
			})
			await stepFrame(setup.renderOnce)
		}
		try {
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("LINEAR"))).toBe(true)
			act(() => setup.mockInput.pressKey("1"))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("BACKEND-1361"), 300)).toBe(true)
			const commands = setup.registry.get(commandSnapshotsAtom)
			expect(commands.some((c) => c.id === "linear.expandAllPrs" && !c.disabledReason)).toBe(true)
			expect(commands.some((c) => c.id === "pull.copy-url" || c.id === "filter.open")).toBe(false)
			const requestCount = requests.length
			await palette("Expand all linked PR")
			expect(setup.captureCharFrame()).toContain("Linear: Expand all linked PR")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			act(() => setup.mockInput.pressEnter())
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes(" #783  ") && !setup.captureCharFrame().includes("Commands"))).toBe(true)
			expect(setup.captureCharFrame()).toContain(" #575  ")
			expect(requests.length).toBe(requestCount)

			await palette("Collapse all linked PR", true)
			act(() => setup.mockInput.pressEnter())
			expect(await settle(setup.renderOnce, () => !setup.captureCharFrame().includes(" #783  ") && !setup.captureCharFrame().includes("Commands"))).toBe(true)
			// Numeric input and Linear edit keys in the palette must not escape it.
			await palette("2 status")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			act(() => setup.mockInput.pressEscape())
			expect(await settle(setup.renderOnce, () => !setup.captureCharFrame().includes("Commands"))).toBe(true)
			await stepFrame(setup.renderOnce, 40)
			act(() => setup.mockInput.pressKey("/"))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("text to search across every issue"))).toBe(true)
			act(() => setup.mockInput.pressKey("p", { ctrl: true }))
			await stepFrame(setup.renderOnce)
			expect(setup.captureCharFrame()).not.toContain("Commands")
			expect(requests.some((r) => r.query.includes("mutation"))).toBe(false)
		} finally {
			cleanup(setup)
			restore()
			if (token === undefined) delete process.env.LINEAR_API_TOKEN
			else process.env.LINEAR_API_TOKEN = token
		}
	})

	test("Linear PR child opens exact entity, nested views back to PR, then back to retained row", async () => {
		const { installLinearStub, requests } = await import("./linear/stub.tsx")
		const { invalidateCache } = await import("../src/linearWorkspace/linear/client.ts")
		const { selectedPullRequestAtom } = await import("../src/ui/pullRequests/atoms.ts")
		const { linearPullRequestAtom } = await import("../src/ui/pullRequests/linkedSelection.ts")
		const { workspaceSurfaceAtom } = await import("../src/workspace/atoms.ts")
		const { detailFullViewAtom } = await import("../src/ui/detail/atoms.ts")
		const { diffFullViewAtom } = await import("../src/ui/diff/atoms.ts")
		const { runsFullViewAtom } = await import("../src/ui/runs/atoms.ts")
		const { commentsViewActiveAtom } = await import("../src/ui/comments/atoms.ts")
		const token = process.env.LINEAR_API_TOKEN
		const restore = installLinearStub()
		const requestStart = requests.length
		invalidateCache()
		const setup = await setupApp(140, 42)
		const press = async (key: string) => {
			act(() => setup.mockInput.pressKey(key))
			await stepFrame(setup.renderOnce)
		}
		const arrow = async (direction: "left" | "right" | "down") => {
			act(() => setup.mockInput.pressArrow(direction))
			await stepFrame(setup.renderOnce)
		}
		try {
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("LINEAR"))).toBe(true)
			await press("1")
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("BACKEND-1361"), 300)).toBe(true)
			await arrow("right")
			await press(" ")
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes(" #783  "))).toBe(true)
			await arrow("down")
			await arrow("down")
			await arrow("right")
			expect(await settle(setup.renderOnce, () => setup.registry.get(workspaceSurfaceAtom) === "pullRequests")).toBe(true)
			expect(setup.registry.get(selectedPullRequestAtom)?.url).toBe("https://github.com/acme/data-warehouse-pipeline/pull/783")
			// This PR is not in any mock open queue; selecting by queue index cannot pass.
			expect(setup.registry.get(detailFullViewAtom)).toBe(true)
			await arrow("right")
			expect(setup.registry.get(diffFullViewAtom)).toBe(true)
			await arrow("left")
			expect(setup.registry.get(diffFullViewAtom)).toBe(false)
			expect(setup.registry.get(detailFullViewAtom)).toBe(true)
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("pullRequests")
			await press("c")
			expect(setup.registry.get(commentsViewActiveAtom)).toBe(true)
			await arrow("left")
			expect(setup.registry.get(detailFullViewAtom)).toBe(true)
			await press("a")
			expect(setup.registry.get(runsFullViewAtom)).toBe(true)
			await arrow("left")
			expect(setup.registry.get(detailFullViewAtom)).toBe(true)
			await arrow("left")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			expect(setup.registry.get(linearPullRequestAtom)).toBeNull()
			expect(setup.captureCharFrame()).toContain(" #783  ")
			// Opening again without moving proves the same child stayed selected.
			act(() => setup.mockInput.pressEnter())
			expect(await settle(setup.renderOnce, () => setup.registry.get(workspaceSurfaceAtom) === "pullRequests")).toBe(true)
			expect(setup.registry.get(selectedPullRequestAtom)?.number).toBe(783)
			await arrow("left")
			await press(" ") // collapse while a child is selected -> its own parent
			expect(setup.captureCharFrame()).not.toContain(" #783  ")
			act(() => setup.mockInput.pressEnter())
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Branch"))).toBe(true)
			await press("O")
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Open · BACKEND-1361"))).toBe(true)
			await arrow("down")
			act(() => setup.mockInput.pressEnter())
			expect(await settle(setup.renderOnce, () => setup.registry.get(workspaceSurfaceAtom) === "pullRequests")).toBe(true)
			expect(setup.registry.get(selectedPullRequestAtom)?.number).toBe(783)
			await arrow("left")
			expect(setup.captureCharFrame()).toContain("Branch") // detail origin, not just list origin
			expect(requests.slice(requestStart).some((r) => r.query.includes("mutation"))).toBe(false)
		} finally {
			cleanup(setup)
			restore()
			if (token === undefined) delete process.env.LINEAR_API_TOKEN
			else process.env.LINEAR_API_TOKEN = token
		}
	})

	test("host numeric tabs work in Linear but leave search, composer and picker digits alone", async () => {
		const { installLinearStub } = await import("./linear/stub.tsx")
		const { invalidateCache } = await import("../src/linearWorkspace/linear/client.ts")
		const { workspaceSurfaceAtom } = await import("../src/workspace/atoms.ts")
		const token = process.env.LINEAR_API_TOKEN
		const restore = installLinearStub()
		invalidateCache()
		const setup = await setupApp(140, 42)
		const press = async (key: string) => {
			act(() => setup.mockInput.pressKey(key))
			await stepFrame(setup.renderOnce)
		}
		const escape = async () => {
			act(() => setup.mockInput.pressEscape())
			await stepFrame(setup.renderOnce, 40)
			await stepFrame(setup.renderOnce)
		}
		try {
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("LINEAR"))).toBe(true)
			await press("1")
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("BACKEND-1361"), 300)).toBe(true)
			await press("2")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("pullRequests")
			await press("1")
			act(() => {
				setup.mockInput.pressKey("/")
				setup.mockInput.pressKey("2")
			})
			await stepFrame(setup.renderOnce)
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			await press("2") // mounted text field owns digits, including this one
			expect(setup.captureCharFrame()).toContain("/ 2")
			await escape()
			await press("c")
			await press("3")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			await escape()
			await press("O")
			await press("4")
			expect(setup.registry.get(workspaceSurfaceAtom)).toBe("linear")
			expect(setup.captureCharFrame()).toContain("Open · BACKEND-1361")
			await escape()
			await press("4")
			expect(setup.registry.get(workspaceSurfaceAtom)).not.toBe("linear")
		} finally {
			cleanup(setup)
			restore()
			if (token === undefined) delete process.env.LINEAR_API_TOKEN
			else process.env.LINEAR_API_TOKEN = token
		}
	})

	test("hosts Linear natively, isolates keys, and retains its detail across tabs and resize", async () => {
		const { installLinearStub, requests } = await import("./linear/stub.tsx")
		const { invalidateCache } = await import("../src/linearWorkspace/linear/client.ts")
		const token = process.env.LINEAR_API_TOKEN
		const restore = installLinearStub()
		invalidateCache()
		const start = requests.length
		const setup = await setupApp(140, 42)
		try {
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("LINEAR"))).toBe(true)
			expect(requests.length).toBe(start) // no Linear auth/query before visiting
			act(() => setup.mockInput.pressKey("1"))
			const linearLoaded = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("BACKEND-1361"), 300)
			expect(linearLoaded, setup.captureCharFrame()).toBe(true)
			expect(setup.captureCharFrame()).toContain("BACKEND-1361")
			act(() => setup.mockInput.pressArrow("right"))
			await stepFrame(setup.renderOnce)
			act(() => setup.mockInput.pressEnter())
			const detailOpened = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Branch"))
			expect(detailOpened, setup.captureCharFrame()).toBe(true)
			const bootstrapCount = requests.filter((r) => r.query.includes("query Bootstrap")).length

			act(() => setup.mockInput.pressArrow("right", { ctrl: true }))
			expect(await settle(setup.renderOnce, () => !setup.captureCharFrame().includes("Branch"))).toBe(true)
			expect(setup.captureCharFrame()).not.toContain("BACKEND-1361")
			act(() => setup.mockInput.pressArrow("left", { ctrl: true }))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Branch"))).toBe(true)
			expect(requests.filter((r) => r.query.includes("query Bootstrap")).length).toBe(bootstrapCount)

			act(() => setup.resize(59, 15))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Terminal too small"))).toBe(true)
			act(() => setup.mockInput.pressEscape())
			await stepFrame(setup.renderOnce)
			act(() => setup.resize(140, 42))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Branch"))).toBe(true)

			act(() => setup.mockInput.pressEscape())
			expect(await settle(setup.renderOnce, () => !setup.captureCharFrame().includes("Branch"))).toBe(true)
			act(() => setup.mockInput.pressKey("/"))
			expect(await settle(setup.renderOnce, () => setup.captureCharFrame().includes("text to search across every issue"))).toBe(true)
			act(() => setup.mockInput.pressArrow("right", { ctrl: true }))
			await stepFrame(setup.renderOnce)
			expect(setup.captureCharFrame()).toContain("text to search across every issue")
		} finally {
			cleanup(setup)
			restore()
			if (token === undefined) delete process.env.LINEAR_API_TOKEN
			else process.env.LINEAR_API_TOKEN = token
		}
	})

	test("captures only the fitted fallback at 59x16", async () => {
		const setup = await setupApp(59, 16)
		const frame = setup.captureCharFrame()
		expect(frame).toContain("Terminal too small")
		expect(frame).toContain("Need 60x16; current 59x16")
		expect(frame).toContain("Resize to continue")
		expect(frame).not.toContain("MY PRS")
		expect(setup.captureSpans()).toMatchObject({ cols: 59, rows: 16 })
		cleanup(setup)
	})

	test("fits without crashing in a pathological 4x2 frame", async () => {
		const setup = await setupApp(4, 2)
		expect(setup.captureSpans()).toMatchObject({ cols: 4, rows: 2 })
		cleanup(setup)
	})

	test("freezes modal input and restores mounted state after an async resize round trip", async () => {
		const setup = await setupApp(100, 20)
		const loaded = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("MY PRS"))
		expect(loaded, setup.captureCharFrame()).toBe(true)

		act(() => setup.mockInput.pressKey("p", { ctrl: true }))
		const modalOpen = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Commands"))
		expect(modalOpen, setup.captureCharFrame()).toBe(true)
		expect(setup.captureCharFrame()).toContain("26 commands")

		act(() => setup.resize(59, 15))
		const fallbackVisible = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Terminal too small"))
		expect(fallbackVisible, setup.captureCharFrame()).toBe(true)

		act(() => {
			setup.mockInput.pressEscape()
			setup.mockInput.pressKey("x")
		})
		await stepFrame(setup.renderOnce)

		act(() => setup.resize(100, 20))
		const modalRestored = await settle(setup.renderOnce, () => setup.captureCharFrame().includes("Commands"))
		expect(modalRestored, setup.captureCharFrame()).toBe(true)
		expect(setup.captureCharFrame()).toContain("26 commands")
		cleanup(setup)
	})
})
