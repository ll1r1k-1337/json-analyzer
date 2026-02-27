import { describe, it, expect } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType, FORMAT_MAGIC, FORMAT_VERSION, TRAILER_MAGIC, TRAILER_LENGTH, HEADER_LENGTH } from "./format.js";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("BinaryTokenReader Security", () => {
  it("should throw error when reading excessive length token", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    const binPath = path.join(tempDir, "malicious.bin");
    const metaPath = path.join(tempDir, "malicious.meta");

    try {
        const maliciousToken = Buffer.alloc(5);
        maliciousToken.writeUInt8(TokenType.Uint8Array, 0);
        maliciousToken.writeUInt32LE(0x7FFFFFFF, 1); // 2GB
        await writeFile(binPath, maliciousToken);

        const header = Buffer.alloc(HEADER_LENGTH);
        header.write("JSAN", 0);
        header.writeUInt16LE(FORMAT_VERSION, 4);
        header.writeUInt16LE(0, 6);

        // String Table with count 0 needs 4 bytes
        const stringTable = Buffer.alloc(4);
        stringTable.writeUInt32LE(0, 0);

        // Index with count 0 needs 4 bytes
        const index = Buffer.alloc(4);
        index.writeUInt32LE(0, 0);

        const trailer = Buffer.alloc(TRAILER_LENGTH);
        trailer.write("TRLR", 0);

        const stringTableOffset = BigInt(HEADER_LENGTH);
        const indexOffset = BigInt(HEADER_LENGTH + 4);

        trailer.writeBigUInt64LE(stringTableOffset, 4);
        trailer.writeBigUInt64LE(0n, 12);
        trailer.writeBigUInt64LE(5n, 20);
        trailer.writeBigUInt64LE(indexOffset, 28);
        trailer.writeBigUInt64LE(4n, 36); // indexLength = 4
        trailer.writeUInt32LE(0, 44);

        const metaFile = Buffer.concat([header, stringTable, index, trailer]);
        await writeFile(metaPath, metaFile);

        const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);

        // This expects a safeguard to be implemented
        await expect(reader.readTokenAt(0n)).rejects.toThrow(/allocation/i);

        await reader.close();
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
