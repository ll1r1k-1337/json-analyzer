# Sentinel Journal

## 2026-02-07 - Denial of Service via String Table Memory Exhaustion
**Vulnerability:** The `BinaryTokenWriter` buffers all unique strings in memory until finalization to build the string table, allowing an attacker to exhaust memory by providing a JSON with millions of unique strings.
**Learning:** Even when using streaming parsers (like `stream-json`) and writers, maintaining a global index (like a string table) that is written at the end introduces a memory bottleneck proportional to the input's complexity (unique strings).
**Prevention:** Enforce strict limits on the size and count of buffered structures (e.g., `maxUniqueStrings`, `maxStringTableBytes`) and fail early when these limits are exceeded.
