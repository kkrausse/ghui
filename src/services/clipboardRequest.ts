import { Clipboard } from "./Clipboard.js"
import { githubRequest } from "./runtime.js"

export const copyTextRequest = githubRequest<string>()((text) => Clipboard.use((clipboard) => clipboard.copy(text)))
