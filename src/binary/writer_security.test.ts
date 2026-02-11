import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter, type BinaryWriterOptions } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  const createWriter = (options: BinaryWriterOptions) => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    return new BinaryTokenWriter(tokenStream, metadataStream, options);
  };

  it("should throw when maxUniqueStrings limit is exceeded", async () => {
    const writer = createWriter({ maxUniqueStrings: 2 });

    // Write 2 unique strings - should be fine
    await writer.writeString("a");
    await writer.writeString("b");

    // Write 3rd unique string - should throw
    await expect(async () => {
        await writer.writeString("c");
    }).rejects.toThrow(/Security limit exceeded: maxUniqueStrings/);
  });

  it("should throw when maxStringTableBytes limit is exceeded", async () => {
    // "hello" is 5 bytes. Limit 12 bytes.
    // "hello" (5) + "world" (5) = 10 bytes. OK.
    // "!" (1) = 11 bytes. OK.
    // "extra" (5) -> 16 bytes. Fail.

    const writer = createWriter({ maxStringTableBytes: 12 });

    await writer.writeString("hello");
    await writer.writeString("world");
    await writer.writeString("!");

    await expect(async () => {
        await writer.writeString("extra");
    }).rejects.toThrow(/Security limit exceeded: maxStringTableBytes/);
  });
});
