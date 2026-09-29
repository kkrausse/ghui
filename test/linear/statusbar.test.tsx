/**
 * Status bar fitting.
 *
 * At 80 columns the hint row used to render every key and let flex squeeze the
 * children, which collided into unreadable runs like "moveopen statuassignprio".
 */
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import { StatusBar } from "../../src/linearWorkspace/ui/StatusBar.tsx"

async function render(width: number) {
	const setup = await testRender(<StatusBar flash={null} who="robin.shelley" width={width} />, { width, height: 3 })
	await setup.flush()
	const frame = setup.captureCharFrame()
	setup.renderer.destroy()
	return frame
}

test("hints stay readable at 80 columns", async () => {
	const frame = await render(80)

	// Labels must appear intact, not fused with the next hint.
	expect(frame).toContain("j/k:move")
	expect(frame).not.toContain("moveopen")
	expect(frame).not.toContain("statuassign")
	expect(frame).toContain("robin.shelley")

	for (const line of frame.split("\n")) {
		expect(line.length).toBeLessThanOrEqual(80)
	}
})

test("a narrow terminal drops trailing hints rather than mangling them", async () => {
	const narrow = await render(40)
	const wide = await render(200)

	expect(narrow).toContain("j/k:move")
	expect(narrow).toContain("robin.shelley")
	// "quit" is last in the list, so it survives only when there is room.
	expect(narrow).not.toContain("quit")
	expect(wide).toContain("quit")
})

test("a flash message replaces the hints", async () => {
	const setup = await testRender(<StatusBar flash="copied robin/backend-1361" who="robin.shelley" width={80} />, { width: 80, height: 3 })
	await setup.flush()
	const frame = setup.captureCharFrame()
	expect(frame).toContain("copied robin/backend-1361")
	expect(frame).not.toContain("j/k:move")
	setup.renderer.destroy()
})
