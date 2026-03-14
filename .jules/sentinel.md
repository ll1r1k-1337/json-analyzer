## 2026-03-14 - [OOM DoS via large buffer allocations]
**Vulnerability:** Binary token parsing allocated buffers matching payload sizes from untrusted inputs without checking for arbitrarily large sizes, leading to potential Out-Of-Memory (OOM) Denial of Service (DoS) attacks.
**Learning:** In a binary format relying on lengths to allocate typed arrays or strings (like Uint32Array, strings), parsing untrusted data without hard-coded limits allows attackers to specify excessive lengths, exhausting server memory.
**Prevention:** Implement strict length and bounds checking on dynamic buffer allocations (`Buffer.allocUnsafe` and `read` requests). E.g., setting a `MAX_SAFE_ALLOCATION` limit (like 512MB).
