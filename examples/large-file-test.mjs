import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Import from dist (requires build)
import { parseJsonStream, BinaryTokenReader, TokenType } from "../dist/index.js";
import { BinaryTokenWriter } from "../dist/binary/writer.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dirname, "data");
const outputDir = path.join(dirname, "output");
const jsonPath = path.join(dataDir, "large.json");
const binPath = path.join(outputDir, "large.bin");
const metaPath = path.join(outputDir, "large.meta");

// Target ~2.2 GB by default, or override with --size=GB
const args = process.argv.slice(2);
const sizeArg = args.find(arg => arg.startsWith("--size="));
const TARGET_SIZE = sizeArg
  ? parseFloat(sizeArg.split("=")[1]) * 1024 * 1024 * 1024
  : 2.2 * 1024 * 1024 * 1024;

const PAYLOAD_SIZE = 1000;

async function generate() {
  console.log("Generating large JSON file...");
  await mkdir(dataDir, { recursive: true });

  const stream = createWriteStream(jsonPath);

  // Write start of array
  stream.write("[\n");

  let bytesWritten = 2;
  let i = 0;

  const payload = Array.from({ length: PAYLOAD_SIZE }, (_, k) => k);

  // We will stringify the payload once, but formatted without spaces to save space?
  // Actually, standard JSON.stringify adds no spaces.
  const payloadStr = JSON.stringify(payload);

  // To avoid huge memory usage, we check loop condition based on written bytes
  while (bytesWritten < TARGET_SIZE) {
    const item = {
      id: i,
      type: "standard_item",
      payload: [], // placeholder to be replaced string manipulation if we want optimization, but objects are fast enough
      nested: {
        x: i % 100,
        y: (i * 2) % 100,
        description: "nested description text to add some bytes"
      }
    };

    // We construct the string manually to avoid allocating big objects with payload repeatedly?
    // Actually V8 is smart. But let's be safe.
    // Construct parts.

    // JSON structure: {"id":...,"type":"...","payload":[...],"nested":{...}}
    // We can just create the object with the payload array.
    item.payload = payload;

    let str = JSON.stringify(item);

    if (i > 0) {
      stream.write(",\n");
      bytesWritten += 2;
    }

    const canWrite = stream.write(str);
    bytesWritten += str.length;
    i++;

    if (!canWrite) {
      // Handle backpressure
      await new Promise(resolve => stream.once('drain', resolve));
    }

    if (i % 10000 === 0) {
      const mb = bytesWritten / 1024 / 1024;
      process.stdout.write(`\rGenerated ${i} items (${mb.toFixed(2)} MB)...`);
    }
  }

  stream.write("\n]");
  stream.end();

  await new Promise(resolve => stream.once('finish', resolve));
  console.log(`\nGeneration complete. Items: ${i}, Size: ${(bytesWritten / 1024 / 1024 / 1024).toFixed(2)} GB`);
  return i;
}

async function compress() {
  console.log("Compressing to binary...");
  await mkdir(outputDir, { recursive: true });

  const tokenStream = createWriteStream(binPath);
  const metadataStream = createWriteStream(metaPath);
  const writer = new BinaryTokenWriter(tokenStream, metadataStream);

  const inputStream = createReadStream(jsonPath);

  console.time("Compression");

  // Monitor memory
  const interval = setInterval(() => {
    const usage = process.memoryUsage();
    // process.stdout.write(`\rRSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
  }, 1000);

  await parseJsonStream(inputStream, writer);
  await writer.finalize();

  clearInterval(interval);
  console.timeEnd("Compression");
  console.log(""); // Newline

  const binStats = await stat(binPath);
  const metaStats = await stat(metaPath);
  console.log(`Binary size: ${(binStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Meta size: ${(metaStats.size / 1024 / 1024).toFixed(2)} MB`);
}

async function verify(expectedCount) {
  console.log("Verifying binary data...");
  console.time("Verification");

  const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
  const index = reader.getIndex();

  console.log(`Index entries: ${index.length}`);

  // Check index size roughly matches expected structure
  // 1 (root array) + expectedCount * (1 (item) + 1 (payload array) + 1 (nested object)) = 1 + N * 3
  const expectedIndexEntries = 1 + expectedCount * 3;
  console.log(`Expected index entries: ${expectedIndexEntries}`);

  if (index.length !== expectedIndexEntries) {
    console.warn(`Warning: Index length mismatch. Expected ${expectedIndexEntries}, got ${index.length}`);
  }

  // Verify random items
  const sampleCount = 5;
  const numItems = expectedCount;

  console.log(`Sampling ${sampleCount} random items...`);

  for (let k = 0; k < sampleCount; k++) {
    const itemIndex = Math.floor(Math.random() * numItems);

    // Calculate offset index
    // Root Array (0) -> Item 0 (1)
    const entryIndex = 1 + itemIndex * 3;

    if (entryIndex >= index.length) {
      console.error(`Index out of bounds for item ${itemIndex}`);
      continue;
    }

    const offset = index[entryIndex].tokenOffset;

    // Read StartObject
    const { token: tObj, byteLength: lObj } = await reader.readTokenAt(offset);
    if (tObj.type !== TokenType.StartObject) {
       throw new Error(`Expected StartObject at item ${itemIndex}, got ${tObj.type}`);
    }

    // Read Key "id"
    // Since we know the structure, we can expect Key "id" next.
    // However, readTokenAt is random access, not sequential iterator (unless we manually advance).
    // Let's manually advance to read the ID.

    let currentOffset = offset + BigInt(lObj);

    // Read Key
    const { token: tKey, byteLength: lKey } = await reader.readTokenAt(currentOffset);
    if (tKey.type !== TokenType.Key || tKey.value !== "id") {
       throw new Error(`Expected Key 'id' at item ${itemIndex}, got ${tKey.type} ${tKey.value}`);
    }
    currentOffset += BigInt(lKey);

    // Read Value (Number)
    const { token: tVal, byteLength: lVal } = await reader.readTokenAt(currentOffset);
    if (tVal.type !== TokenType.Number) {
        throw new Error(`Expected Number at item ${itemIndex}, got ${tVal.type}`);
    }

    if (Number(tVal.value) !== itemIndex) {
        throw new Error(`Item ${itemIndex} has wrong ID: ${tVal.value}`);
    }

    // console.log(`Verified item ${itemIndex} (ID: ${tVal.value})`);
  }

  await reader.close();
  console.log(`Verified ${sampleCount} items successfully.`);
  console.timeEnd("Verification");
}

async function main() {
  try {
    const count = await generate();
    await compress();
    await verify(count);
    console.log("SUCCESS");
  } catch (e) {
    console.error("FAILED", e);
    process.exit(1);
  }
}

main();
