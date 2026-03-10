import { describe, expect, it } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType, FORMAT_MAGIC, FORMAT_VERSION, TRAILER_MAGIC } from "./format.js";
import { CRC32 } from "./crc32.js";

describe("BinaryTokenReader - Security", () => {
  it("throws error when token size exceeds MAX_SAFE_ALLOCATION", async () => {
    // Create a mock token stream with a huge length prefix
    // We'll use a Number token which reads length as 4 bytes
    const hugeLength = 512 * 1024 * 1024 + 1; // MAX_SAFE_ALLOCATION + 1

    // Construct header buffer
    const headerBuffer = Buffer.alloc(8);
    FORMAT_MAGIC.copy(headerBuffer, 0);
    headerBuffer.writeUInt16LE(FORMAT_VERSION, 4);
    headerBuffer.writeUInt16LE(0, 6);

    // Construct string table buffer
    const stringTableBuffer = Buffer.alloc(4);
    stringTableBuffer.writeUInt32LE(0, 0); // 0 strings

    // Construct token stream buffer
    const tokenBuffer = Buffer.alloc(5);
    tokenBuffer.writeUInt8(TokenType.Number, 0);
    tokenBuffer.writeUInt32LE(hugeLength, 1);

    // Construct index buffer
    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0); // 0 entries

    // Construct trailer buffer
    const trailerBuffer = Buffer.alloc(48);
    TRAILER_MAGIC.copy(trailerBuffer, 0);

    const stringTableOffset = BigInt(headerBuffer.length);
    const tokenStreamOffset = stringTableOffset + BigInt(stringTableBuffer.length);
    const indexOffset = tokenStreamOffset + BigInt(tokenBuffer.length);

    trailerBuffer.writeBigUInt64LE(stringTableOffset, 4); // stringTableOffset
    trailerBuffer.writeBigUInt64LE(tokenStreamOffset, 12); // tokenStreamOffset
    trailerBuffer.writeBigUInt64LE(BigInt(tokenBuffer.length), 20); // tokenStreamLength
    trailerBuffer.writeBigUInt64LE(indexOffset, 28); // indexOffset
    trailerBuffer.writeBigUInt64LE(BigInt(indexBuffer.length), 36); // indexLength
    trailerBuffer.writeUInt32LE(0, 44); // checksum

    // Combine all buffers into a single file buffer
    // Single file mode expects: Header -> String Table -> Token Stream -> Index -> Trailer
    const fileBuffer = Buffer.concat([
      headerBuffer,
      stringTableBuffer,
      tokenBuffer,
      indexBuffer,
      trailerBuffer
    ]);

    // Parse the file buffer
    const reader = await BinaryTokenReader.fromBuffer(fileBuffer);

    // Attempt to read the malicious token
    await expect(async () => await reader.readTokenAt(0n)).rejects.toThrow(
      `Token size ${hugeLength} exceeds maximum safe allocation limit`
    );
  });
});
