import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { BinaryTokenWriter } from "./writer.js";
import { BinaryTokenReader } from "./reader.js";
import { TokenType } from "./format.js";
import { parseJsonStream } from "../parser/streamParser.js";
import { createReadStream, createWriteStream } from "node:fs";

describe("BinaryTokenReader Security", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should enforce a limit on allocation size for Number tokens", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "json-analyzer-security-"));
    tempDirs.push(tempDir);
    const inputPath = path.join(tempDir, "input.json");
    const outputBinPath = path.join(tempDir, "output.bin");
    const outputMetaPath = path.join(tempDir, "output.meta");

    // 1. Create a valid file
    const payload = JSON.stringify({
      value: 123456 // Number token
    });
    await writeFile(inputPath, payload, "utf8");

    const readStream = createReadStream(inputPath);
    const tokenStream = createWriteStream(outputBinPath);
    const metadataStream = createWriteStream(outputMetaPath);
    const writer = new BinaryTokenWriter(tokenStream, metadataStream);

    await parseJsonStream(readStream, writer);
    await writer.finalize();

    // Ensure streams are finished
    tokenStream.end();
    await new Promise<void>(resolve => tokenStream.on('finish', resolve));
    await new Promise<void>(resolve => metadataStream.on('finish', resolve));

    // 2. Read the binary file
    const binBuffer = await readFile(outputBinPath);

    // 3. Find the token and modify it to be a Number token with huge length.
    // The writer likely wrote a Uint32 or Int32 for 123456.
    // Uint32 = 0x11, Int32 = 0x10.

    let tokenOffset = -1;
    for (let i = 0; i < binBuffer.length; i++) {
        if (binBuffer[i] === TokenType.Uint32 || binBuffer[i] === TokenType.Int32) {
            tokenOffset = i;
            break;
        }
    }

    if (tokenOffset === -1) {
        throw new Error("Could not find Uint32/Int32 token in generated file");
    }

    // Change type to Number (0x07)
    binBuffer.writeUInt8(TokenType.Number, tokenOffset);

    // The next 4 bytes are the value of the integer.
    // We overwrite them with a HUGE length.
    // 100MB is large enough to be suspicious but small enough not to crash the test runner hopefully,
    // but large enough to trigger our limit (which we will set to say 64MB).
    const HUGE_SIZE = 100 * 1024 * 1024;
    binBuffer.writeUInt32LE(HUGE_SIZE, tokenOffset + 1);

    const maliciousBinPath = path.join(tempDir, "malicious.bin");
    await writeFile(maliciousBinPath, binBuffer);

    // 4. Try to read it
    const reader = await BinaryTokenReader.fromFiles(outputMetaPath, maliciousBinPath);
    const trailer = reader.getTrailer();

    // We need to find the offset of the Number token.
    // Since we just modified the file in place, the offsets are the same.
    // But we need to traverse or jump to it.
    // The first token is StartObject (offset 0).
    // Second is Key (offset 1).
    // Third is Number.
    // Let's just traverse.

    let offset = 0n;
    let error: Error | undefined;

    try {
        while (offset < trailer.tokenStreamLength) {
            const { token, byteLength } = await reader.readTokenAt(offset);
            if (token.type === TokenType.Number) {
                // This is where it should fail
            }
            offset += BigInt(byteLength);
        }
    } catch (e: any) {
        error = e;
    }

    await reader.close();

    // Verification:
    // Currently (before fix), this might crash or fail with "Unable to read number bytes" (because file is short)
    // BUT, before failing with "Unable to read...", it attempts to allocate HUGE_SIZE.
    // We can't easily detect the allocation itself without crashing, but we can verify that
    // AFTER our fix, it throws a specific "Allocation limit exceeded" error.

    // For now, let's just log the error.
    console.log("Error:", error?.message);

    // We expect it to fail safely with our new check.
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/exceeds safe allocation limit/);
  });
});
