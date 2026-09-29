import { createHash } from "node:crypto"
import type { DiffCommentAnchor } from "../diff.js"
import type { DiffCommentRangeSelection } from "./comments.js"

/** GitHub's Files changed line anchors hash the repository-relative path. */
export const diffLineUrl = (prUrl: string, anchor: Pick<DiffCommentAnchor, "path" | "side" | "line">, range: DiffCommentRangeSelection | null = null): string => {
	const hash = createHash("sha256").update(anchor.path).digest("hex")
	const side = anchor.side === "LEFT" ? "L" : "R"
	const start = range?.start.line ?? anchor.line
	const end = range?.end.line ?? anchor.line
	const lines = start === end ? `${side}${end}` : `${side}${start}-${side}${end}`
	return `${prUrl.replace(/\/$/, "")}/files#diff-${hash}${lines}`
}
