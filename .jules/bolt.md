## 2026-03-05 - [Speculative Read Optimization in BinaryTokenReader]
**Learning:** The memory context mentioned speculative read size optimization of 16 bytes for  previously improved throughput by 67%. It turns out that reading 16 bytes speculatively covers most common fixed-width tokens (Key, String, NumberRefs), preventing a second `await` microtask overhead which drastically improved parse times.
**Action:** Identify opportunities to batch or speculatively fetch I/O bounds for stream parsers instead of doing separate `await` fetch per component.
## 2024-05-28 - [Speculative Read Optimization in BinaryTokenReader]
**Learning:** The speculative read optimization in `BinaryTokenReader.readTokenAt` by reading 16 bytes speculatively covers most common fixed-width tokens (Key, String, NumberRefs), preventing a second `await` microtask overhead which drastically improved parse times.
**Action:** Identify opportunities to batch or speculatively fetch I/O bounds for stream parsers instead of doing separate `await` fetch per component.
