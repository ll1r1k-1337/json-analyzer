import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { BinaryTokenWriter } from "./writer.js";

const createBlackholeStream = () => new Writable({
  write(chunk, encoding, callback) {
    callback();
  }
});

describe("BinaryTokenWriter Security", () => {
  it("enforces maxUniqueStrings limit", async () => {
    const tokenStream = createBlackholeStream();
    const metaStream = createBlackholeStream();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxUniqueStrings: 2
    });

    await writer.writeString("string1");
    await writer.writeString("string2");

    await expect(async () => await writer.writeString("string3"))
      .rejects.toThrow("String table limit exceeded: max 2 unique strings allowed.");
  });

  it("enforces maxStringTableBytes limit", async () => {
    const tokenStream = createBlackholeStream();
    const metaStream = createBlackholeStream();
    const writer = new BinaryTokenWriter(tokenStream, metaStream, undefined, {
      maxStringTableBytes: 10
    });

    await writer.writeString("12345"); // 5 bytes
    await writer.writeString("67890"); // 5 bytes

    await expect(async () => await writer.writeString("1"))
      .rejects.toThrow("String table size limit exceeded: max 10 bytes allowed.");
  });
});
