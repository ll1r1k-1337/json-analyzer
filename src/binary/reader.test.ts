import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { BinaryTokenWriter } from "./writer.js";
import { BinaryTokenReader } from "./reader.js";
import { TokenType } from "./format.js";
import { parseJsonStream } from "../parser/streamParser.js";

describe("BinaryTokenReader", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("reads tokens correctly with buffering", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-reader-"));
    tempDirs.push(tempDir);
    const inputPath = path.join(tempDir, "input.json");
    const outputBinPath = path.join(tempDir, "output.bin");
    const outputMetaPath = path.join(tempDir, "output.meta");

    const payload = JSON.stringify({
      id: 1,
      name: "test",
      longString: "a".repeat(1000),
      nested: { x: 1, y: 2 }
    });

    await writeFile(inputPath, payload, "utf8");

    const readStream = createReadStream(inputPath);
    const tokenStream = createWriteStream(outputBinPath);
    const metadataStream = createWriteStream(outputMetaPath);
    const writer = new BinaryTokenWriter(tokenStream, metadataStream);

    await parseJsonStream(readStream, writer);
    await writer.finalize();
    tokenStream.end();

    await new Promise<void>(resolve => tokenStream.on('finish', resolve));
    await new Promise<void>(resolve => metadataStream.on('finish', resolve));

    const reader = await BinaryTokenReader.fromFiles(outputMetaPath, outputBinPath);
    const trailer = reader.getTrailer();
    let offset = 0n;
    const tokens = [];

    while (offset < trailer.tokenStreamLength) {
      const { token, byteLength } = await reader.readTokenAt(offset);
      tokens.push(token);
      offset += BigInt(byteLength);
    }

    await reader.close();

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0].type).toBe(TokenType.StartObject);

    const nameKeyIndex = tokens.findIndex(t => t.type === TokenType.Key && t.value === "name");
    expect(nameKeyIndex).toBeGreaterThan(-1);
    expect(tokens[nameKeyIndex + 1]).toEqual({ type: TokenType.String, value: "test" });

    const longStringKeyIndex = tokens.findIndex(t => t.type === TokenType.Key && t.value === "longString");
    expect(longStringKeyIndex).toBeGreaterThan(-1);
    const longStringToken = tokens[longStringKeyIndex + 1];
    if (longStringToken.type === TokenType.String) {
        expect(longStringToken.value).toBe("a".repeat(1000));
    } else {
        throw new Error("Expected String token");
    }
  });

  it("handles concurrent reads safely", async () => {
    const tempDir = tempDirs[0]; // Reuse existing temp dir with files
    const outputBinPath = path.join(tempDir, "output.bin");
    const outputMetaPath = path.join(tempDir, "output.meta");

    const reader = await BinaryTokenReader.fromFiles(outputMetaPath, outputBinPath);

    const count = 50;
    const reads = [];

    // Launch many concurrent reads targeting different tokens or same token
    // Reading 0n (StartObject) multiple times
    for (let i = 0; i < count; i++) {
        reads.push(reader.readTokenAt(0n));
    }

    const results = await Promise.all(reads);
    expect(results.length).toBe(count);
    for (const res of results) {
        expect(res.token.type).toBe(TokenType.StartObject);
    }

    await reader.close();
  });
});
