import { describe, it, expect } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType, FORMAT_MAGIC, TRAILER_MAGIC } from "./format.js";

interface RandomAccessReader {
  size: number;
  read(offset: number, length: number): Promise<Buffer>;
  close?: () => Promise<void>;
}

describe("BinaryTokenReader Security", () => {
  it("throws error when attempting to allocate too much memory for a token", async () => {
    // 1. Create a minimal valid header and trailer
    const header = Buffer.alloc(8);
    // Use the exported constant for magic
    FORMAT_MAGIC.copy(header, 0);
    header.writeUInt16LE(1, 4); // Version
    header.writeUInt16LE(0, 6); // Flags

    const stringTable = Buffer.alloc(4); // count=0
    stringTable.writeUInt32LE(0, 0);

    const index = Buffer.alloc(4); // count=0
    index.writeUInt32LE(0, 0);

    // Construct a "malicious" token stream
    // Token: Uint8Array (type 0x13)
    // Length: 2GB - 1 (0x7FFFFFFF)
    const tokenStream = Buffer.alloc(5);
    tokenStream.writeUInt8(TokenType.Uint8Array, 0);
    tokenStream.writeUInt32LE(0x7FFFFFFF, 1);

    // Assemble file content
    // Order: Header | StringTable | Index | TokenStream | Trailer
    const file = Buffer.concat([
        header,
        stringTable,
        index,
        tokenStream,
        Buffer.alloc(48) // Trailer placeholder
    ]);

    // Calculate offsets
    const stringTableOffset = BigInt(header.length);
    const indexOffset = BigInt(header.length + stringTable.length);
    const tokenStreamOffset = BigInt(header.length + stringTable.length + index.length);
    const tokenStreamLength = BigInt(tokenStream.length);

    // Fill Trailer
    const trailerOffset = file.length - 48;
    const trailer = file.subarray(trailerOffset);
    TRAILER_MAGIC.copy(trailer, 0); // Magic
    trailer.writeBigUInt64LE(stringTableOffset, 4);
    trailer.writeBigUInt64LE(tokenStreamOffset, 12);
    trailer.writeBigUInt64LE(tokenStreamLength, 20);
    trailer.writeBigUInt64LE(indexOffset, 28);
    trailer.writeBigUInt64LE(BigInt(index.length), 36);

    // Mock Reader that throws if length is huge
    const mockReader: RandomAccessReader = {
      size: file.length,
      read: async (offset: number, length: number) => {
        if (length > 1024 * 1024 * 64) { // > 64MB limit
            throw new Error("MOCKED_ALLOCATION_ATTEMPT: " + length);
        }
        // Return valid data if within file bounds
        if (offset >= file.length) return Buffer.alloc(length);
        const end = Math.min(offset + length, file.length);
        const chunk = file.subarray(offset, end);
        if (chunk.length < length) {
             const res = Buffer.alloc(length);
             chunk.copy(res);
             return res;
        }
        return chunk;
      },
      close: async () => {},
    };

    const reader = await BinaryTokenReader.fromBuffer(file);
    (reader as any).source = mockReader;

    await expect(reader.readTokenAt(0n)).rejects.toThrow(/Allocation limit exceeded: array too large/);
  });
});
