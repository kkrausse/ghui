import { globalCommands } from "./builtins.js"
import { linearCommands } from "./linear.js"
import * as Atom from "effect/unstable/reactivity/Atom"
import { workspaceSurfaceAtom } from "../workspace/atoms.js"
import type { CommandDefinition } from "./registry.js"

// Single command registry for host and surface-specific actions. Shared commands
// remain available in Linear; GitHub commands must not operate on stale selections.

const sharedCommand = (command: CommandDefinition) => command.id.startsWith("workspace.") || ["command.open", "theme.open", "app.quit"].includes(command.id)
const surfaceCommands = globalCommands.map(
	(command): CommandDefinition =>
		sharedCommand(command)
			? command
			: {
					...command,
					when: Atom.make((get) => get(workspaceSurfaceAtom) !== "linear" && (!command.when || get(command.when))),
				},
)

export const allCommands: readonly CommandDefinition[] = [...surfaceCommands, ...linearCommands]

export const commandsById: ReadonlyMap<string, CommandDefinition> = new Map(allCommands.map((command) => [command.id, command]))
