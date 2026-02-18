## 2024-03-31 - Allocation Limit Enforcement
**Vulnerability:** The `BinaryTokenReader` was trusting token lengths from the binary file without validation, leading to potential Denial of Service (DoS) via excessive memory allocation (Buffer.alloc) for maliciously crafted large length values.
**Learning:** File readers for binary formats must treat all length prefixes as untrusted input and validate them against reasonable limits before allocation.
**Prevention:** Implement strict `MAX_SAFE_ALLOCATION` checks for all dynamic allocations based on file content.
