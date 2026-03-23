
## 2024-03-24 - Batching Node Stream Chunks using writev
**Learning:** Node.js streams implement a batching mechanism for `Writable` streams called `writev(chunks, callback)`. When consuming high-throughput object streams (like `stream-json`), using standard `write()` causes massive microtask queue overhead due to invoking a callback for every individual chunk.
**Action:** Always implement `writev` alongside `write` when wrapping high-frequency object-mode streams to process chunks sequentially in a tight loop. This can yield significant (e.g., 50%+) throughput improvements.
