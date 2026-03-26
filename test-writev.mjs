import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "./dist/index.js";
import { BinaryTokenWriter } from "./dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "benchmarks/data");
const outputDir = path.join(dirname, "benchmarks/output");

const recordCount = Number(process.env.RECORDS ?? 5000);

const jsonPath = path.join(dataDir, `generated-${recordCount}.json`);
const binPath = path.join(outputDir, `generated-${recordCount}.bin`);
const metaPath = path.join(outputDir, `generated-${recordCount}.meta`);

const start = process.hrtime.bigint();
const writer = new BinaryTokenWriter(
  createWriteStream(binPath),
  createWriteStream(metaPath)
);

await parseJsonStream(createReadStream(jsonPath), writer);
await writer.finalize();

const end = process.hrtime.bigint();
const { size } = await stat(jsonPath);
const seconds = Number(end - start) / 1e9;
const mb = size / (1024 * 1024);

console.log("Benchmark:");
console.log(`- Speed: ${(mb / seconds).toFixed(2)} MB/s`);
