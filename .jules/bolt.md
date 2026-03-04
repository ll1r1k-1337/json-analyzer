
## 2024-05-30 - [Speculative Read Ahead Optimization]
**Learning:** Sequential async reading of binary tokens (reading 1 byte for type, then N bytes for payload) causes significant performance degradation due to async microtask queue overhead per token when reading thousands of tokens.
**Action:** Implemented speculative read ahead. By reading 16 bytes at once (which covers most primitive token payloads + token type), we eliminate the second async read operation for the majority of tokens (numbers, keys, strings, booleans, nulls, typed arrays). This increased local throughput from ~500k tokens/s to ~730k tokens/s, a ~46% speed up. The underlying file reader buffers safely return short buffers when near the end of a file.
