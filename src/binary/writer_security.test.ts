import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("enforces maxUniqueStrings limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxUniqueStrings: 5
    });

    for (let i = 0; i < 5; i++) {
      await writer.writeString(`string-${i}`);
    }

    await expect(async () => {
      await writer.writeString("string-5");
    }).rejects.toThrow("String table limit exceeded: maxUniqueStrings");
  });

  it("enforces maxStringTableBytes limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxStringTableBytes: 20
    });

    // "test" is 4 bytes
    await writer.writeString("test1"); // 5 bytes
    await writer.writeString("test2"); // 5 bytes
    await writer.writeString("test3"); // 5 bytes
    await writer.writeString("test4"); // 5 bytes

    // Total 20 bytes used. Next one should fail.
    await expect(async () => {
      await writer.writeString("test5");
    }).rejects.toThrow("String table limit exceeded: maxStringTableBytes");
  });
});
