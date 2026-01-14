import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "../dist/index.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(dirname, "data", "sample.json");
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "sample.bin");
const metaPath = path.join(outputDir, "sample.meta");

await mkdir(outputDir, { recursive: true });

const tokenStream = createWriteStream(binPath);
const metadataStream = createWriteStream(metaPath);
const writer = new BinaryTokenWriter(tokenStream, metadataStream);

await parseJsonStream(createReadStream(inputPath), writer);
await writer.finalize();

console.log("Готово:");
console.log(`- Вход: ${inputPath}`);
console.log(`- Токены: ${binPath}`);
console.log(`- Метаданные: ${metaPath}`);
