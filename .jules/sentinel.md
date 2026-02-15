## 2025-02-17 - [Unlimited String Table Growth]
**Vulnerability:** `BinaryTokenWriter` allows unlimited unique strings to be added to the string table, causing memory exhaustion (DoS).
**Learning:** File format writers that deduplicate data (like strings) must enforce limits on the size of the deduplication table to prevent malicious inputs from consuming all available memory.
**Prevention:** Always implement configurable limits (`maxUniqueStrings`, `maxStringTableBytes`) for internal buffers and lookup tables that grow with input data.
