## 2025-02-18 - [DoS in BinaryTokenWriter String Table]
**Vulnerability:** BinaryTokenWriter allocates memory for every unique string without limit, leading to potential DoS via memory exhaustion.
**Learning:** Custom binary serializers often implement string tables for compression but forget to limit table size, becoming vulnerable to DoS if input is controlled by attacker.
**Prevention:** Always enforce limits on unique string count and total string table size when implementing string deduplication tables.
