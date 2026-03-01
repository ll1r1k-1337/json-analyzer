## 2024-03-01 - [Speculative Reads in Binary Parsers]
**Learning:** Frequent small reads in a streaming parser heavily degrade performance due to `await` microtask overhead, even when the underlying data is already buffered.
**Action:** Implement speculative read-ahead (e.g. fetching a small chunk like 16 bytes for headers/payloads) to satisfy the majority of token reads with a single async call, significantly improving token/sec throughput.
