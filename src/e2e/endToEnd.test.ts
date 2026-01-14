import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "../binary/writer";
import { FORMAT_MAGIC, TokenType, TRAILER_LENGTH, TRAILER_MAGIC } from "../binary/format";
import { parseJsonStream } from "../parser/streamParser";

describe("end-to-end binary output", () => {
  it("creates a binary file with expected format markers", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-"));
    const inputPath = path.join(tempDir, "input.json");
    const outputBinPath = path.join(tempDir, "output.bin");
    const outputMetaPath = path.join(tempDir, "output.meta");
    const payload = '{"message":"hi"}';

    await writeFile(inputPath, payload, "utf8");

    const readStream = createReadStream(inputPath);
    const tokenStream = createWriteStream(outputBinPath);
    const metadataStream = createWriteStream(outputMetaPath);
    const writer = new BinaryTokenWriter(tokenStream, metadataStream);

    await parseJsonStream(readStream, writer);
    await writer.finalize();
    tokenStream.end();
    metadataStream.end();
    await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

    const metadata = await readFile(outputMetaPath);
    const tokenStreamOutput = await readFile(outputBinPath);
    expect(metadata.subarray(0, 4).equals(FORMAT_MAGIC)).toBe(true);

    const trailer = metadata.subarray(metadata.length - TRAILER_LENGTH);
    expect(trailer.subarray(0, 4).equals(TRAILER_MAGIC)).toBe(true);

    const tokenStreamOffset = Number(trailer.readBigUInt64LE(12));
    const tokenStreamLength = Number(trailer.readBigUInt64LE(20));
    const tokenStreamSlice = tokenStreamOutput.subarray(
      tokenStreamOffset,
      tokenStreamOffset + tokenStreamLength
    );
    expect(tokenStreamSlice.includes(TokenType.StartObject)).toBe(true);
    expect(tokenStreamSlice.includes(TokenType.EndObject)).toBe(true);
  });
});
