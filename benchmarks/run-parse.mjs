import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "../dist/index.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "data");
const outputDir = path.join(dirname, "output");

await mkdir(outputDir, { recursive: true });

const recordCount = Number(process.env.RECORDS ?? 200000);
const jsonPath = path.join(dataDir, `memory-test-${recordCount}.json`);
const binPath = path.join(outputDir, `memory-test-${recordCount}.bin`);
const metaPath = path.join(outputDir, `memory-test-${recordCount}.meta`);

// Check if file exists
try {
  await stat(jsonPath);
} catch {
  console.error(`File ${jsonPath} not found. Run generate-data.mjs first.`);
  process.exit(1);
}

// Force GC if available
global.gc?.();

const initialMemory = process.memoryUsage().heapUsed;
console.log(`Initial Heap Used: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

const start = process.hrtime.bigint();
const writer = new BinaryTokenWriter(
  createWriteStream(binPath),
  createWriteStream(metaPath)
);

let maxMemory = 0;
const memoryInterval = setInterval(() => {
    const mem = process.memoryUsage().heapUsed;
    if (mem > maxMemory) maxMemory = mem;
}, 10);

await parseJsonStream(createReadStream(jsonPath), writer);
await writer.finalize();

clearInterval(memoryInterval);

const end = process.hrtime.bigint();
const seconds = Number(end - start) / 1e9;

global.gc?.(); // Try to GC if exposed

const finalMemory = process.memoryUsage().heapUsed;
console.log(`Final Heap Used: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
console.log(`Max Heap Used: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
console.log(`Time: ${seconds.toFixed(2)} s`);
