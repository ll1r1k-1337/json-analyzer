import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("throws error when maxUniqueStrings limit is exceeded", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();

    // @ts-ignore: testing new options API
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, { maxUniqueStrings: 2 });

    await writer.writeString("a");
    await writer.writeString("b");

    // This should fail
    await expect(async () => await writer.writeString("c")).rejects.toThrow(/Max unique strings limit reached/);
  });

  it("throws error when maxStringTableBytes limit is exceeded", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();

    // @ts-ignore: testing new options API
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, { maxStringTableBytes: 10 });

    await writer.writeString("hello"); // 5 bytes
    await writer.writeString("world"); // 5 bytes

    // This should fail
    await expect(async () => await writer.writeString("!")).rejects.toThrow(/Max string table bytes limit reached/);
  });
});
