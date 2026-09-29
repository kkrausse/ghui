---
"@kitlangton/ghui": patch
---

Recover missing diff entries in full view, protect the selected diff from cache eviction, and track live requests independently of loading markers. Superseded refreshes cannot publish stale results and hung diff/comment requests time out.
