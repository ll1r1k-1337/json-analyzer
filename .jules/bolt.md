## 2024-05-15 - [Init]
**Learning:** Initializing the Bolt journal to record critical learnings.
**Action:** Add entries as necessary based on findings.

## 2024-05-16 - [Array Operations in Hot Loops]
**Learning:** Unconditional array `push()` and `pop()` operations (e.g. `this.path`) inside hot token-writing loops (like `beforeValue`, `afterValue`, `writeKey`) can cause a surprisingly large overhead (e.g., ~5-10% of total parse time), even if the array values are never read later.
**Action:** Always conditionally bypass unused state-tracking arrays (like `path` breadcrumbs) when the feature depending on them (e.g. `this.analysis`) is disabled.