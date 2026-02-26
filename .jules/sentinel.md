## 2024-05-23 - Unbounded Memory Allocation in Binary Reader
**Vulnerability:** The `BinaryTokenReader` blindly trusted `byteLength` fields for `TokenType.Number` and Typed Array tokens, and `stringTableLength`/`indexLength` from the trailer. A malicious file could claim a 2GB length, causing the reader to attempt a 2GB allocation, leading to a crash (DoS).
**Learning:** Never pass untrusted length values directly to `Buffer.alloc` or read methods without validation. JavaScript/Node.js buffers are memory-backed and large allocations can be fatal.
**Prevention:** Implement a `MAX_SAFE_ALLOCATION` limit (e.g., 64MB) and validate all length fields read from the file against this limit before attempting allocation.
