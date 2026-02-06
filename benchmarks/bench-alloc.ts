import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryTokenReader } from "../src/binary/reader.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "bench-test.bin");
const metaPath = path.join(outputDir, "bench-test.meta");

async function main() {
  console.log("Starting benchmark...");

  const start = process.hrtime.bigint();
  const iterations = 50;

  for (let i = 0; i < iterations; i++) {
    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
    // Just opening the reader forces reading the string table.
    // We can also access the string table to ensure it's loaded,
    // although fromStreamSources awaits the read.
    const strings = reader.getStringTable();
    if (strings.length === 0) throw new Error("No strings loaded");
    await reader.close();
  }

  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1e9;

  console.log(`Performed ${iterations} iterations in ${duration.toFixed(3)}s`);
  console.log(`Average time: ${(duration / iterations * 1000).toFixed(2)}ms`);
}

main().catch(console.error);
