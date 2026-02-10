import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

const createWriter = (options: {
  maxUniqueStrings?: number;
  maxStringTableBytes?: number;
}) => {
  const tokenStream = new PassThrough();
  const metadataStream = new PassThrough();
  return new BinaryTokenWriter(tokenStream, metadataStream, undefined, options);
};

describe("BinaryTokenWriter Security", () => {
  it("throws error when maxUniqueStrings limit is exceeded", async () => {
    const writer = createWriter({ maxUniqueStrings: 2 });

    await writer.writeString("one");
    await writer.writeString("two");

    // "one" is reused, should be fine
    await writer.writeString("one");

    // "three" is new, should throw
    await expect(async () => {
        await writer.writeString("three");
    }).rejects.toThrow("Max unique strings limit exceeded (2)");
  });

  it("throws error when maxStringTableBytes limit is exceeded", async () => {
    const writer = createWriter({ maxStringTableBytes: 10 });

    await writer.writeString("12345"); // 5 bytes
    await writer.writeString("67890"); // 5 bytes, total 10 bytes (allowed)

    // "A" -> 1 byte. Total 11 bytes. Should throw.
    await expect(async () => {
        await writer.writeString("A");
    }).rejects.toThrow("Max string table size exceeded (10 bytes)");
  });

  it("enforces limits on object keys", async () => {
     const writer = createWriter({ maxUniqueStrings: 1 });

     await writer.writeStartObject();
     await writer.writeKey("key1");

     await expect(async () => {
         await writer.writeKey("key2");
     }).rejects.toThrow("Max unique strings limit exceeded (1)");
  });

  it("enforces limits on unique floating point numbers", async () => {
    const writer = createWriter({ maxUniqueStrings: 2 });

    // Based on implementation, floats are stored as strings in NumberRef tokens
    await writer.writeNumber(1.1);
    await writer.writeNumber(1.2);

    await expect(async () => {
        await writer.writeNumber(1.3);
    }).rejects.toThrow("Max unique strings limit exceeded (2)");
  });
});
