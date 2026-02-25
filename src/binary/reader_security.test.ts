import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BinaryTokenReader } from "./reader.js";
import { TokenType } from "./format.js";

describe("BinaryTokenReader Security", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("prevents allocation DOS attacks from malicious token lengths", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    tempDirs.push(tempDir);
    const outputBinPath = path.join(tempDir, "bomb.bin");
    const outputMetaPath = path.join(tempDir, "bomb.meta");

    // Create a malicious binary file
    // Token type: Number (0x07)
    // Length: 100MB (valid in Node, but should be rejected by policy)
    const length = 100 * 1024 * 1024;
    const bombBuffer = Buffer.alloc(5);
    bombBuffer.writeUInt8(TokenType.Number, 0);
    bombBuffer.writeUInt32LE(length, 1);
    await writeFile(outputBinPath, bombBuffer);

    // Create a valid metadata file
    const meta = {
      magic: "JSAN",
      version: 1,
      tokenStreamLength: 5,
      stringTable: [],
      index: []
    };
    await writeFile(outputMetaPath, JSON.stringify(meta));

    const reader = await BinaryTokenReader.fromFiles(outputMetaPath, outputBinPath);

    // Attempt to read the malicious token
    // Should throw a security error BEFORE allocation
    await expect(async () => {
      await reader.readTokenAt(0n);
    }).rejects.toThrow("Token length exceeds safe allocation limit");

    await reader.close();
  });
});
