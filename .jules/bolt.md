# Bolt's Journal

## 2024-05-24 - Initial Analysis
**Learning:** The project uses a custom binary JSON format with a `BinaryTokenWriter` and `BinaryTokenReader`. The `BinaryTokenReader` seems to have opportunities for optimization, particularly in how it reads tokens. It currently makes many small `read` calls (awaiting promises) for each token part (header, payload).
**Action:** Investigate batching reads or using a larger buffer in `BinaryTokenReader` to reduce `await` overhead.
