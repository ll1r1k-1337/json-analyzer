import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

const createWriter = (options: any) => {
  const tokenStream = new PassThrough();
  const metadataStream = new PassThrough();
  return new BinaryTokenWriter(tokenStream, metadataStream, undefined, options);
};

describe("BinaryTokenWriter Security Limits", () => {
  it("enforces maxUniqueStrings limit", async () => {
    const writer = createWriter({ maxUniqueStrings: 2 });

    await writer.writeString("one");
    await writer.writeString("two");

    // "one" is repeated, should be fine
    await writer.writeString("one");

    // "three" is the 3rd unique string, should fail
    await expect(async () => {
      await writer.writeString("three");
    }).rejects.toThrow("String table limit exceeded: maxUniqueStrings=2");
  });

  it("enforces maxStringTableBytes limit", async () => {
    // "hello" is 5 bytes. Limit to 9 bytes.
    // 1st string: 5 bytes. OK.
    // 2nd string: 5 bytes. Total 10 bytes > 9 bytes. Fail.
    const writer = createWriter({ maxStringTableBytes: 9 });

    await writer.writeString("hello");

    await expect(async () => {
      await writer.writeString("world");
    }).rejects.toThrow("String table limit exceeded: maxStringTableBytes=9");
  });

  it("handles mixed limits", async () => {
    const writer = createWriter({ maxUniqueStrings: 10, maxStringTableBytes: 5 });

    await expect(async () => {
      await writer.writeString("123456");
    }).rejects.toThrow("String table limit exceeded: maxStringTableBytes=5");
  });
});
