import { createReadStream, createWriteStream } from "./streams";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { finished } from "node:stream/promises";

describe("streams", () => {
  it("createReadStream reads file content", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "streams-test-"));
    const filePath = path.join(tempDir, "input.txt");
    const content = "Hello World";
    await writeFile(filePath, content);

    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const result = Buffer.concat(chunks).toString("utf8");
    expect(result).toBe(content);
  });

  it("createReadStream aborts with signal", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "streams-test-"));
    const filePath = path.join(tempDir, "input-abort.txt");
    // Create a large file to ensure reading takes some time
    await writeFile(filePath, Buffer.alloc(1024 * 1024));

    const controller = new AbortController();
    const stream = createReadStream(filePath, controller.signal);

    controller.abort();

    await expect(finished(stream)).rejects.toThrow(/aborted/i);
  });

  it("createWriteStream writes file content", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "streams-test-"));
    const filePath = path.join(tempDir, "output.txt");
    const content = "Hello Writer";

    const stream = createWriteStream(filePath);
    stream.write(content);
    stream.end();
    await finished(stream);

    const written = await readFile(filePath, "utf8");
    expect(written).toBe(content);
  });

  it("createWriteStream aborts with signal", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "streams-test-"));
    const filePath = path.join(tempDir, "output-abort.txt");

    const controller = new AbortController();
    const stream = createWriteStream(filePath, controller.signal);

    controller.abort();

    // Writing to aborted stream might not throw immediately, but finished promise should reject
    stream.write("data");

    await expect(finished(stream)).rejects.toThrow(/aborted/i);
  });
});
