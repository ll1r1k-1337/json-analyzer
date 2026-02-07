# Sentinel's Journal

## 2026-02-07 - [Unbounded String Collection]
**Vulnerability:** The `BinaryTokenWriter` stored all unique strings in memory without limit during JSON parsing, creating a DoS vector via memory exhaustion.
**Learning:** Even streaming architectures can be vulnerable if auxiliary data structures (like deduplication tables) grow linearly with input complexity.
**Prevention:** Implement configurable size limits (count or bytes) on all data structures that grow with user input, and fail fast when limits are exceeded.
