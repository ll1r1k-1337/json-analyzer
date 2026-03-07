## 2024-05-15 - Speculative I/O reads in Node Streams
**Learning:** Calling `await` multiple times sequentially to parse small structured binary tokens (like token header then payload) adds massive asynchronous microtask overhead in Node.js.
**Action:** Always batch I/O reads or perform speculative reads (e.g., reading 16 bytes upfront to cover headers and typical payloads) to minimize `await` occurrences, turning multiple asynchronous operations into synchronous buffer extractions whenever possible.
