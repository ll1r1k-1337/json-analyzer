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
    const outputPath = path.join(tempDir, "output.bin");
    const payload = '{"message":"hi"}';

    await writeFile(inputPath, payload, "utf8");

    const readStream = createReadStream(inputPath);
    const writeStream = createWriteStream(outputPath);
    const writer = new BinaryTokenWriter(writeStream);

    await parseJsonStream(readStream, writer);
    await writer.finalize();
    writeStream.end();
    await once(writeStream, "finish");

    const output = await readFile(outputPath);
    expect(output.subarray(0, 4).equals(FORMAT_MAGIC)).toBe(true);

    const trailer = output.subarray(output.length - TRAILER_LENGTH);
    expect(trailer.subarray(0, 4).equals(TRAILER_MAGIC)).toBe(true);

    const tokenStreamOffset = Number(trailer.readBigUInt64LE(12));
    const tokenStreamLength = Number(trailer.readBigUInt64LE(20));
    const tokenStream = output.subarray(tokenStreamOffset, tokenStreamOffset + tokenStreamLength);
    expect(tokenStream.includes(TokenType.StartObject)).toBe(true);
    expect(tokenStream.includes(TokenType.EndObject)).toBe(true);
  });
});
