import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { open, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  TRAILER_MAGIC,
  TRAILER_LENGTH,
  TokenType,
} from "./format.js";

const TEST_DIR = "benchmarks/output"; // Use existing output dir
const TEST_FILE_BIN = join(TEST_DIR, "security_test.bin");
const TEST_FILE_META = join(TEST_DIR, "security_test.meta");

describe("BinaryTokenReader Security", () => {
  beforeAll(async () => {
    // Ensure directory exists
    try {
      await mkdir(TEST_DIR, { recursive: true });
    } catch {}
  });

  afterAll(async () => {
    try {
      await unlink(TEST_FILE_BIN);
      await unlink(TEST_FILE_META);
    } catch {}
  });

  it("throws error when token length exceeds safe allocation limit", async () => {
    // 1. Create a minimal valid metadata file (header + trailer)
    // We need offsets that point to our malicious token
    const magic = FORMAT_MAGIC;
    const version = Buffer.alloc(2);
    version.writeUInt16LE(FORMAT_VERSION);
    const flags = Buffer.alloc(2);

    const header = Buffer.concat([magic, version, flags]); // 8 bytes

    // String table (empty)
    const stringTable = Buffer.alloc(4);
    stringTable.writeUInt32LE(0); // count = 0

    // Index (empty)
    const index = Buffer.alloc(4);
    index.writeUInt32LE(0); // count = 0

    // Trailer
    const trailer = Buffer.alloc(TRAILER_LENGTH);
    trailer.write(TRAILER_MAGIC.toString(), 0);
    // stringTableOffset (after header)
    trailer.writeBigUInt64LE(BigInt(header.length), 4);
    // tokenStreamOffset (0)
    trailer.writeBigUInt64LE(0n, 12);
    // tokenStreamLength (will set below)
    trailer.writeBigUInt64LE(0n, 20); // Placeholder
    // indexOffset (after string table)
    trailer.writeBigUInt64LE(BigInt(header.length + stringTable.length), 28);
    // indexLength
    trailer.writeBigUInt64LE(BigInt(index.length), 36);
    // checksum
    trailer.writeUInt32LE(0, 44);

    await writeFile(TEST_FILE_META, Buffer.concat([header, stringTable, index, trailer]));

    // 2. Create a malicious bin file
    // Token: Uint8Array (0x13) + Length (65MB) + Data (truncated)
    const hugeLength = 65 * 1024 * 1024; // 65MB
    const tokenBuffer = Buffer.alloc(5);
    tokenBuffer.writeUInt8(TokenType.Uint8Array, 0);
    tokenBuffer.writeUInt32LE(hugeLength, 1);

    await writeFile(TEST_FILE_BIN, tokenBuffer);

    // Update trailer with correct tokenStreamLength (even though file is short)
    // Reader checks bounds against trailer.tokenStreamLength if set.
    // But we want to trick it into reading.
    // If we set tokenStreamLength to hugeLength + 5, it will try to read.
    // If we set it to actual file size (5), readTokenAt verifies offset bounds.
    // offset 0 is valid.

    // The reader reads:
    // const lengthBytes = await this.readBytes(absoluteOffset + 1n, 4);
    // const byteLength = lengthBytes.readUInt32LE(0);
    // const data = await this.readBytes(absoluteOffset + 5n, byteLength);

    // We want to trigger the check on byteLength.

    // We need to reload trailer to update tokenStreamLength?
    // Actually reader only checks if offset < tokenStreamLength.
    // If we pass offset 0, it's fine.

    // 3. Read it
    const reader = await BinaryTokenReader.fromFiles(TEST_FILE_META, TEST_FILE_BIN);

    // 4. Expectation
    // Currently: It tries to allocate 65MB. If it succeeds, it throws "Unable to read typed array data" (short read).
    // With Fix: It should throw "Token length exceeds safe allocation limit".

    await expect(async () => {
      await reader.readTokenAt(0n);
    }).rejects.toThrow("Token length exceeds safe allocation limit");

    await reader.close();
  });
});
