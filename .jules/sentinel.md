## 2025-01-28 - Unbounded String Table Memory Consumption
**Vulnerability:** The `BinaryTokenWriter` stored all unique strings in memory without limits, allowing a malicious JSON payload (e.g., millions of unique keys) to cause a Denial of Service via memory exhaustion (OOM).
**Learning:** Streaming parsers often need to buffer certain data (like string tables) for optimization or format requirements. If this buffer is unbounded, the "streaming" benefit is negated for memory safety.
**Prevention:** Always implement configurable limits (`maxUniqueStrings`, `maxStringTableBytes`) for any in-memory buffers in streaming components, and fail securely when limits are exceeded.
