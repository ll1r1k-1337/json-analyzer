
import { describe, it, expect, afterAll } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { FORMAT_MAGIC, FORMAT_VERSION, TokenType } from "./format.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWriteStream } from "node:fs";

describe("BinaryTokenReader Security", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should prevent massive memory allocation for Number tokens", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    tempDirs.push(tempDir);
    const maliciousFilePath = path.join(tempDir, "malicious.bin");

    // Construct a malicious buffer
    // 1. Header (8 bytes)
    const header = Buffer.alloc(8);
    header.set(FORMAT_MAGIC, 0);
    header.writeUInt16LE(FORMAT_VERSION, 4);
    header.writeUInt16LE(0, 6);

    // 2. String Table (Empty) -> Count: 0 (4 bytes)
    const stringTable = Buffer.alloc(4);
    stringTable.writeUInt32LE(0, 0);

    // 3. Token Stream
    // Token: Number (0x07)
    // The reader reads 1 byte for type, then 4 bytes for length.
    // We set length to 100MB (104857600 bytes).
    const dangerousSize = 100 * 1024 * 1024;

    const tokenStreamHeader = Buffer.alloc(1 + 4);
    tokenStreamHeader.writeUInt8(TokenType.Number, 0);
    tokenStreamHeader.writeUInt32LE(dangerousSize, 1);

    // We don't actually need to write 100MB of data if we expect the reader to fail BEFORE reading.
    // However, if the reader tries to read, it will read past EOF if we don't provide data.
    // But `FileReader` might check file size?
    // FileReader uses `fs.read`. If we read past EOF, bytesRead will be less.
    // But `Buffer.alloc(length)` happens BEFORE `fs.read`.
    // So creating a small file that claims to have a large token is enough to trigger the allocation!

    const tokenStream = Buffer.concat([tokenStreamHeader, Buffer.from("123")]); // Small payload

    // 4. Index (Empty) -> Count: 0 (4 bytes)
    const index = Buffer.alloc(4);
    index.writeUInt32LE(0, 0);

    // Offsets calculation
    const stringTableOffset = BigInt(header.length);
    const tokenStreamOffset = stringTableOffset + BigInt(stringTable.length);
    const indexOffset = tokenStreamOffset + BigInt(tokenStream.length);
    const trailerOffset = indexOffset + BigInt(index.length);

    // 5. Trailer (48 bytes)
    const trailer = Buffer.alloc(48);
    trailer.write("TRLR", 0); // TRAILER_MAGIC is "TRLR"
    trailer.writeBigUInt64LE(stringTableOffset, 4);
    trailer.writeBigUInt64LE(tokenStreamOffset, 12);
    trailer.writeBigUInt64LE(BigInt(tokenStream.length), 20);
    trailer.writeBigUInt64LE(indexOffset, 28);
    trailer.writeBigUInt64LE(BigInt(index.length), 36);
    trailer.writeUInt32LE(0, 44);

    const fd = await import("node:fs/promises").then(fs => fs.open(maliciousFilePath, "w"));
    await fd.write(header);
    await fd.write(stringTable);
    await fd.write(tokenStream);
    await fd.write(index);
    await fd.write(trailer);
    await fd.close();

    const reader = await BinaryTokenReader.fromFile(maliciousFilePath);

    // Expecting an error when reading the token due to size limit
    await expect(async () => {
      await reader.readTokenAt(0n);
    }).rejects.toThrow(/exceeds safe allocation limit/);

    await reader.close();
  });
});
