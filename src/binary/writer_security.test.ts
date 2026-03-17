import { describe, it, expect, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter - Security Limits", () => {
  let tokenStream: PassThrough;
  let metaStream: PassThrough;

  beforeEach(() => {
    tokenStream = new PassThrough();
    metaStream = new PassThrough();
  });

  it("should throw when maxUniqueStrings limit is reached", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2,
    });

    await writer.writeStartArray();
    await writer.writeString("string1");
    await writer.writeString("string2");

    // The third unique string should throw
    await expect(async () => {
      await writer.writeString("string3");
    }).rejects.toThrow(/Security limits exceeded: maxUniqueStrings \(2\) reached/);
  });

  it("should allow duplicate strings without increasing unique strings count", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2,
    });

    await writer.writeStartArray();
    await writer.writeString("string1");
    await writer.writeString("string1"); // Duplicate, doesn't increase unique count
    await writer.writeString("string2");

    // Unique count is exactly 2, so this should not throw yet
    const stats = writer.getStats();
    expect(stats.strings.uniqueCount).toBe(2);
    expect(stats.strings.totalCount).toBe(3);

    // The next new unique string should throw
    await expect(async () => {
      await writer.writeString("string3");
    }).rejects.toThrow(/Security limits exceeded: maxUniqueStrings \(2\) reached/);
  });

  it("should throw when maxStringTableBytes limit is exceeded", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 10,
    });

    await writer.writeStartArray();
    await writer.writeString("12345"); // 5 bytes
    await writer.writeString("67890"); // 5 bytes -> Total: 10 bytes

    // The next string would exceed the 10-byte limit
    await expect(async () => {
      await writer.writeString("1");
    }).rejects.toThrow(/Security limits exceeded: maxStringTableBytes \(10\) reached/);
  });

  it("should account for multi-byte characters when checking maxStringTableBytes", async () => {
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 5,
    });

    await writer.writeStartArray();
    // '🌟' is 4 bytes in utf-8
    await writer.writeString("🌟");

    // Adding 2 more bytes should exceed the 5-byte limit
    await expect(async () => {
      await writer.writeString("ab");
    }).rejects.toThrow(/Security limits exceeded: maxStringTableBytes \(5\) reached/);
  });
});
