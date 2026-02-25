## 2024-05-22 - Speculative Read Optimization
**Learning:** For binary token streams where most tokens are small fixed-length structures (e.g., 1-9 bytes), performing a speculative read of a small chunk (e.g., 16 bytes) significantly reduces the overhead of `await` and function calls compared to reading 1 byte for type and then reading the payload.
**Action:** Always consider speculative reading when parsing binary formats with frequent small tokens to minimize I/O and async overhead.
