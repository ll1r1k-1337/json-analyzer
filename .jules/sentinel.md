## 2024-05-23 - Unbounded Memory Allocation DoS
**Vulnerability:** The `BinaryTokenReader` allocated memory based on an untrusted integer length field from the file without validation.
**Learning:** `Buffer.alloc` or `fs.read` into a buffer sized by user input allows attackers to trigger OOM crashes with small payloads (e.g. a 5-byte file claiming a 2GB token).
**Prevention:** Always validate length fields against a safe maximum (e.g., `MAX_SAFE_ALLOCATION`) before allocating memory or reading data.
