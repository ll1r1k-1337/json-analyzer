import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonStream } from "../dist/parser/streamParser.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";
import { JsonAnalyzer } from "../dist/binary/analyzer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(dirname, "data", "sample.json");
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "sample.bin");
const metaPath = path.join(outputDir, "sample.meta");

await mkdir(outputDir, { recursive: true });

console.log("Analyzing...");
const analyzer = new JsonAnalyzer();
await parseJsonStream(createReadStream(inputPath), analyzer);
const report = analyzer.getReport();
console.log("Analysis complete. Found arrays to optimize:", report.arrays.size);

console.log("Writing binary...");
const tokenStream = createWriteStream(binPath);
const metadataStream = createWriteStream(metaPath);
const writer = new BinaryTokenWriter(tokenStream, metadataStream, report);

await parseJsonStream(createReadStream(inputPath), writer);
await writer.finalize();

console.log("Done:");
console.log(`- Input: ${inputPath}`);
console.log(`- Tokens: ${binPath}`);
console.log(`- Metadata: ${metaPath}`);
