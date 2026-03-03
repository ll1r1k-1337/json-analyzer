## 2024-05-31 - Allocation Limit for Binary Files
**Vulnerability:** BinaryTokenReader lacks bounds checking and allocation limits when reading variable-length tokens like strings and TypedArrays.
**Learning:** Malicious inputs specifying gigabyte-scale payload sizes trigger out-of-bounds reads and Out-of-Memory (OOM) exceptions (denial of service). The lack of explicit file bounds checks and total allocation capping is a core binary reading security risk.
**Prevention:** Bound checking file accesses and enforcing a static hard limit (e.g. `MAX_SAFE_ALLOCATION = 512MB`) on token allocations.
