import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

const createWriter = (options?: { maxUniqueStrings?: number; maxStringTableBytes?: number }) => {
  const tokenStream = new PassThrough();
  const metadataStream = new PassThrough();
  // Pass undefined for analysis report, then options
  return new BinaryTokenWriter(tokenStream, metadataStream, undefined, options);
};

describe("BinaryTokenWriter Security", () => {
  it("throws when maxUniqueStrings limit is exceeded", async () => {
    const writer = createWriter({ maxUniqueStrings: 2 });

    await writer.writeString("a");
    await writer.writeString("b");

    // writing duplicate "a" should be fine
    await writer.writeString("a");

    // writing a 3rd unique string should fail
    await expect(async () => {
        await writer.writeString("c");
    }).rejects.toThrow("String table limit exceeded: unique count");
  });

  it("throws when maxStringTableBytes limit is exceeded", async () => {
    // limit to 10 bytes
    const writer = createWriter({ maxStringTableBytes: 10 });

    // "hello" is 5 bytes
    await writer.writeString("hello");
    // "world" is 5 bytes. Total 10. Should be fine.
    await writer.writeString("world");

    // Next string "!" is 1 byte. Total 11. Should fail.
    await expect(async () => {
        await writer.writeString("!");
    }).rejects.toThrow("String table limit exceeded: byte size");
  });
});
