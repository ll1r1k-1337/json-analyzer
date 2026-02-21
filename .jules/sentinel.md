## 2026-02-21 - [Allocation of Resources Without Limits or Throttling]
**Vulnerability:** BinaryTokenReader attempts to allocate memory based on untrusted length values from binary files, allowing a malicious file to trigger an OOM crash.
**Learning:** File parsers that read length-prefixed data must validate the length against a safe maximum before allocation, even if the file size check seems sufficient (as `fs.read` allows over-allocation).
**Prevention:** Enforce a hard limit on single allocations (e.g., `MAX_SAFE_ALLOCATION`) in low-level reader utilities.
