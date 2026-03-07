import { describe, it, expect, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  let tokenStream: PassThrough;
  let metaStream: PassThrough;

  beforeEach(() => {
    tokenStream = new PassThrough();
    metaStream = new PassThrough();
  });

  it("enforces maxUniqueStrings limit", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2,
    });

    // Write 2 unique strings
    await writer.writeString("string1");
    await writer.writeString("string2");

    // Write a duplicate string (should succeed)
    await writer.writeString("string1");

    // Write a 3rd unique string (should throw)
    await expect(async () => {
      await writer.writeString("string3");
    }).rejects.toThrow(/Security Error: Maximum unique strings limit.*exceeded/);
  });

  it("enforces maxStringTableBytes limit with ascii", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 10,
    });

    await writer.writeString("hello"); // 5 bytes
    await writer.writeString("world"); // 5 bytes

    // Total unique bytes is now 10

    // Write duplicate string (should succeed)
    await writer.writeString("hello");

    // Write a new string (should throw)
    await expect(async () => {
      await writer.writeString("!");
    }).rejects.toThrow(/Security Error: Maximum string table bytes limit.*exceeded/);
  });

  it("enforces maxStringTableBytes correctly with utf-8 multi-byte chars", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 6,
    });

    // 🌟 is 4 bytes
    await writer.writeString("🌟");

    // Writing "abc" is 3 bytes, total would be 7 (throws)
    await expect(async () => {
      await writer.writeString("abc");
    }).rejects.toThrow(/Security Error: Maximum string table bytes limit.*exceeded/);
  });
});
