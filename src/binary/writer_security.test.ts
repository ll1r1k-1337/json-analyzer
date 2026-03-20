import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("prevents OOM DoS by limiting unique strings", async () => {
    const tokenStream = new PassThrough();
    const metaStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2,
    });

    await writer.writeString("string1");
    await writer.writeString("string2");

    // Should throw on the third unique string
    await expect(async () => await writer.writeString("string3")).rejects.toThrow(
      "Security Error: Maximum unique string limit (2) exceeded (OOM protection)"
    );
  });

  it("prevents OOM DoS by limiting string table size", async () => {
    const tokenStream = new PassThrough();
    const metaStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 15, // allow 15 bytes
    });

    await writer.writeString("1234567890"); // 10 bytes
    await writer.writeString("12345"); // 5 bytes

    // Total is 15 bytes. Writing another byte should fail.
    await expect(async () => await writer.writeString("1")).rejects.toThrow(
      "Security Error: Maximum string table size (15 bytes) exceeded (OOM protection)"
    );
  });
});
