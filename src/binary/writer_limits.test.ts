import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Limits", () => {
  it("enforces maxUniqueStrings limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, {
      maxUniqueStrings: 2,
    });

    await writer.writeString("one");
    await writer.writeString("two");
    await writer.writeString("one"); // Duplicate, should be fine

    // Third unique string should throw
    await expect(writer.writeString("three")).rejects.toThrow(
      "String table limit reached: 2 unique strings"
    );
  });

  it("enforces maxStringTableBytes limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    // "a" is 1 byte. "bb" is 2 bytes. Total 3 bytes.
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, {
      maxStringTableBytes: 3,
    });

    await writer.writeString("a"); // 1 byte
    await writer.writeString("bb"); // 2 bytes, total 3. OK.

    // "c" is 1 byte, total 4. Should throw.
    await expect(writer.writeString("c")).rejects.toThrow(
      "String table byte limit reached: 3 bytes"
    );
  });
});
