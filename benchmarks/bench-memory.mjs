import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "../dist/index.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "data");
const outputDir = path.join(dirname, "output");

await mkdir(dataDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const recordCount = Number(process.env.RECORDS ?? 200000);
const jsonPath = path.join(dataDir, `memory-test-${recordCount}.json`);

// Check if file exists, if not generate
try {
  await stat(jsonPath);
  console.log(`File ${jsonPath} exists, using it.`);
} catch {
  console.log(`Generating ${recordCount} records...`);
  const payload = Array.from({ length: recordCount }, (_, index) => ({
    id: index + 1,
    name: `item-${index + 1}`,
    description: `This is a long description for item ${index + 1} to increase the size of the JSON file and test memory usage significantly. ` + "x".repeat(100),
    price: Math.round((index + 1) * 13.37 * 100) / 100,
    tags: ["bench", "json", `group-${index % 10}`],
    meta: {
      active: index % 2 === 0,
      createdAt: new Date(2024, 0, 1 + (index % 28)).toISOString(),
    },
  }));

  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        records: payload,
      },
      null,
      0
    )
  );
  console.log(`Input file created at ${jsonPath}`);
}

const binPath = path.join(outputDir, `memory-test-${recordCount}.bin`);
const metaPath = path.join(outputDir, `memory-test-${recordCount}.meta`);

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
const { size } = await stat(jsonPath);
const seconds = Number(end - start) / 1e9;

global.gc?.(); // Try to GC if exposed

const finalMemory = process.memoryUsage().heapUsed;
console.log(`Final Heap Used: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
console.log(`Max Heap Used: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
console.log(`Time: ${seconds.toFixed(2)} s`);
