## 2024-05-22 - FileReader Buffer Optimization
**Learning:** `Buffer.subarray` significantly outperforms `alloc+copy` for read operations. In this codebase, `BinaryTokenReader` consumes data immediately and does not retain references, making `subarray` safe to use even with a shared buffer in `FileReader`.
**Action:** Always check if buffer ownership transfer is required. If not, prefer `subarray`.
