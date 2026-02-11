## 2024-05-24 - Unnecessary State Tracking Overhead
**Learning:** `BinaryTokenWriter` was maintaining a full breadcrumb `path` array (pushing/popping for every object/array) even when the analysis feature that requires it was disabled. This added significant overhead (allocations, array resizing) to the hot path.
**Action:** Always check if a feature flag is enabled before maintaining the state required *only* for that feature, especially in performance-critical loops.
