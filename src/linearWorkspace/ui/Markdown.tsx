import { SyntaxStyle } from "@opentui/core"
import { color } from "../theme.ts"
import { createContext, useContext } from "react"
import { MarkdownBody } from "../../ui/MarkdownBody.js"

export const LinearLinkContext = createContext<((url: string) => void) | undefined>(undefined)

// OpenCode uses this same OpenTUI renderer. Share one native syntax palette
// across bodies rather than allocating one for every comment.
const syntaxStyle = SyntaxStyle.fromStyles({
	default: { fg: color.fg },
	"markup.heading": { fg: color.accent, bold: true },
	"markup.strong": { bold: true },
	"markup.italic": { italic: true },
	"markup.strikethrough": { dim: true },
	"markup.raw": { fg: color.ok },
	"markup.link": { fg: color.low },
	"markup.link.label": { fg: color.low, underline: true },
	"markup.link.url": { fg: color.dim },
	"markup.list": { fg: color.accent },
	"markup.quote": { fg: color.dim, italic: true },
	conceal: { fg: color.dim },
	comment: { fg: color.dim, italic: true },
	keyword: { fg: color.accent },
	string: { fg: color.ok },
	number: { fg: color.high },
	boolean: { fg: color.high },
	function: { fg: color.low },
	type: { fg: color.medium },
	operator: { fg: color.accent },
	punctuation: { fg: color.fg },
})

export function Markdown({ content }: { content: string }) {
	const openLink = useContext(LinearLinkContext)
	if (openLink) return <MarkdownBody body={content} onLinkOpen={openLink} />
	return (
		<markdown
			content={content}
			syntaxStyle={syntaxStyle}
			fg={color.fg}
			conceal
			streaming={false}
			internalBlockMode="top-level"
			tableOptions={{ style: "grid", wrapMode: "word", borderColor: color.border }}
			flexShrink={0}
			minWidth={0}
		/>
	)
}
