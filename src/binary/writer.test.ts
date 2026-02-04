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
    const { meta } = await collectWriterOutput((writer) => {
      writer.writeStartObject();
      writer.writeEndObject();
    });

    expect(meta.subarray(0, 4).equals(FORMAT_MAGIC)).toBe(true);
    expect(meta.readUInt16LE(4)).toBe(FORMAT_VERSION);
    expect(meta.readUInt16LE(6)).toBe(0);
  });

  it("encodes tokens and string table entries", async () => {
    const { meta, token } = await collectWriterOutput((writer) => {
      writer.writeStartObject();
      writer.writeKey("a");
      writer.writeString("b");
      writer.writeKey("n");
      writer.writeNumber(42);
      writer.writeEndObject();
    });

    const { stringTable, tokenStream } = parseSections(meta, token);
    expect(parseStringTable(stringTable)).toEqual(["a", "b", "n", "42"]);

    const expectedTokenStream = Buffer.concat([
      Buffer.from([TokenType.StartObject]),
      Buffer.from([TokenType.Key, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.String, 0x01, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.Key, 0x02, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.NumberRef, 0x03, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.EndObject]),
    ]);

    expect(tokenStream.equals(expectedTokenStream)).toBe(true);
  });

  it("records offset index entries and finalizes once", async () => {
    const { meta, token } = await collectWriterOutput(
      (writer) => {
        writer.writeStartArray();
        writer.writeStartObject();
        writer.writeEndObject();
        writer.writeEndArray();
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
