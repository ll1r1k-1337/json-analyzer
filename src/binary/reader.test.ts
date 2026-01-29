import { PassThrough } from "node:stream";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer";
import { BinaryTokenReader } from "./reader";
import {
  TokenType,
  FORMAT_MAGIC,
  FORMAT_VERSION,
  TRAILER_MAGIC,
  TRAILER_LENGTH,
  HEADER_LENGTH,
} from "./format";

// Helper to generate writer output
const collectWriterOutput = async (
  run: (writer: BinaryTokenWriter) => Promise<void> | void
): Promise<{ meta: Buffer; token: Buffer }> => {
  const tokenStream = new PassThrough();
  const metadataStream = new PassThrough();
  const tokenChunks: Buffer[] = [];
  const metaChunks: Buffer[] = [];
  tokenStream.on("data", (chunk) => tokenChunks.push(Buffer.from(chunk)));
  metadataStream.on("data", (chunk) => metaChunks.push(Buffer.from(chunk)));

  const writer = new BinaryTokenWriter(tokenStream, metadataStream);
  await run(writer);
  await writer.finalize();
  tokenStream.end();
  metadataStream.end();
  await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

  return { meta: Buffer.concat(metaChunks), token: Buffer.concat(tokenChunks) };
};

// Helper to construct a single-file binary format expected by BinaryTokenReader
const createSingleFileBuffer = async (
  run: (writer: BinaryTokenWriter) => Promise<void> | void
): Promise<Buffer> => {
  const { meta, token } = await collectWriterOutput(run);

  // Meta: [Header (8)] [StringTable] [Index] [Trailer (48)]

  // 1. Header
  const header = meta.subarray(0, HEADER_LENGTH);

  // Parse original trailer to find offsets
  const originalTrailer = meta.subarray(meta.length - TRAILER_LENGTH);
  const stringTableOffsetOld = Number(originalTrailer.readBigUInt64LE(4));
  const indexOffsetOld = Number(originalTrailer.readBigUInt64LE(28));
  const indexLength = Number(originalTrailer.readBigUInt64LE(36));

  // 2. StringTable
  const stringTable = meta.subarray(stringTableOffsetOld, indexOffsetOld);

  // 3. Index
  const index = meta.subarray(indexOffsetOld, indexOffsetOld + indexLength);

  // 4. TokenStream is `token` buffer

  // Construct new layout:
  // [Header] [StringTable] [TokenStream] [Index] [Trailer]

  const newStringTableOffset = BigInt(header.length);
  const newTokenStreamOffset = newStringTableOffset + BigInt(stringTable.length);
  const newTokenStreamLength = BigInt(token.length);
  const newIndexOffset = newTokenStreamOffset + newTokenStreamLength;
  const newIndexLength = BigInt(index.length);

  const trailer = Buffer.alloc(TRAILER_LENGTH);
  TRAILER_MAGIC.copy(trailer, 0);
  trailer.writeBigUInt64LE(newStringTableOffset, 4);
  trailer.writeBigUInt64LE(newTokenStreamOffset, 12);
  trailer.writeBigUInt64LE(newTokenStreamLength, 20);
  trailer.writeBigUInt64LE(newIndexOffset, 28);
  trailer.writeBigUInt64LE(newIndexLength, 36);
  trailer.writeUInt32LE(0, 44); // Checksum (ignored)

  return Buffer.concat([header, stringTable, token, index, trailer]);
};

describe("BinaryTokenReader", () => {
  it("reads header and trailer correctly", async () => {
    const buffer = await createSingleFileBuffer((writer) => {
      writer.writeStartObject();
      writer.writeEndObject();
    });

    const reader = await BinaryTokenReader.fromBuffer(buffer);
    const header = reader.getHeader();

    expect(header.magic.equals(FORMAT_MAGIC)).toBe(true);
    expect(header.version).toBe(FORMAT_VERSION);

    const trailer = reader.getTrailer();
    expect(trailer.tokenStreamLength).toBe(2n); // StartObject + EndObject = 1 + 1 bytes
  });

  it("reads string table", async () => {
    const buffer = await createSingleFileBuffer((writer) => {
      writer.writeString("hello");
      writer.writeKey("world");
    });

    const reader = await BinaryTokenReader.fromBuffer(buffer);
    const strings = reader.getStringTable();

    expect(strings).toEqual(["hello", "world"]);
  });

  it("reads tokens correctly", async () => {
    const buffer = await createSingleFileBuffer((writer) => {
      writer.writeStartObject();
      writer.writeKey("foo");
      writer.writeString("bar");
      writer.writeNumber(123);
      writer.writeBoolean(true);
      writer.writeNull();
      writer.writeEndObject();
    });

    const reader = await BinaryTokenReader.fromBuffer(buffer);
    const trailer = reader.getTrailer();
    const tokenLength = trailer.tokenStreamLength;

    let offset = 0n;
    const tokens: any[] = [];

    while (offset < tokenLength) {
      const { token, byteLength } = await reader.readTokenAt(offset);
      tokens.push(token);
      offset += BigInt(byteLength);
    }

    expect(tokens).toMatchObject([
      { type: TokenType.StartObject },
      { type: TokenType.Key, value: "foo" },
      { type: TokenType.String, value: "bar" },
      { type: TokenType.Number, value: "123" },
      { type: TokenType.True, value: true },
      { type: TokenType.Null, value: null },
      { type: TokenType.EndObject },
    ]);
  });

  it("reads index", async () => {
     const buffer = await createSingleFileBuffer((writer) => {
        writer.writeStartArray(); // Offset 0
        writer.writeStartObject(); // Offset 1
        writer.writeEndObject();
        writer.writeEndArray();
     });

     const reader = await BinaryTokenReader.fromBuffer(buffer);
     const index = reader.getIndex();

     expect(index).toHaveLength(2);
     // Note: offsets are relative to token stream start
     expect(index[0].kind).toBe(2); // Array
     expect(index[0].tokenOffset).toBe(0n);

     expect(index[1].kind).toBe(1); // Object
     expect(index[1].tokenOffset).toBe(1n);
  });

  it("throws error if token stream precedes string table (sanity check for format)", async () => {
     const buffer = Buffer.alloc(HEADER_LENGTH + TRAILER_LENGTH);
     FORMAT_MAGIC.copy(buffer, 0);
     buffer.writeUInt16LE(FORMAT_VERSION, 4);

     const trailerOffset = HEADER_LENGTH;
     TRAILER_MAGIC.copy(buffer, trailerOffset);
     // Set tokenStreamOffset (e.g. 0) < stringTableOffset (e.g. 10)
     buffer.writeBigUInt64LE(10n, trailerOffset + 4); // stringTableOffset
     buffer.writeBigUInt64LE(0n, trailerOffset + 12); // tokenStreamOffset

     await expect(BinaryTokenReader.fromBuffer(buffer)).rejects.toThrow("Token stream offset precedes string table");
  });
});
