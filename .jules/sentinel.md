## 2024-05-23 - Binary Reader Allocation Limits
**Vulnerability:** The `BinaryTokenReader` trusted the length field from the input file (e.g., 4 bytes for `TokenType.Number` length) and passed it directly to `Buffer.alloc` or `readBytes`. A malicious file could declare a 4GB token, causing an immediate OOM crash.
**Learning:** Never trust length indicators from untrusted input without validating against a safe upper bound before allocation.
**Prevention:** Enforced a `MAX_SAFE_ALLOCATION` (64MB) limit on all dynamic length reads (`Number`, `TypedArray`, `StringTable`, `Index`).
