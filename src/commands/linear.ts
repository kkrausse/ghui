import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { linearActionDefinitions, type LinearAction } from "../linearWorkspace/commandActions.js"
import { workspaceSurfaceAtom } from "../workspace/atoms.js"
import { invokeHandoff } from "./handoffs.js"
import { defineCommand } from "./registry.js"

export const linearAvailableActionsAtom = Atom.make<readonly LinearAction[]>([])
const linearSurfaceAtom = Atom.make((get) => get(workspaceSurfaceAtom) === "linear")

export const linearCommands = linearActionDefinitions.map((definition) =>
	defineCommand({
		id: `linear.${definition.action}`,
		title: definition.title,
		scope: definition.scope,
		...("shortcut" in definition ? { shortcut: definition.shortcut } : {}),
		keywords: ["linear", definition.action, "issue", "ticket"],
		when: linearSurfaceAtom,
		disabledReason: Atom.make((get) =>
			get(linearSurfaceAtom) && get(linearAvailableActionsAtom).includes(definition.action) ? null : "Not available in the current Linear view.",
		),
		run: Effect.sync(() => invokeHandoff(`linear.${definition.action}`)),
	}),
)
