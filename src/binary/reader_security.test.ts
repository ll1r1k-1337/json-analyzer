import { describe, expect, it } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  HEADER_LENGTH,
  TRAILER_LENGTH,
  TRAILER_MAGIC,
  TokenType,
} from "./format.js";

const createMockBinaryBuffer = (tokenBytes: Buffer): Buffer => {
  const header = Buffer.alloc(HEADER_LENGTH);
  FORMAT_MAGIC.copy(header, 0);
  header.writeUInt16LE(FORMAT_VERSION, 4);
  header.writeUInt16LE(0, 6);

  const stringTable = Buffer.alloc(4); // 0 strings
  stringTable.writeUInt32LE(0, 0);

  const index = Buffer.alloc(4); // 0 index entries
  index.writeUInt32LE(0, 0);

  const trailer = Buffer.alloc(TRAILER_LENGTH);
  TRAILER_MAGIC.copy(trailer, 0);

  const stringTableOffset = BigInt(HEADER_LENGTH);
  const tokenStreamOffset = stringTableOffset + BigInt(stringTable.length) + BigInt(index.length);
  const tokenStreamLength = BigInt(tokenBytes.length);
  const indexOffset = stringTableOffset + BigInt(stringTable.length);
  const indexLength = BigInt(index.length);

  trailer.writeBigUInt64LE(stringTableOffset, 4);
  trailer.writeBigUInt64LE(tokenStreamOffset, 12);
  trailer.writeBigUInt64LE(tokenStreamLength, 20);
  trailer.writeBigUInt64LE(indexOffset, 28);
  trailer.writeBigUInt64LE(indexLength, 36);
  trailer.writeUInt32LE(0, 44); // Checksum dummy

  return Buffer.concat([header, stringTable, index, tokenBytes, trailer]);
};

describe("BinaryTokenReader Security", () => {
  it("prevents Out-Of-Memory (OOM) by limiting allocation size", async () => {
    // Malicious token: Uint8Array with length = 1GB
    const badToken = Buffer.alloc(5);
    badToken.writeUInt8(TokenType.Uint8Array, 0);
    badToken.writeUInt32LE(1024 * 1024 * 1024, 1); // 1GB length

    const buffer = createMockBinaryBuffer(badToken);
    const reader = await BinaryTokenReader.fromBuffer(buffer);

    await expect(reader.readTokenAt(0n)).rejects.toThrow("exceeds safe limit");

    await reader.close();
  });

  it("prevents out-of-bounds reads in BufferReader", async () => {
      // Token length is longer than the actual token stream size
      const badToken = Buffer.alloc(5);
      badToken.writeUInt8(TokenType.Uint8Array, 0);
      badToken.writeUInt32LE(100, 1); // Length 100, but data is missing

      const buffer = createMockBinaryBuffer(badToken);
      const reader = await BinaryTokenReader.fromBuffer(buffer);

      await expect(reader.readTokenAt(0n)).rejects.toThrow("Read out of bounds");

      await reader.close();
  });
});
