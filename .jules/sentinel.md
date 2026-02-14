## 2024-05-23 - Unbounded String Table Growth
**Vulnerability:** `BinaryTokenWriter` accumulated all unique strings in memory without limits.
**Learning:** Unbounded data structures that grow based on unique input (like symbol tables) are trivial DoS vectors.
**Prevention:** Always enforce configurable limits (`maxUniqueStrings`, `maxStringTableBytes`) on in-memory structures that depend on user input.
