import { describe, expect, it } from "vitest";
import { BinaryTokenReader, MAX_SAFE_ALLOCATION } from "./reader.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("BinaryTokenReader - Security", () => {
  it("throws when token byte length exceeds MAX_SAFE_ALLOCATION in FileReader source", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-reader-sec-"));
    const metaPath = path.join(tempDir, "meta.json");
    const binPath = path.join(tempDir, "data.bin");

    await writeFile(
      metaPath,
      JSON.stringify({
        magic: "JSAN",
        version: 1,
        stringTable: [],
        index: [],
        tokenStreamLength: "100", // Trick the reader
      })
    );

    const buf = Buffer.alloc(5);
    buf.writeUInt8(0x13, 0); // Uint8Array
    buf.writeUInt32LE(MAX_SAFE_ALLOCATION + 1024, 1);

    await writeFile(binPath, buf);

    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);

    await expect(reader.readTokenAt(0n)).rejects.toThrowError(
      /exceeds MAX_SAFE_ALLOCATION/
    );

    await reader.close();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("safely truncates allocation when length exceeds remaining file size in FileReader", async () => {
    // Tests that FileReader gracefully truncates the requested buffer instead of trying to allocate the full amount
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-reader-sec-"));
    const metaPath = path.join(tempDir, "meta.json");
    const binPath = path.join(tempDir, "data.bin");

    await writeFile(
      metaPath,
      JSON.stringify({
        magic: "JSAN",
        version: 1,
        stringTable: [],
        index: [],
        tokenStreamLength: "100", // Trick the reader
      })
    );

    const buf = Buffer.alloc(5);
    buf.writeUInt8(0x13, 0); // Uint8Array
    // Very large length (but smaller than MAX_SAFE_ALLOCATION) that would otherwise allocate
    // if not bounded by file size. Let's use 200MB.
    const requestSize = 200 * 1024 * 1024;
    buf.writeUInt32LE(requestSize, 1);

    await writeFile(binPath, buf);

    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);

    // The reader requests `requestSize` bytes for the token data, but the file is only 5 bytes long.
    // So FileReader should only allocate 0 bytes for data (since it truncates to Math.max(0, size - offset)),
    // returning an empty or short buffer, which then causes readBytes to throw "Unable to read typed array data"
    // instead of an OOM.
    await expect(reader.readTokenAt(0n)).rejects.toThrowError(
      /Unable to read typed array data/
    );

    await reader.close();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });
});
