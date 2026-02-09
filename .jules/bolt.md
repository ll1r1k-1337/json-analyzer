## 2024-05-24 - Float64 Optimization
**Learning:** `BinaryTokenWriter` was falling back to `NumberRef` for all floating point numbers, causing massive string overhead (allocation + hash map lookup). Adding `Float64` support improved throughput by ~20x for float-heavy datasets.
**Action:** Always check if specialized binary tokens exist before falling back to generic/string representations.
