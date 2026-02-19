import { describe, expect, it, vi, afterEach } from "vitest";
import { BinaryTokenReader } from "./reader.js";
import { TokenType } from "./format.js";

// Mock fs/promises
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  open: mocks.open,
}));

describe("BinaryTokenReader Security", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when attempting to read a massive token payload", async () => {
    const metaData = {
      magic: "JSAN",
      version: 1,
      tokenStreamLength: "100", // Length doesn't matter much here, reader trusts offset
      stringTable: [],
      index: [],
      tokenStreamChecksum: 0
    };
    const metaBuffer = Buffer.from(JSON.stringify(metaData));

    // Malicious binary content
    // TokenType.Number (0x07) followed by 0xFFFFFFFF (4GB) length
    const binBuffer = Buffer.alloc(10);
    binBuffer.writeUInt8(TokenType.Number, 0);
    binBuffer.writeUInt32LE(0xFFFFFFFF, 1); // 4GB length
    // The rest is irrelevant because it should crash before reading it

    // Mock file handles
    const createMockHandle = (buffer: Buffer) => ({
      stat: async () => ({ size: buffer.length }),
      read: async (targetBuf: Buffer, offset: number, length: number, position: number) => {
        const bytesRead = Math.min(length, buffer.length - position);
        if (bytesRead > 0) {
          buffer.copy(targetBuf, offset, position, position + bytesRead);
        }
        return { bytesRead, buffer: targetBuf };
      },
      close: async () => {},
    });

    mocks.open.mockImplementation(async (path: string) => {
      if (path.endsWith(".meta")) {
        return createMockHandle(metaBuffer);
      }
      if (path.endsWith(".bin")) {
         // Return a handle that reports a huge size but serves our buffer
         // If we report huge size, reader might be happy.
         const handle = createMockHandle(binBuffer);
         // Override stat to pretend it's huge so checks pass
         handle.stat = async () => ({ size: 10 * 1024 * 1024 * 1024 }); // 10GB
         return handle;
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const reader = await BinaryTokenReader.fromFiles("test.meta", "test.bin");

    // Spy on Buffer.alloc and Buffer.allocUnsafe to verify attempted allocation size
    const allocSpy = vi.spyOn(Buffer, 'alloc');
    const allocUnsafeSpy = vi.spyOn(Buffer, 'allocUnsafe');

    try {
        await reader.readTokenAt(0n);
        throw new Error("Should have thrown");
    } catch (e: any) {
        console.log("Caught expected error:", e.message);

        expect(e.message).toContain("exceeds maximum safe allocation");

        // Check if we tried to allocate the huge buffer
        const hugeAlloc = [
            ...allocSpy.mock.calls,
            ...allocUnsafeSpy.mock.calls
        ].find(args => args[0] === 0xFFFFFFFF);

        if (hugeAlloc) {
           throw new Error("Security check failed: Attempted to allocate 4GB buffer before checking size!");
        } else {
            console.log("Security check passed: Allocation prevented");
        }
    }

    // After our fix, we want it to throw a specific error about allocation limit.
  });
});
