---
"ghui": patch
---

Isolate concurrent PR, issue, repository, and pagination requests so comments and other results cannot leak between subjects. Keep mutation outcomes independent and prevent stale comment refreshes from replacing newer results.
