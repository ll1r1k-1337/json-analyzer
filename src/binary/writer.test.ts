import { PassThrough } from "node:stream";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  OffsetKind,
  TokenType,
  TRAILER_LENGTH,
  TRAILER_MAGIC,
} from "./format.js";

const collectWriterOutput = async (
  run: (writer: BinaryTokenWriter) => Promise<void> | void,
  finalizeTwice = false
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
  if (finalizeTwice) {
    await writer.finalize();
  }
  tokenStream.end();
  metadataStream.end();
  await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

  return { meta: Buffer.concat(metaChunks), token: Buffer.concat(tokenChunks) };
};

const parseStringTable = (buffer: Buffer): string[] => {
  const count = buffer.readUInt32LE(0);
  const values: string[] = [];
  let offset = 4;
  for (let i = 0; i < count; i += 1) {
    const length = buffer.readUInt32LE(offset);
    offset += 4;
    values.push(buffer.toString("utf8", offset, offset + length));
    offset += length;
  }
  return values;
};

const parseIndex = (buffer: Buffer): Array<{ kind: number; offset: bigint }> => {
  const count = buffer.readUInt32LE(0);
  const entries: Array<{ kind: number; offset: bigint }> = [];
  let offset = 4;
  for (let i = 0; i < count; i += 1) {
    const kind = buffer.readUInt8(offset);
    const tokenOffset = buffer.readBigUInt64LE(offset + 1);
    entries.push({ kind, offset: tokenOffset });
    offset += 9;
  }
  return entries;
};

const parseSections = (metadata: Buffer, token: Buffer) => {
  const trailerStart = metadata.length - TRAILER_LENGTH;
  const trailer = metadata.subarray(trailerStart);
  const magic = trailer.subarray(0, 4);

  const stringTableOffset = Number(trailer.readBigUInt64LE(4));
  const tokenStreamOffset = Number(trailer.readBigUInt64LE(12));
  const tokenStreamLength = Number(trailer.readBigUInt64LE(20));
  const indexOffset = Number(trailer.readBigUInt64LE(28));
  const indexLength = Number(trailer.readBigUInt64LE(36));

  return {
    trailerMagic: magic,
    stringTable: metadata.subarray(stringTableOffset, indexOffset),
    tokenStream: token.subarray(tokenStreamOffset, tokenStreamOffset + tokenStreamLength),
    index: metadata.subarray(indexOffset, indexOffset + indexLength),
  };
};

describe("BinaryTokenWriter", () => {
  it("writes the header magic and version", async () => {
    const { meta } = await collectWriterOutput(async (writer) => {
      await writer.writeStartObject();
      await writer.writeEndObject();
    });

    expect(meta.subarray(0, 4).equals(FORMAT_MAGIC)).toBe(true);
    expect(meta.readUInt16LE(4)).toBe(FORMAT_VERSION);
    expect(meta.readUInt16LE(6)).toBe(0);
  });

  it("encodes tokens and string table entries", async () => {
    const { meta, token } = await collectWriterOutput(async (writer) => {
      await writer.writeStartObject();
      await writer.writeKey("a");
      await writer.writeString("b");
      await writer.writeKey("n");
      await writer.writeNumber(42);
      await writer.writeEndObject();
    });

    const { stringTable, tokenStream } = parseSections(meta, token);
    expect(parseStringTable(stringTable)).toEqual(["a", "b", "n"]);

    const expectedTokenStream = Buffer.concat([
      Buffer.from([TokenType.StartObject]),
      Buffer.from([TokenType.Key, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.String, 0x01, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.Key, 0x02, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.Uint8, 42]),
      Buffer.from([TokenType.EndObject]),
    ]);

    expect(tokenStream.equals(expectedTokenStream)).toBe(true);
  });

  it("encodes various number types", async () => {
    const { meta, token } = await collectWriterOutput(async (writer) => {
      await writer.writeStartArray();
      await writer.writeNumber(100); // Uint8
      await writer.writeNumber(-50); // Int8
      await writer.writeNumber(1000); // Uint16
      await writer.writeNumber(-1000); // Int16
      await writer.writeNumber(100000); // Uint32
      await writer.writeNumber(-100000); // Int32
      await writer.writeNumber(1.5); // Float64
      await writer.writeEndArray();
    });

    const { stringTable, tokenStream } = parseSections(meta, token);
    expect(parseStringTable(stringTable)).toEqual(["1.5"]);

    // Verify token types
    let offset = 0;
    expect(tokenStream[offset++]).toBe(TokenType.StartArray);

    expect(tokenStream[offset++]).toBe(TokenType.Uint8);
    expect(tokenStream[offset++]).toBe(100);

    expect(tokenStream[offset++]).toBe(TokenType.Int8);
    expect(tokenStream.readInt8(offset++)).toBe(-50);

    expect(tokenStream[offset++]).toBe(TokenType.Uint16);
    expect(tokenStream.readUInt16LE(offset)).toBe(1000);
    offset += 2;

    expect(tokenStream[offset++]).toBe(TokenType.Int16);
    expect(tokenStream.readInt16LE(offset)).toBe(-1000);
    offset += 2;

    expect(tokenStream[offset++]).toBe(TokenType.Uint32);
    expect(tokenStream.readUInt32LE(offset)).toBe(100000);
    offset += 4;

    expect(tokenStream[offset++]).toBe(TokenType.Int32);
    expect(tokenStream.readInt32LE(offset)).toBe(-100000);
    offset += 4;

    expect(tokenStream[offset++]).toBe(TokenType.NumberRef);
    expect(tokenStream.readUInt32LE(offset)).toBe(0);
    offset += 4;

    expect(tokenStream[offset++]).toBe(TokenType.EndArray);
  });

  it("records offset index entries and finalizes once", async () => {
    const { meta, token } = await collectWriterOutput(
      async (writer) => {
        await writer.writeStartArray();
        await writer.writeStartObject();
        await writer.writeEndObject();
        await writer.writeEndArray();
      },
      true
    );

    const { index, trailerMagic } = parseSections(meta, token);
    expect(trailerMagic.equals(TRAILER_MAGIC)).toBe(true);

    const entries = parseIndex(index);
    expect(entries).toEqual([
      { kind: OffsetKind.Array, offset: 0n },
      { kind: OffsetKind.Object, offset: 1n },
    ]);
  });
});
