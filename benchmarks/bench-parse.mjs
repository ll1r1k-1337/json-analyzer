import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "../dist/index.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "data");
const outputDir = path.join(dirname, "output");

await mkdir(dataDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const recordCount = Number(process.env.RECORDS ?? 5000);
const payload = Array.from({ length: recordCount }, (_, index) => ({
  id: index + 1,
  name: `item-${index + 1}`,
  price: Math.round((index + 1) * 13.37 * 100) / 100,
  tags: ["bench", "json", `group-${index % 10}`],
  meta: {
    active: index % 2 === 0,
    createdAt: new Date(2024, 0, 1 + (index % 28)).toISOString(),
  },
}));

const jsonPath = path.join(dataDir, `generated-${recordCount}.json`);
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

console.log("Benchmark завершен:");
console.log(`- Входной файл: ${jsonPath}`);
console.log(`- Размер: ${mb.toFixed(2)} MB`);
console.log(`- Время: ${seconds.toFixed(2)} s`);
console.log(`- Скорость: ${(mb / seconds).toFixed(2)} MB/s`);
console.log(`- Токены: ${binPath}`);
console.log(`- Метаданные: ${metaPath}`);
