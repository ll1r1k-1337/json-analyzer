## 2024-05-22 - BinaryTokenWriter DoS Prevention
**Vulnerability:** Memory exhaustion DoS in `BinaryTokenWriter`.
**Learning:** Writers accumulating state (like string tables) without limits can be exploited to crash the process via OOM.
**Prevention:** Always implement configurable limits (count and bytes) for internal buffers or state in writers/parsers.
