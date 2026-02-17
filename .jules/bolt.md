# Bolt's Journal

## 2024-05-23 - Buffer Reuse Optimization Failure
**Learning:** Reusing `Buffer` in `BinaryTokenWriter` without careful consideration of downstream consumers (like `fs.WriteStream`) can lead to data corruption or performance regression if the stream holds a reference to the buffer.
**Action:** When optimizing buffer allocations, always verify if the buffer ownership is transferred or if it is copied. If transferred, do not reuse.

## 2024-05-23 - Float64 vs String Table for Numbers
**Learning:** Storing floating-point numbers as strings in a binary format (deduplicated via string table) is significantly slower than writing them as native 64-bit floats, even with deduplication. The overhead of `String(num)`, hashing, and map lookup outweighs the space savings of deduplication for unique or semi-unique numbers.
**Action:** Prefer native binary types (`Float64`, `Int32`, etc.) over string-based representations for numbers in performance-critical serialization.
