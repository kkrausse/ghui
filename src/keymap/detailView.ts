import { context, type Scrollable } from "@ghui/keymap"

export interface DetailViewCtx extends Scrollable {
	readonly closeDetail: () => void
	readonly confirmSelection: () => void
	readonly previousBlock: () => void
	readonly nextBlock: () => void
	readonly openTheme: () => void
	readonly openDiff: () => void
	readonly openRuns: () => void
	readonly openComments: () => void
	readonly openReview: () => void
	readonly closeSelectedItem: () => void
	readonly openLabels: () => void
	readonly openMerge: () => void
	readonly toggleDraft: () => void
	readonly refresh: () => void
	readonly openInBrowser: () => void
	readonly openInEditor: () => void
	readonly copyLink: () => void
	readonly copyPullRequestUrl: () => void
	readonly pullRequestActive: boolean
}

const Detail = context<DetailViewCtx>()

export const detailViewKeymap = Detail(
	{ id: "detail.up", title: "Previous conversation block", keys: ["up", "k"], run: (s) => (s.pullRequestActive ? s.previousBlock() : s.scrollBy(-1)) },
	{ id: "detail.down", title: "Next conversation block", keys: ["down", "j"], run: (s) => (s.pullRequestActive ? s.nextBlock() : s.scrollBy(1)) },
	{ id: "detail.page-up", title: "Scroll up", keys: ["pageup", "ctrl+u"], run: (s) => s.scrollBy(-s.halfPage) },
	{ id: "detail.page-down", title: "Scroll down", keys: ["pagedown", "ctrl+d", "ctrl+v"], run: (s) => s.scrollBy(s.halfPage) },
	{ id: "detail.top", title: "Scroll to top", keys: ["home", "g g"], run: (s) => s.scrollTo(0) },
	{ id: "detail.bottom", title: "Scroll to bottom", keys: ["end", "shift+g"], run: (s) => s.scrollTo(Number.MAX_SAFE_INTEGER) },
	{ id: "detail.close", title: "Close detail", keys: ["escape"], run: (s) => s.closeDetail() },
	{ id: "detail.confirm", title: "Reply to selected comment / close detail", keys: ["return"], run: (s) => s.confirmSelection() },
	{ id: "detail.left", title: "Return to PR list", keys: ["left"], when: (s) => s.pullRequestActive, run: (s) => s.closeDetail() },
	{ id: "detail.right", title: "Open PR diff", keys: ["right"], when: (s) => s.pullRequestActive, run: (s) => s.openDiff() },
	{ id: "detail.theme", title: "Open theme", keys: ["t"], run: (s) => s.openTheme() },
	{ id: "detail.diff", title: "Open diff", keys: ["d"], run: (s) => s.openDiff() },
	{ id: "detail.runs", title: "Open workflow runs", keys: ["a"], run: (s) => s.openRuns() },
	{ id: "detail.comments", title: "Open comments", keys: ["c"], run: (s) => s.openComments() },
	{ id: "detail.review", title: "Review pull request", keys: ["shift+r"], run: (s) => s.openReview() },
	{ id: "detail.close-item", title: "Close pull request or issue", keys: ["x"], run: (s) => s.closeSelectedItem() },
	{ id: "detail.labels", title: "Manage labels", keys: ["l"], run: (s) => s.openLabels() },
	{ id: "detail.merge", title: "Merge", keys: ["m", "shift+m"], run: (s) => s.openMerge() },
	{ id: "detail.toggle-draft", title: "Toggle draft", keys: ["s", "shift+s"], run: (s) => s.toggleDraft() },
	{ id: "detail.refresh", title: "Refresh", keys: ["r"], run: (s) => s.refresh() },
	{ id: "detail.open-browser", title: "Open in browser", keys: ["o"], run: (s) => s.openInBrowser() },
	{ id: "detail.open-editor", title: "Open in editor", keys: ["e"], run: (s) => s.openInEditor() },
	{ id: "detail.copy", title: "Copy selected link", keys: ["y"], run: (s) => s.copyLink() },
	{ id: "detail.copy-url", title: "Copy pull request link", keys: ["shift+y"], when: (s) => s.pullRequestActive, run: (s) => s.copyPullRequestUrl() },
)
