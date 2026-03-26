## 2025-02-14 - Prevent OOM DoS in Binary Deserialization
**Vulnerability:** The binary token parser allocated buffers blindly using the untrusted length prefix specified in the binary file. An attacker could specify a massive length (e.g., 4GB) for a token, causing the application to instantly crash due to an Out-Of-Memory (OOM) error before the underlying data was even validated or read.
**Learning:** Never trust length prefixes in binary formats for direct dynamic allocation. Always clamp and validate memory allocations against a safe upper bound.
**Prevention:** Introduce a strict constant `MAX_SAFE_ALLOCATION` (e.g., 512MB) and validate requested buffer lengths against it in all file and buffer reading paths.
