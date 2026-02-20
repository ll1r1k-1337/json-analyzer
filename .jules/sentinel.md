## Sentinel Journal

## 2024-05-22 - Unbounded String Table Memory Usage
**Vulnerability:** The `BinaryTokenWriter` accumulated unique strings in memory without any limits, allowing a maliciously crafted JSON input (or just a very large one) to cause a Denial of Service (DoS) via memory exhaustion.
**Learning:** Even "internal" writers need defensive limits when processing potentially untrusted input streams. Buffering deduplicated data structures (like string tables) in memory is a common DoS vector.
**Prevention:** Always enforce hard limits on in-memory buffers that grow based on input data size. Added `maxUniqueStrings` and `maxStringTableBytes` options to `BinaryTokenWriter`.
