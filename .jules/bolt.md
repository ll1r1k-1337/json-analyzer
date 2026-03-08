## 2025-02-24 - Speculative read optimization
**Learning:** In highly streaming format parsers like BinaryTokenReader, reading chunks byte-by-byte (e.g., token header then specific payload length) introduces high async/await microtask overhead. Fetching a speculative slightly larger chunk (e.g. 16 bytes) and synchronously slicing avoids these extra promises for small tokens.
**Action:** When working on readers looping frequently over a stream, prefer larger buffer lookaheads or speculative reads to reduce microtasks before falling back to additional async reads for large payloads.
