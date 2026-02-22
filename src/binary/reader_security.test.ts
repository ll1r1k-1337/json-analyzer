import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BinaryTokenReader } from './reader';
import { FORMAT_MAGIC, FORMAT_VERSION, TokenType, TRAILER_MAGIC } from './format';

const TEST_FILE = path.join(__dirname, 'security_test.bin');

describe('BinaryTokenReader Security', () => {
  afterAll(() => {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  it('should enforce allocation limits for typed arrays', async () => {
    // 1. Create a malicious file
    // Header
    const header = Buffer.alloc(8);
    FORMAT_MAGIC.copy(header, 0);
    header.writeUInt16LE(FORMAT_VERSION, 4);
    header.writeUInt16LE(0, 6); // flags

    // String Table (Empty, count=0)
    const stringTableBuffer = Buffer.alloc(4);
    stringTableBuffer.writeUInt32LE(0, 0);

    // Token Stream
    // Token: Uint8Array (0x13) + Length (64MB + 1 byte)
    const LARGE_SIZE = 64 * 1024 * 1024 + 1;
    const tokenStream = Buffer.alloc(5);
    tokenStream.writeUInt8(TokenType.Uint8Array, 0);
    tokenStream.writeUInt32LE(LARGE_SIZE, 1);

    // Index (Empty, count=0)
    const indexBuffer = Buffer.alloc(4);
    indexBuffer.writeUInt32LE(0, 0);

    // Trailer
    const trailer = Buffer.alloc(48);
    TRAILER_MAGIC.copy(trailer, 0);

    // Layout: Header | StringTable | TokenStream | Index | Trailer
    // Offsets:
    // Header: 0 (len 8)
    // StringTable: 8 (len 4)
    // TokenStream: 12 (len 5)
    // Index: 17 (len 4)
    // Trailer: 21 (len 48)

    const stringTableOffset = 8n;
    // In single file mode, stringTableLength is calculated as tokenStreamOffset - stringTableOffset
    // So tokenStreamOffset MUST be 12.
    const tokenStreamOffset = 12n;
    const tokenStreamLength = BigInt(tokenStream.length); // 5
    const indexOffset = 17n;
    const indexLength = 4n;
    const checksum = 0;

    // stringTableOffset: u64
    trailer.writeBigUInt64LE(stringTableOffset, 4);
    // tokenStreamOffset: u64
    trailer.writeBigUInt64LE(tokenStreamOffset, 12);
    // tokenStreamLength: u64
    trailer.writeBigUInt64LE(tokenStreamLength, 20);
    // indexOffset: u64
    trailer.writeBigUInt64LE(indexOffset, 28);
    // indexLength: u64
    trailer.writeBigUInt64LE(indexLength, 36);
    // checksum: u32
    trailer.writeUInt32LE(checksum, 44);

    const fileBuffer = Buffer.concat([
        header,
        stringTableBuffer,
        tokenStream,
        indexBuffer,
        trailer
    ]);
    fs.writeFileSync(TEST_FILE, fileBuffer);

    // 2. Try to read it
    const reader = await BinaryTokenReader.fromFile(TEST_FILE);

    // This should fail with a safety error
    await expect(async () => {
        // We are reading token at offset 0 relative to token stream start.
        await reader.readTokenAt(0n);
    }).rejects.toThrow(/exceeds max safe allocation/i);

    await reader.close();
  });
});
