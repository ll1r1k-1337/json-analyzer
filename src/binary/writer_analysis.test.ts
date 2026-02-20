import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";
import { TokenType } from "./format.js";
import { once } from "node:events";

describe("BinaryTokenWriter with Analysis", () => {
  it("uses analysis report to optimize arrays", async () => {
    // Manually construct an AnalysisReport
    // The key "data" corresponds to path "data" because:
    // 1. writeStartObject() -> path=[]
    // 2. writeKey("data") -> path=["data"]
    // 3. writeStartArray() -> uses path=["data"]

    const analysis = {
      arrays: new Map([["data", TokenType.Uint8Array]]),
      strings: ["data"],
      stringStats: { uniqueCount: 1, totalCount: 1, uniqueBytes: 4, totalBytes: 4 },
    };

    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const tokenChunks: Buffer[] = [];
    tokenStream.on("data", (chunk) => tokenChunks.push(Buffer.from(chunk)));

    // writer will initialize string table from analysis
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, analysis);

    await writer.writeStartObject();
    await writer.writeKey("data");

    // This should trigger optimization because path is "data"
    await writer.writeStartArray();
    await writer.writeNumber(10);
    await writer.writeNumber(20);
    await writer.writeNumber(30);
    await writer.writeEndArray();

    await writer.writeEndObject();
    await writer.finalize();

    tokenStream.end();
    metadataStream.end();
    await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

    const tokenBuffer = Buffer.concat(tokenChunks);

    // Expected token sequence:
    // StartObject (1 byte)
    // Key (1 + 4 bytes)
    // Uint8Array (1 byte type + 4 bytes length + 3 bytes data)
    // EndObject (1 byte)

    let offset = 0;
    expect(tokenBuffer[offset++]).toBe(TokenType.StartObject);

    expect(tokenBuffer[offset++]).toBe(TokenType.Key);
    // index 0 because "data" is the first string in analysis
    expect(tokenBuffer.readUInt32LE(offset)).toBe(0);
    offset += 4;

    // Optimized array
    expect(tokenBuffer[offset++]).toBe(TokenType.Uint8Array);
    const length = tokenBuffer.readUInt32LE(offset);
    expect(length).toBe(3);
    offset += 4;

    expect(tokenBuffer[offset++]).toBe(10);
    expect(tokenBuffer[offset++]).toBe(20);
    expect(tokenBuffer[offset++]).toBe(30);

    expect(tokenBuffer[offset++]).toBe(TokenType.EndObject);
  });
});
