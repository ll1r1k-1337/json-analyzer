## 2024-05-22 - Hot Path Array Operations
**Learning:** Updating a diagnostic array (`path.push`/`pop`) on every JSON token added ~27% overhead to the binary writer, even without further processing of that array.
**Action:** Guard diagnostic state updates with a configuration flag to skip them in production hot paths.
