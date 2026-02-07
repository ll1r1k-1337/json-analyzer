import { PassThrough } from "node:stream";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";
import {
  FORMAT_VERSION,
  OffsetKind,
  TokenType,
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

describe("BinaryTokenWriter", () => {
  it("writes valid JSON metadata", async () => {
    const { meta } = await collectWriterOutput(async (writer) => {
      await writer.writeStartObject();
      await writer.writeEndObject();
    });

    const json = JSON.parse(meta.toString('utf8'));
    expect(json.magic).toBe("JSAN");
    expect(json.version).toBe(FORMAT_VERSION);
    expect(Array.isArray(json.stringTable)).toBe(true);
    expect(Array.isArray(json.index)).toBe(true);
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

    const json = JSON.parse(meta.toString('utf8'));
    expect(json.stringTable).toEqual(["a", "b", "n"]);

    const expectedTokenStream = Buffer.concat([
      Buffer.from([TokenType.StartObject]),
      Buffer.from([TokenType.Key, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.String, 0x01, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.Key, 0x02, 0x00, 0x00, 0x00]),
      Buffer.from([TokenType.Uint8, 42]),
      Buffer.from([TokenType.EndObject]),
    ]);

    expect(token.equals(expectedTokenStream)).toBe(true);
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

    const json = JSON.parse(meta.toString('utf8'));
    expect(json.stringTable).toEqual([]);

    // Verify token types
    let offset = 0;
    const tokenStream = token;
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

    expect(tokenStream[offset++]).toBe(TokenType.Float64);
    expect(tokenStream.readDoubleLE(offset)).toBe(1.5);
    offset += 8;

    expect(tokenStream[offset++]).toBe(TokenType.EndArray);
  });

  it("records offset index entries and finalizes once", async () => {
    const { meta } = await collectWriterOutput(
      async (writer) => {
        await writer.writeStartArray();
        await writer.writeStartObject();
        await writer.writeEndObject();
        await writer.writeEndArray();
      },
      true
    );

    const json = JSON.parse(meta.toString('utf8'));
    expect(json.index).toEqual([
      { kind: OffsetKind.Array, offset: "0" },
      { kind: OffsetKind.Object, offset: "1" },
    ]);
  });
});
