import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "data");
await mkdir(dataDir, { recursive: true });

const recordCount = Number(process.env.RECORDS ?? 200000);
const jsonPath = path.join(dataDir, `memory-test-${recordCount}.json`);

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
