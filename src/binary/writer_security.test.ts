import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("should throw when maxUniqueStrings is exceeded", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();

    // We expect this to fail compilation initially because options don't exist yet
    // But once implemented, it should pass.
    // For now, I'll cast it to any to avoid TS errors in this step if I were just testing the concept,
    // but since I'm implementing it, I will write the test assuming the feature exists.

    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxUniqueStrings: 2,
    });

    await writer.writeString("a");
    await writer.writeString("b");

    // This should throw
    await expect(async () => await writer.writeString("c")).rejects.toThrow(/Max unique strings limit exceeded/);
  });

  it("should throw when maxStringTableBytes is exceeded", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();

    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxStringTableBytes: 5,
    });

    await writer.writeString("abc"); // 3 bytes

    // This should throw (3 + 3 = 6 > 5)
    await expect(async () => await writer.writeString("def")).rejects.toThrow(/Max string table bytes limit exceeded/);
  });
});
