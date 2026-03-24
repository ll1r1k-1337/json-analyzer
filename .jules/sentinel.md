## 2026-03-24 - DoS Vulnerability via Out-Of-Memory Payload Length Limit
**Vulnerability:** A denial of service vulnerability existed where binary file headers specifying very large payload lengths (e.g., 2GB) could be passed to `Buffer.alloc` or `Buffer.allocUnsafe` without bounding, crashing the Node.js process out of memory.
**Learning:** Even though `length` comes from binary serialization data, it must be bounded by a specific and reasonable application limit to avoid process exhaustion by malicious files.
**Prevention:** Always enforce a max allocation limit (`MAX_SAFE_ALLOCATION`) before attempting to create large buffers dynamically using size parameters from parsed inputs. Apply defense-in-depth across the application where such requests are made.
