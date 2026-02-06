import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "../binary/writer.js";
import { TokenType } from "../binary/format.js";
import { parseJsonStream } from "../parser/streamParser.js";

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
    // metadataStream is ended by writer.finalize()
    await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

    const metadata = await readFile(outputMetaPath);
    const tokenStreamOutput = await readFile(outputBinPath);

    // Check JSON metadata
    const json = JSON.parse(metadata.toString('utf8'));
    expect(json.magic).toBe("JSAN");
    expect(Array.isArray(json.stringTable)).toBe(true);

    // Check tokens
    expect(tokenStreamOutput.includes(TokenType.StartObject)).toBe(true);
    expect(tokenStreamOutput.includes(TokenType.EndObject)).toBe(true);
  });
});
