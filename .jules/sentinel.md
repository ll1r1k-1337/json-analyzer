# Sentinel's Security Journal

## 2024-05-22 - Allocation DoS in Binary Reader
**Vulnerability:** The `BinaryTokenReader` blindly trusted length prefixes for `Number` and `TypedArray` tokens, allocating memory based on the specified size before reading data. This allowed a small malicious file (5 bytes) to trigger a large allocation (e.g., 2GB), leading to Denial of Service via OOM or RangeError.
**Learning:** Custom binary formats that use length-prefixed data must always validate the length against a reasonable maximum limit before allocation. Trusting the file content implicitly is dangerous.
**Prevention:** Implement `MAX_SAFE_ALLOCATION` limits for all dynamic length fields in binary parsers. Check `length <= LIMIT` before `Buffer.alloc(length)`.
