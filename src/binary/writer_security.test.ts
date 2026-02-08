import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { BinaryTokenWriter } from "./writer.js";

describe("BinaryTokenWriter Security", () => {
  it("should enforce maxUniqueStrings limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxUniqueStrings: 10,
    });

    for (let i = 0; i < 10; i++) {
      const result = writer.writeString(`string-${i}`);
      if (result) await result;
    }

    await expect(async () => {
      const result = writer.writeString("string-11");
      if (result) await result;
    }).rejects.toThrow("String table limit reached");
  });

  it("should enforce maxStringTableBytes limit", async () => {
    const tokenStream = new PassThrough();
    const metadataStream = new PassThrough();
    const writer = new BinaryTokenWriter(tokenStream, metadataStream, undefined, {
      maxStringTableBytes: 50,
    });

    for (let i = 0; i < 10; i++) {
      const result = writer.writeString(`a${i}`);
      if (result) await result;
    }

    await expect(async () => {
      const result = writer.writeString("this-is-a-very-long-string-that-should-exceed-the-limit");
      if (result) await result;
    }).rejects.toThrow("String table byte limit reached");
  });
});
