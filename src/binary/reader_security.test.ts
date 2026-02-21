import { open } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { describe, it, expect, afterAll } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("BinaryTokenReader Security", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should prevent massive allocations when metadata specifies huge string table length", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    tempDirs.push(tempDir);
    const binPath = path.join(tempDir, "malicious.bin");
    const metaPath = path.join(tempDir, "malicious.meta");

    // Create empty bin file
    const binHandle = await open(binPath, 'w');
    await binHandle.close();

    // Create malicious meta file
    const metaHandle = await open(metaPath, 'w');

    // Header
    const header = Buffer.alloc(8);
    header.write("JSAN", 0);
    header.writeUInt16LE(1, 4);
    header.writeUInt16LE(0, 6);
    await metaHandle.write(header);

    // String Table (empty, length 4)
    const stringTable = Buffer.alloc(4);
    stringTable.writeUInt32LE(0, 0);
    await metaHandle.write(stringTable);

    // Index (empty, length 4)
    const index = Buffer.alloc(4);
    index.writeUInt32LE(0, 0);
    await metaHandle.write(index);

    // Trailer
    const trailer = Buffer.alloc(48);
    trailer.write("TRLR", 0);
    trailer.writeBigUInt64LE(8n, 4);
    trailer.writeBigUInt64LE(0n, 12);
    trailer.writeBigUInt64LE(0n, 20);

    // Set indexOffset to create ~100MB string table requirement
    // 100MB = 100 * 1024 * 1024 = 104857600
    // This is larger than our proposed limit of 64MB
    const hugeOffset = 104857600n + 8n;
    trailer.writeBigUInt64LE(hugeOffset, 28);

    trailer.writeBigUInt64LE(4n, 36);
    trailer.writeUInt32LE(0, 44);

    await metaHandle.write(trailer);
    await metaHandle.close();

    await expect(async () => {
        await BinaryTokenReader.fromFiles(metaPath, binPath);
    }).rejects.toThrow(/Allocation exceeds maximum safe limit/);
  });
});
