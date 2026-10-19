import { dlopen, FFIType, type Pointer, toArrayBuffer } from "bun:ffi"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Binding to libdv, the Rust diff viewer (kkrausse/dv) built as a C library. dv
 * owns the diff pane's state and drawing; GHUI forwards input, draws the styled
 * runs it returns, and handles the comment/reply requests it emits.
 *
 * Library: `GHUI_DV_LIB`, else `~/.local/lib/libdv.{dylib,so}` (not under
 * `bun test`, whose diff tests target the built-in pane). Without it the built-in
 * diff pane is used.
 */

const symbols = {
	dv_create: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
	dv_destroy: { args: [FFIType.ptr], returns: FFIType.void },
	dv_key: { args: [FFIType.ptr, FFIType.u32, FFIType.u32], returns: FFIType.u32 },
	dv_mouse: { args: [FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.u32 },
	dv_poll: { args: [FFIType.ptr], returns: FFIType.u32 },
	dv_state: { args: [FFIType.ptr], returns: FFIType.u32 },
	dv_set_comments: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
	dv_set_source: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.u32], returns: FFIType.u32 },
	dv_render: { args: [FFIType.ptr, FFIType.u32, FFIType.u32], returns: FFIType.u32 },
	dv_frame_ptr: { args: [FFIType.ptr], returns: FFIType.ptr },
	dv_take_action: { args: [FFIType.ptr], returns: FFIType.u32 },
	dv_action_ptr: { args: [FFIType.ptr], returns: FFIType.ptr },
} as const

type DvLib = ReturnType<typeof dlopen<typeof symbols>>["symbols"]

const libraryPath = () => {
	const explicit = process.env.GHUI_DV_LIB?.trim()
	if (explicit) return existsSync(explicit) ? explicit : null
	if (process.env.NODE_ENV === "test") return null
	const ext = process.platform === "darwin" ? "dylib" : "so"
	const path = join(homedir(), ".local", "lib", `libdv.${ext}`)
	return existsSync(path) ? path : null
}

let loaded: DvLib | null | undefined

const lib = (): DvLib | null => {
	if (loaded !== undefined) return loaded
	const path = libraryPath()
	try {
		loaded = path ? dlopen(path, symbols).symbols : null
	} catch {
		loaded = null
	}
	return loaded
}

export const dvAvailable = () => lib() !== null

// Input/poll result bits.
export const DV_REDRAW = 1
export const DV_ACTION = 2
export const DV_PENDING = 4

export const DV_KEY = {
	enter: 0x110000,
	escape: 0x110001,
	tab: 0x110002,
	backspace: 0x110003,
	up: 0x110004,
	down: 0x110005,
	left: 0x110006,
	right: 0x110007,
	pageup: 0x110008,
	pagedown: 0x110009,
	home: 0x11000a,
	end: 0x11000b,
	delete: 0x11000c,
	backtab: 0x11000d,
} as const

export type DvMouseKind = "down" | "up" | "drag" | "move" | "scroll-up" | "scroll-down" | "scroll-left" | "scroll-right"
const mouseKinds: Record<DvMouseKind, number> = {
	down: 0,
	up: 1,
	drag: 2,
	move: 3,
	"scroll-up": 4,
	"scroll-down": 5,
	"scroll-left": 6,
	"scroll-right": 7,
}

export interface DvMods {
	readonly ctrl: boolean
	readonly shift: boolean
	readonly alt: boolean
}

const modBits = (m: DvMods) => (m.ctrl ? 1 : 0) | (m.shift ? 2 : 0) | (m.alt ? 4 : 0)

export interface DvRun {
	readonly x: number
	readonly y: number
	/** 0xRRGGBBAA; 0 means the host default. */
	readonly fg: number
	readonly bg: number
	readonly attrs: number
	readonly text: string
}

export type DvAction =
	| {
			readonly type: "comment" | "link"
			readonly path: string
			readonly line: number
			readonly side: "LEFT" | "RIGHT"
			readonly startLine?: number
			readonly startSide?: "LEFT" | "RIGHT"
	  }
	| { readonly type: "reply"; readonly inReplyTo: string; readonly path: string; readonly line: number }
	| { readonly type: "source"; readonly file: number; readonly path: string }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class DvView {
	private constructor(
		private readonly lib: DvLib,
		private handle: Pointer | null,
	) {}

	static create(patch: string, options: { readonly title: string; readonly repoDir: string | null }): DvView | null {
		const l = lib()
		if (!l) return null
		const patchBytes = encoder.encode(patch)
		const optionBytes = encoder.encode(JSON.stringify(options))
		const handle = l.dv_create(patchBytes, patchBytes.length, optionBytes, optionBytes.length)
		return handle ? new DvView(l, handle) : null
	}

	destroy() {
		if (this.handle) this.lib.dv_destroy(this.handle)
		this.handle = null
	}

	key(code: number, mods: DvMods): number {
		return this.handle ? this.lib.dv_key(this.handle, code, modBits(mods)) : 0
	}

	mouse(kind: DvMouseKind, x: number, y: number, mods: DvMods): number {
		return this.handle ? this.lib.dv_mouse(this.handle, mouseKinds[kind], x, y, modBits(mods)) : 0
	}

	poll(): number {
		return this.handle ? this.lib.dv_poll(this.handle) : 0
	}

	/** Esc would clear something inside dv (selection, search, range). */
	wantsEscape(): boolean {
		return this.handle ? (this.lib.dv_state(this.handle) & 1) !== 0 : false
	}

	/** dv's search prompt is open and should get every key. */
	textInput(): boolean {
		return this.handle ? (this.lib.dv_state(this.handle) & 2) !== 0 : false
	}

	setComments(json: string): boolean {
		if (!this.handle) return false
		const bytes = encoder.encode(json)
		return this.lib.dv_set_comments(this.handle, bytes, bytes.length) === 1
	}

	/** A file's text at the PR head, for expanding hidden context. False when it does not fit the diff. */
	setSource(file: number, text: string): boolean {
		if (!this.handle) return false
		const bytes = encoder.encode(text)
		return this.lib.dv_set_source(this.handle, file, bytes, bytes.length) === 1
	}

	render(width: number, height: number): readonly DvRun[] {
		if (!this.handle) return []
		const length = this.lib.dv_render(this.handle, width, height)
		const ptr = this.lib.dv_frame_ptr(this.handle)
		if (!ptr || length === 0) return []
		const bytes = new Uint8Array(toArrayBuffer(ptr, 0, length))
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const runs: DvRun[] = []
		for (let at = 0; at < length; ) {
			const textLength = view.getUint16(at + 14, true)
			runs.push({
				x: view.getUint16(at, true),
				y: view.getUint16(at + 2, true),
				fg: view.getUint32(at + 4, true),
				bg: view.getUint32(at + 8, true),
				attrs: view.getUint16(at + 12, true),
				text: decoder.decode(bytes.subarray(at + 16, at + 16 + textLength)),
			})
			at += 16 + textLength
		}
		return runs
	}

	takeActions(): readonly DvAction[] {
		if (!this.handle) return []
		const actions: DvAction[] = []
		for (let length = this.lib.dv_take_action(this.handle); length > 0; length = this.lib.dv_take_action(this.handle)) {
			const ptr = this.lib.dv_action_ptr(this.handle)
			if (!ptr) break
			actions.push(JSON.parse(decoder.decode(new Uint8Array(toArrayBuffer(ptr, 0, length)))) as DvAction)
		}
		return actions
	}
}
