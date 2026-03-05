import { describe, it, expect } from "vitest";
import { BinaryTokenReader, BinaryHeader, BinaryTrailer } from "./reader.js";
import { TokenType, FORMAT_MAGIC } from "./format.js";

describe("BinaryTokenReader - Security", () => {
  it("enforces MAX_SAFE_ALLOCATION limit on readBytes", async () => {
    const header: BinaryHeader = { magic: FORMAT_MAGIC, version: 1, flags: 0 };
    const trailer: BinaryTrailer = {
      stringTableOffset: 0n,
      tokenStreamOffset: 0n,
      tokenStreamLength: 100n,
      indexOffset: 0n,
      indexLength: 0n,
      checksum: 0
    };

    // Create a dummy reader that returns a malicious TypedArray length
    const dummySource = {
      size: 100,
      read: async (offset: number, length: number) => {
        if (offset === 0 && length === 1) return Buffer.from([TokenType.Uint8Array]);
        if (offset === 1 && length === 4) {
          const buf = Buffer.alloc(4);
          buf.writeUInt32LE(1000000000, 0); // 1GB length
          return buf;
        }
        return Buffer.alloc(length);
      }
    };

    // Cast as any because constructor is private, but testing internal limits
    const reader = (BinaryTokenReader as any).fromStreamSources
        ? new (BinaryTokenReader as any)(dummySource, header, trailer, [], [])
        : null;

    if (reader) {
        await expect(reader.readTokenAt(0n)).rejects.toThrow("Allocation exceeds safety limit");
    } else {
        throw new Error("Failed to instantiate BinaryTokenReader for testing");
    }
  });
});
