# Bolt's Journal

## 2024-05-24 - Speculative Read-Ahead and Zero-Copy Buffering
**Learning:** In V8/Node.js, reducing the number of `await` calls in a hot loop (even by 50%) yields diminishing returns if the Promise resolution overhead is not the sole bottleneck. However, combining it with zero-copy buffer access (`buffer.subarray` instead of `buffer.copy`) provides a robust, albeit small (~1-2%), improvement for high-throughput binary reading. The key is ensuring that "unsafe" buffers are never leaked to consumers who might expect ownership.
**Action:** When optimizing binary parsers, prioritize fetching "headers" (type + length) in a single read to avoid multiple async round-trips, and use `unsafe` buffer slicing for internal temporary data.
