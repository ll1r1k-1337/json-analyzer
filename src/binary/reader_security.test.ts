import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BinaryTokenReader } from "./reader.js";
import { TokenType, FORMAT_MAGIC, TRAILER_MAGIC } from "./format.js";

describe("BinaryTokenReader Security", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "json-analyzer-sec-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should fail gracefully when reading a huge token length", async () => {
    const metaPath = join(tempDir, "huge_token.meta");
    const binPath = join(tempDir, "huge_token.bin");

    // Construct minimal valid .meta
    const header = Buffer.concat([
      FORMAT_MAGIC,
      Buffer.from([0x01, 0x00]), // Version 1
      Buffer.from([0x00, 0x00]), // Flags
    ]);

    // Empty string table (count=0)
    const stringTable = Buffer.alloc(4);

    // Empty index (count=0)
    const index = Buffer.alloc(4);

    // Trailer
    // Layout: magic(4) + strOff(8) + tokOff(8) + tokLen(8) + idxOff(8) + idxLen(8) + sum(4)
    const trailer = Buffer.alloc(48);
    trailer.set(TRAILER_MAGIC, 0);
    // stringTableOffset = 8 (header length)
    trailer.writeBigUInt64LE(8n, 4);
    // tokenStreamOffset = 0 (for separate file)
    trailer.writeBigUInt64LE(0n, 12);
    // tokenStreamLength = huge
    trailer.writeBigUInt64LE(BigInt(0x80000000) + 5n, 20);
    // indexOffset = 8 + 4 (12)
    trailer.writeBigUInt64LE(12n, 28);
    // indexLength = 4
    trailer.writeBigUInt64LE(4n, 36);
    // checksum = 0
    trailer.writeUInt32LE(0, 44);

    const metaContent = Buffer.concat([header, stringTable, index, trailer]);
    await writeFile(metaPath, metaContent);

    // Construct .bin with malicious token
    // TokenType.Number (0x07) + Length (4 bytes)
    const binContent = Buffer.alloc(5);
    binContent.writeUInt8(TokenType.Number, 0);
    // Length: 0x80000000 (2GB). This should cause allocation failure or RangeError.
    binContent.writeUInt32LE(0x80000000, 1);

    await writeFile(binPath, binContent);

    // Test
    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);

    // Attempt to read token.
    // Without fix: tries to alloc 2GB -> throws RangeError [ERR_BUFFER_OUT_OF_BOUNDS] or crashes.
    // With fix: throws specific security error.
    await expect(async () => {
      await reader.readTokenAt(0n);
    }).rejects.toThrow(/exceeds maximum safe allocation/);

    await reader.close();
  }, 30000);
});
