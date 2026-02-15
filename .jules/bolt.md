## 2024-05-23 - Path Tracking Overhead in BinaryTokenWriter
**Learning:** `BinaryTokenWriter` maintains a `this.path` array (push/pop) for every value and key, even when `analysis` (which uses the path) is disabled. This adds unnecessary overhead (array operations + string allocations for keys).
**Action:** Always check if optional features (like `analysis`) are enabled before maintaining expensive auxiliary state like full JSON paths. In this case, skipping path operations yielded a ~5.4% speedup.
