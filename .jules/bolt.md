## 2024-11-20 - Streamlining Asynchronous Reads in Token Parsers
**Learning:** For a stream/token parser like `BinaryTokenReader`, executing multiple distinct asynchronous `readBytes` operations (even if buffered underlyingly) creates extreme microtask queue overhead for short tokens (type -> length -> payload).
**Action:** When repeatedly reading short sequences from a stream or buffer, perform a "speculative read" (e.g., 16-byte chunk) upfront. This single await handles the vast majority of tokens entirely synchronously from the chunk, drastically reducing async yield overhead.
