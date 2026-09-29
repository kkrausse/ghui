/**
 * The wheel over a list pane.
 *
 * These panes have no scroll offset of their own -- the window is derived from
 * where the cursor is (see `windowFor`) -- so scrolling one is moving its cursor,
 * which is exactly what j/k do. It also means the wheel inherits their paging:
 * reaching the bottom asks Linear for the next page.
 *
 * One row per event. A mouse notch is one event and a trackpad gesture is a
 * stream of them, which is the same rate the scrollboxes move at rest.
 *
 * The handler belongs on the pane's outer box: mouse events bubble, and the rows
 * inside listen only for clicks.
 */
import type { MouseEvent } from "@opentui/core"

export function wheel(move?: (delta: number) => void) {
	return (event: MouseEvent) => {
		if (!move) return
		if (event.scroll?.direction === "up") move(-1)
		else if (event.scroll?.direction === "down") move(1)
	}
}
