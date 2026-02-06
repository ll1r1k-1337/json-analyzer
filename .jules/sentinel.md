## 2024-05-22 - [Unbounded String Interning DoS]
**Vulnerability:** The `BinaryTokenWriter` accumulated unique strings indefinitely in memory without limits, allowing malicious inputs (e.g., JSON with millions of unique keys) to crash the process via OOM.
**Learning:** Streaming parsers/writers often have hidden stateful components (like deduplication tables) that break the "streaming" promise if not bounded.
**Prevention:** Always enforce hard limits (count and byte size) on any accumulation buffer or lookup table used in data processing pipelines.
