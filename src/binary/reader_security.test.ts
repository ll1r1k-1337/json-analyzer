import { describe, expect, it, afterAll } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType } from "./format.js";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("BinaryTokenReader - Security Limits", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("rejects token sizes larger than MAX_SAFE_ALLOCATION", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    tempDirs.push(tempDir);

    const metaPath = path.join(tempDir, "test_alloc_limit.meta");
    const binPath = path.join(tempDir, "test_alloc_limit.bin");

    const meta = `{"magic": "JSAN", "version": 1, "tokenStreamLength": 100, "stringTable": [], "index": []}`;
    const bin = Buffer.alloc(10);
    bin.writeUInt8(TokenType.Uint8Array, 0);
    bin.writeUInt32LE(0xFFFFFFFF, 1); // Exceeds safe alloc

    await writeFile(metaPath, meta);
    await writeFile(binPath, bin);

    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);

    await expect(async () => {
        await reader.readTokenAt(0n);
    }).rejects.toThrow("Allocation size exceeds maximum safe limit");

    await reader.close();
  });
});
