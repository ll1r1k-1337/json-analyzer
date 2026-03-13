## 2024-05-18 - Speculative I/O in Stream Parsers
**Learning:** Performing multiple `await` calls per token in a stream parser introduces significant asynchronous microtask overhead which limits throughput.
**Action:** Always prefer fetching a reasonably sized chunk of bytes speculatively (e.g., 16 bytes) that covers most fixed-width payloads, and parsing from that synchronous chunk before falling back to additional `await` operations.
