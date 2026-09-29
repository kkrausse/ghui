/**
 * Sidebar windowing and mouse targets.
 *
 * The overflow bug this covers: the sidebar rendered every entry and took its
 * spacing from `marginTop`, so on a short terminal with several teams the rows
 * ran past the bottom border.
 */
import { testRender } from "@opentui/react/test-utils"
import { expect, test } from "bun:test"
import type { Nav } from "../../src/linearWorkspace/views.ts"
import { Sidebar } from "../../src/linearWorkspace/ui/Sidebar.tsx"

/** Six teams x (header + all issues + cycle + projects) -- well past a short terminal. */
function manyItems(): Nav[] {
	const items: Nav[] = [{ kind: "header", label: "MINE" }, { kind: "my-issues" }]
	for (let t = 0; t < 6; t++) {
		const team = { id: `t${t}`, key: `TEAM${t}`, name: `Team ${t}`, activeCycle: null }
		items.push({ kind: "header", label: team.key })
		items.push({ kind: "team", team })
		items.push({
			kind: "cycle",
			team,
			cycle: {
				id: `c${t}`,
				number: t,
				name: `Sprint ${t}`,
				startsAt: null,
				endsAt: null,
				progress: 0.5,
			},
		})
		items.push({ kind: "projects", team })
	}
	return items
}

const HEIGHT = 14

async function render(items: Nav[], selected: number) {
	const setup = await testRender(<Sidebar items={items} selected={selected} focused width={26} height={HEIGHT} onPick={() => {}} />, { width: 40, height: HEIGHT })
	await setup.flush()
	return setup
}

test("does not draw past the bottom border", async () => {
	const items = manyItems()
	const setup = await render(items, 1)
	const frame = setup.captureCharFrame()
	const lines = frame.split("\n").filter((l) => l.trim().length)

	expect(lines.length).toBeLessThanOrEqual(HEIGHT)

	// The precise symptom: content pushed the bottom border off-screen. The last
	// drawn line must still be that border, and the first the top one.
	expect(lines[0]).toContain("┌")
	expect(lines.at(-1)).toContain("└")

	// No entry text may appear on the border rows.
	expect(lines[0]).not.toContain("My Issues")
	expect(lines.at(-1)).not.toContain("Projects")

	setup.renderer.destroy()
})

test("keeps the selected entry visible when it is far down the list", async () => {
	const items = manyItems()
	const lastIndex = items.length - 1 // TEAM5 > Projects
	const setup = await render(items, lastIndex)
	const frame = setup.captureCharFrame()

	expect(frame).toContain("TEAM5")
	expect(frame).toContain("Projects")
	// The top of the list has scrolled away rather than overflowing.
	expect(frame).not.toContain("My Issues")
	expect(frame).toContain("↑") // scroll indicator

	setup.renderer.destroy()
})

test("clicking an entry reports that entry's index", async () => {
	const items = manyItems()
	const picked: number[] = []
	const setup = await testRender(<Sidebar items={items} selected={1} focused width={26} height={HEIGHT} onPick={(i) => picked.push(i)} />, { width: 40, height: HEIGHT })
	await setup.flush()

	// Row 0 is the border, row 1 the "MINE" header, row 2 the "My Issues" entry.
	const frame = setup.captureCharFrame()
	const rowOfMyIssues = frame.split("\n").findIndex((l) => l.includes("My Issues"))
	expect(rowOfMyIssues).toBeGreaterThan(0)

	await setup.mockMouse.click(4, rowOfMyIssues)
	await setup.flush()

	expect(picked).toEqual([1]) // index 1 == the my-issues entry
	setup.renderer.destroy()
})
