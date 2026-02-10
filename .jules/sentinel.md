## 2024-05-24 - Unbounded String Table Memory Usage
**Vulnerability:** The `BinaryTokenWriter` stored all unique strings and object keys in an in-memory `stringTable` without limits, allowing malicious JSON input with many unique strings to cause a Denial of Service (DoS) via memory exhaustion.
**Learning:** Even when streaming output to disk, intermediate structures like string tables or indexes must be bounded to prevent DoS.
**Prevention:** Implement configurable limits (count and bytes) for all unbounded collection structures and throw errors when exceeded.
