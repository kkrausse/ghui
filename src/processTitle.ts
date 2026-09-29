export interface ProcessTitleContext {
	readonly repository: string | null
	readonly pullRequest: { readonly repository: string; readonly number: number } | null
	readonly pullRequestFocused: boolean
}

interface TitleOutput {
	readonly isTTY?: boolean
	readonly write: (text: string) => unknown
}

let currentTitle = "ghui"

const safeTerminalTitle = (title: string): string =>
	Array.from(title)
		.filter((character) => {
			const codePoint = character.codePointAt(0) ?? 0
			return codePoint >= 0x20 && codePoint !== 0x7f
		})
		.join("")

export const terminalTitleSequence = (title: string): string => `\x1b]0;${safeTerminalTitle(title)}\x07`

export const setApplicationTitle = (title: string, output: TitleOutput = process.stdout): void => {
	currentTitle = title
	process.title = title
	if (output.isTTY) output.write(terminalTitleSequence(title))
}

export const refreshApplicationTitle = (output: TitleOutput = process.stdout): void => {
	setApplicationTitle(currentTitle, output)
}

export const processTitleFor = ({ repository, pullRequest, pullRequestFocused }: ProcessTitleContext): string => {
	if (pullRequestFocused && pullRequest) return `ghui — ${pullRequest.repository} #${pullRequest.number}`
	if (repository) return `ghui — ${repository}`
	return "ghui"
}
