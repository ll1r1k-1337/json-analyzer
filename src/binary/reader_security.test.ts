import { describe, it, expect } from "vitest";
import { BinaryTokenReader } from "./reader.js";

class DummyRandomAccessReader {
  constructor(public size: number) {}
  async read(offset: number, length: number): Promise<Buffer> {
    return Buffer.alloc(length);
  }
}

describe("BinaryTokenReader Security", () => {
  it("enforces max allocation size", async () => {
    const dummySource = new DummyRandomAccessReader(100);
    // @ts-ignore
    const secureReader = new BinaryTokenReader(dummySource, {} as any, {} as any, [], []);

    await expect(async () => await secureReader['readBytes'](0n, 512 * 1024 * 1024 + 1))
      .rejects.toThrow("Requested allocation size (536870913 bytes) exceeds maximum safe limit.");
  });

  it("prevents out-of-bounds reads", async () => {
    const dummySource = new DummyRandomAccessReader(100);
    // @ts-ignore
    const secureReader = new BinaryTokenReader(dummySource, {} as any, {} as any, [], []);

    // Try reading past the end of the 100-byte file
    await expect(async () => await secureReader['readBytes'](90n, 20))
      .rejects.toThrow("Read out of bounds: offset 90 + length 20 exceeds file size 100");
  });
});
