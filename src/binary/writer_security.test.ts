import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("enforces maxUniqueStrings limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxUniqueStrings: 2
    });

    await writer.writeString("string1");
    await writer.writeString("string2");

    // writing a new unique string should fail
    await expect(async () => {
        await writer.writeString("string3");
    }).rejects.toThrow(/limit reached/);

    // writing an existing string should still work
    await writer.writeString("string1");
  });

  it("enforces maxStringTableBytes limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxStringTableBytes: 10
    });

    await writer.writeString("12345"); // 5 bytes
    await writer.writeString("67890"); // 5 bytes -> total 10 bytes (ok)

    // writing 1 more byte should fail
    await expect(async () => {
        await writer.writeString("1");
    }).rejects.toThrow(/size limit reached/);

    // writing an existing string should still work
    await writer.writeString("12345");
  });
});
