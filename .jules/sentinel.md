## 2024-05-24 - DoS vulnerability in String Registry
**Vulnerability:** The string table stored in memory during parsing could grow boundlessly without checks. The total unconstrained size of registered strings could lead to Out-Of-Memory (OOM) Denial-of-Service (DoS) attacks if a large payload is provided with many unique or large strings.
**Learning:** Even though tokens are written in chunks continuously, storing the entire unique string index and string values in memory without limits introduces a vector for resource exhaustion attacks. Memory structures persisting over the entire execution life must have configured limits.
**Prevention:** Always implement configurable bounds checking on persistent collections, such as caches and indices.
