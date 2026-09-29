/**
 * Validates every GraphQL document against Linear's real schema.
 *
 * The smoke test stubs responses, so it cannot catch a query the server would
 * reject. That gap shipped a bug: `sort` was passed to `Cycle.issues` and
 * `Project.issues`, which -- unlike the root `issues` query and
 * `CustomView.issues` -- do not accept it. Both views failed at runtime while
 * every test passed.
 *
 *   bun test linear-tui/queries.test.ts
 */
import { expect, test } from "bun:test"
import { buildSchema, parse, validate } from "graphql"
import * as Q from "../../src/linearWorkspace/linear/queries.ts"

const schemaPath = new URL("./linear.graphql", import.meta.url).pathname
const schema = buildSchema(await Bun.file(schemaPath).text(), { assumeValidSDL: true })

// The module also exports tuning constants (PAGE_SIZE); only the strings are documents.
const documents: [string, string][] = Object.entries(Q as Record<string, unknown>).flatMap(([name, doc]) => (typeof doc === "string" ? [[name, doc] as [string, string]] : []))

test("every exported document is a query or mutation, not a bare fragment", () => {
	expect(documents.length).toBeGreaterThan(0)
	for (const [name, doc] of documents) {
		expect(doc, name).toMatch(/\b(query|mutation)\s+\w+/)
	}
})

test.each(documents)("%s validates against Linear's schema", (name, doc) => {
	const errors = validate(schema, parse(doc))
	if (errors.length) {
		throw new Error(`${name}:\n${errors.map((e) => `  ${e.message}`).join("\n")}`)
	}
})

test("no nested issue connection is given a sort argument", () => {
	// Belt-and-braces: names the specific mistake so a regression reads clearly.
	for (const [name, doc] of documents) {
		const nested = /\b(cycle|project|team)\s*\([^)]*\)\s*\{[\s\S]*?issues\(([^)]*)\)/gi
		for (const match of doc.matchAll(nested)) {
			expect(match[1] ?? "", `${name} nested issues(...)`).not.toContain("sort")
		}
	}
})
