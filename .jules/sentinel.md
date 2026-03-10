## 2024-05-15 - [Initial Sentinel log]
**Vulnerability:** Initial run
**Learning:** Found nothing yet
**Prevention:** N/A
## 2026-03-10 - [OOM DoS via Malicious Length Prefix]
**Vulnerability:** BinaryTokenReader dynamically allocated buffers for token payloads based on lengths provided in the binary format without upper bounds checking. Malicious actors could provide crafted length prefixes (e.g. 4GB) causing memory exhaustion and denial of service via Out-Of-Memory (OOM) errors.
**Learning:** External or uncontrolled binary data must not be trusted to dictate raw memory allocation sizes in JavaScript/Node.js environments without strict bounds validation. Length prefixes must be subjected to a safe maximum allocation limit.
**Prevention:** Implement a strict, global MAX_SAFE_ALLOCATION constant (e.g., 512MB) checked before performing any read operation or buffer allocation based on untrusted inputs.
