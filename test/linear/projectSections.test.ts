import { expect, test } from "bun:test"
import * as R from "remeda"
import type { Project } from "../../src/linearWorkspace/linear/schema.ts"
import { projectRows } from "../../src/linearWorkspace/ui/ProjectList.tsx"
import { projectGroup } from "../../src/linearWorkspace/views.ts"

const project = (name: string, type: string, sortOrder: number): Project => ({ id: name, name, sortOrder, status: { name: type, type } })

test("team projects get a heading per status section and a note for hidden finished ones", () => {
	const sorted = R.sortBy(
		[project("backlog-b", "backlog", 2), project("started-b", "started", 5), project("paused", "paused", 1), project("planned", "planned", 0), project("backlog-a", "backlog", 1)],
		projectGroup,
		(p) => p.sortOrder ?? Number.MAX_SAFE_INTEGER,
	)
	const rows = projectRows(sorted, null, null, "none", undefined, undefined, { hiddenFinished: 3 })
	expect(rows.map((row) => (row.kind === "project" ? row.project.name : "text" in row ? row.text : row.kind))).toEqual([
		"In progress (2)",
		"paused",
		"started-b",
		"Planned (1)",
		"planned",
		"Backlog (2)",
		"backlog-a",
		"backlog-b",
		"3 completed or canceled hidden · F to show",
	])
	// Project rows keep their index into the list, so j/k by index still lands on them.
	expect(rows.flatMap((row) => (row.kind === "project" ? [row.index] : []))).toEqual([0, 1, 2, 3, 4])
})
