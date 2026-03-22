## 2024-03-22 - Add bounds check to buffer length extraction
**Vulnerability:** Reader methods allocating buffer arrays according to untrusted metadata can be exploited to allocate arbitrary amounts of memory.
**Learning:** `BinaryTokenReader` and `FileReader` must enforce strict memory limit boundaries before calling Buffer.allocUnsafe.
**Prevention:** `FileReader` buffer limits and `Buffer.allocUnsafe` limits can be enforced up front by defining a `MAX_SAFE_ALLOCATION`.
