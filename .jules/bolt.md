## 2024-05-24 - [Skipping Path Tracking for Unanalyzed Streams]
**Learning:** `BinaryTokenWriter` maintains a `path` array on every object/array traversal even when no analysis is performed. This adds significant overhead (13%+) for deeply nested JSONs.
**Action:** Always check if a feature (like analysis) is enabled before maintaining its internal state in hot loops.
