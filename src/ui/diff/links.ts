import { createHash } from "node:crypto"
import type { DiffCommentAnchor } from "../diff.js"

type LinePoint = Pick<DiffCommentAnchor, "side" | "line">

/** GitHub's Files changed line anchors hash the repository-relative path. A range may cross sides (L3-R4). */
export const diffLineUrl = (
	prUrl: string,
	anchor: Pick<DiffCommentAnchor, "path" | "side" | "line">,
	range: { readonly start: LinePoint; readonly end: LinePoint } | null = null,
): string => {
	const hash = createHash("sha256").update(anchor.path).digest("hex")
	const point = (p: LinePoint) => `${p.side === "LEFT" ? "L" : "R"}${p.line}`
	const start = point(range?.start ?? anchor)
	const end = point(range?.end ?? anchor)
	return `${prUrl.replace(/\/$/, "")}/files#diff-${hash}${start === end ? end : `${start}-${end}`}`
}
