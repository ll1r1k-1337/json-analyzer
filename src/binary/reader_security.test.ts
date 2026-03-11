import { describe, expect, it } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType, FORMAT_MAGIC } from "./format.js";

class MaliciousReader {
    size = 1000;
    async read(offset: number, length: number): Promise<Buffer> {
        if (offset === 0) {
            // First byte token type (e.g., Number)
            const b = Buffer.alloc(1);
            b.writeUInt8(TokenType.Number, 0);
            return b;
        } else if (offset === 1) {
            // Length bytes (huge length)
            const b = Buffer.alloc(4);
            b.writeUInt32LE(0x3FFFFFFF, 0); // ~1GB
            return b;
        }
        return Buffer.alloc(length);
    }
}

describe("BinaryTokenReader - Security", () => {
  it("enforces MAX_SAFE_ALLOCATION limit on dynamic reads to prevent OOM DoS", async () => {
    const reader = new MaliciousReader();
    // Use reflection to bypass private constructor
    const bReader = new (BinaryTokenReader as any)(
        reader,
        { magic: FORMAT_MAGIC, version: 1, flags: 0 },
        { tokenStreamOffset: 0n, tokenStreamLength: 100n },
        [],
        []
    );

    await expect(bReader.readTokenAt(0n)).rejects.toThrow(/exceeds safe limit/);
  });
});
