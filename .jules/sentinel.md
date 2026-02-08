# Sentinel's Journal 🛡️

## 2024-05-22 - Unbounded String Table Memory Growth
**Vulnerability:** The `BinaryTokenWriter` buffered all unique strings in memory until finalization, allowing an attacker to cause an Out-Of-Memory (OOM) crash by providing a JSON with millions of unique strings.
**Learning:** Streaming writers that need to build a lookup table (like a string table) must enforce limits on the table size to prevent DoS, even if the token stream itself is written incrementally.
**Prevention:** Always implement `maxUniqueStrings` and `maxStringTableBytes` limits in any component that buffers unique values for deduplication.
