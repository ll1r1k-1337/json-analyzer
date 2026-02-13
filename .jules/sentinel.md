## 2024-05-23 - Unbounded String Table Memory Consumption
**Vulnerability:** The `BinaryTokenWriter` stored all unique strings in an unbounded `Map` and `Array` in memory. A malicious input with millions of unique strings could cause a Denial of Service (DoS) via memory exhaustion (OOM).
**Learning:** Even when streaming data to disk, auxiliary structures like deduplication tables can grow unbounded if not explicitly limited.
**Prevention:** Implement configurable limits (`maxUniqueStrings`, `maxStringTableBytes`) on internal buffers and tables, and throw errors or flush/reset when limits are reached.
