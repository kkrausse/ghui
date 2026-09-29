import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { GROUP_BY, type GroupBy, type Target } from "./views.ts"

export type GroupPreferences = Record<string, GroupBy>

const path = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "linear-tui", "preferences.json")

export function groupingKey(target: Target | null, searching: boolean): string {
	if (searching) return "search"
	if (!target) return "my-issues"
	switch (target.kind) {
		case "team":
			return `team:${target.team.id}`
		case "cycle":
			return `cycle:${target.cycle.id}`
		case "projects":
			return `projects:${target.team.id}`
		case "project":
			return `project:${target.project.id}`
		case "custom":
			return `custom:${target.id}`
		default:
			return target.kind
	}
}

export function readGroupPreferences(file = path()): GroupPreferences {
	try {
		const data: unknown = JSON.parse(readFileSync(file, "utf8"))
		if (!data || typeof data !== "object" || Array.isArray(data)) return {}
		return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, GroupBy] => typeof entry[1] === "string" && GROUP_BY.includes(entry[1] as GroupBy)))
	} catch {
		return {}
	}
}

export function writeGroupPreferences(groups: GroupPreferences, file = path()): void {
	mkdirSync(dirname(file), { recursive: true })
	const temporary = `${file}.${process.pid}.tmp`
	writeFileSync(temporary, `${JSON.stringify(groups, null, 2)}\n`, { mode: 0o600 })
	renameSync(temporary, file)
}
