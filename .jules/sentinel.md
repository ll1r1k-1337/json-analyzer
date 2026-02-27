## 2024-05-23 - Binary Reader Allocation DoS
**Vulnerability:** The BinaryTokenReader trusted length integers from untrusted files to allocate memory directly (e.g. `Buffer.alloc(2GB)`), allowing small files to cause OOM crashes.
**Learning:** Binary formats that length-prefix data must validate the length against reasonable limits before allocation, as file size checks alone are insufficient if the file is sparse or misleading.
**Prevention:** Always enforce a MAX_SAFE_ALLOCATION limit on dynamic buffers and verify that read operations stay within file bounds.
