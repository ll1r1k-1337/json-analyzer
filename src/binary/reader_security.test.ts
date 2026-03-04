import { describe, expect, it } from "vitest";
import { BinaryTokenReader, MAX_SAFE_ALLOCATION } from "./reader";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  HEADER_LENGTH,
  TRAILER_LENGTH,
  TRAILER_MAGIC,
  TokenType,
} from "./format";

describe("BinaryTokenReader Security", () => {
  it("prevents allocation-based DoS via MAX_SAFE_ALLOCATION", async () => {
    // Create a dummy metadata reader to bootstrap BinaryTokenReader
    const dummyHeader = Buffer.alloc(HEADER_LENGTH);
    dummyHeader.set(FORMAT_MAGIC, 0);
    dummyHeader.writeUInt16LE(FORMAT_VERSION, 4);
    dummyHeader.writeUInt16LE(0, 6); // flags

    const dummyTrailer = Buffer.alloc(TRAILER_LENGTH);
    dummyTrailer.set(TRAILER_MAGIC, 0);
    dummyTrailer.writeBigUInt64LE(100n, 4); // stringTableOffset
    dummyTrailer.writeBigUInt64LE(0n, 12); // tokenStreamOffset
    dummyTrailer.writeBigUInt64LE(100n, 20); // tokenStreamLength
    dummyTrailer.writeBigUInt64LE(100n, 28); // indexOffset
    dummyTrailer.writeBigUInt64LE(0n, 36); // indexLength
    dummyTrailer.writeUInt32LE(0, 44); // checksum

    const stringTableBuffer = Buffer.alloc(4); // 0 strings
    const indexBuffer = Buffer.alloc(4); // 0 entries

    // We only need the metaReader for the fromStreamSources static method
    // which is private, but we can simulate reading a valid file layout.

    // Create a combined buffer that looks like a valid (but empty) file
    const fileBuf = Buffer.concat([
      dummyHeader,
      // tokenStream would go here, length 100
      Buffer.alloc(100),
      // stringTable goes here, offset 100
      stringTableBuffer,
      // index goes here
      indexBuffer,
      // trailer goes here
      dummyTrailer,
    ]);

    // Make sure tokenStreamLength is updated accurately if we need offset checks
    // But since we are manually controlling the reader, we just mock the read stream.

    // Let's create an intentionally malicious token payload via a mock source
    const mockSource = {
      size: 1000,
      async read(offset: number, length: number): Promise<Buffer> {
        // Return a Number token with a length exceeding MAX_SAFE_ALLOCATION
        if (offset === 0) {
          const buf = Buffer.alloc(5);
          buf.writeUInt8(TokenType.Number, 0);
          buf.writeUInt32LE(MAX_SAFE_ALLOCATION + 1, 1);
          return buf;
        }
        return Buffer.alloc(length);
      },
    };

    // Since constructor is private, we bypass it for testing specific read logic
    // Or we can use fromBuffer with a malicious buffer.

    // Easier approach: Mock fromBuffer
    // Easier approach: Mock fromBuffer
    // Structure: Header, StringTable, TokenStream, Index, Trailer
    const headerLen = HEADER_LENGTH;
    const stringTableLen = 4; // empty
    const tokenStreamLen = 5; // our token
    const indexLen = 4; // empty

    const stringTableOffset = headerLen;
    const tokenStreamOffset = stringTableOffset + stringTableLen;
    const indexOffset = tokenStreamOffset + tokenStreamLen;
    const trailerOffset = indexOffset + indexLen;

    const maliciousBuf = Buffer.alloc(trailerOffset + TRAILER_LENGTH);
    maliciousBuf.set(dummyHeader, 0);

    // String table (empty)
    maliciousBuf.writeUInt32LE(0, stringTableOffset);

    // Malicious token
    maliciousBuf.writeUInt8(TokenType.Number, tokenStreamOffset);
    maliciousBuf.writeUInt32LE(MAX_SAFE_ALLOCATION + 1, tokenStreamOffset + 1); // Malicious length

    // Index (empty)
    maliciousBuf.writeUInt32LE(0, indexOffset);

    // Trailer
    const trailer = Buffer.alloc(TRAILER_LENGTH);
    trailer.set(TRAILER_MAGIC, 0);
    trailer.writeBigUInt64LE(BigInt(stringTableOffset), 4);
    trailer.writeBigUInt64LE(BigInt(tokenStreamOffset), 12);
    trailer.writeBigUInt64LE(BigInt(tokenStreamLen), 20);
    trailer.writeBigUInt64LE(BigInt(indexOffset), 28);
    trailer.writeBigUInt64LE(BigInt(indexLen), 36);
    trailer.writeUInt32LE(0, 44);

    maliciousBuf.set(trailer, trailerOffset);

    const reader = await BinaryTokenReader.fromBuffer(maliciousBuf);

    await expect(async () => {
      // Try to read the token. It should fail when attempting to read the payload.
      await reader.readTokenAt(0n);
    }).rejects.toThrow(/exceeds safe limit/);
  });
});
