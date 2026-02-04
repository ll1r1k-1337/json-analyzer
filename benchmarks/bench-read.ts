import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryTokenReader } from "../src/binary/reader.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "generated-5000.bin");
const metaPath = path.join(outputDir, "generated-5000.meta");

async function main() {
  console.log("Starting benchmark...");
  const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
  const trailer = reader.getTrailer();
  const totalLength = trailer.tokenStreamLength;
  let offset = 0n;
  let tokenCount = 0;

  const start = process.hrtime.bigint();

  while (offset < totalLength) {
    const { byteLength } = await reader.readTokenAt(offset);
    offset += BigInt(byteLength);
    tokenCount++;
  }

  const end = process.hrtime.bigint();
  await reader.close();

  const duration = Number(end - start) / 1e9;
  console.log(`Read ${tokenCount} tokens in ${duration.toFixed(3)}s`);
  console.log(`Throughput: ${(tokenCount / duration).toFixed(0)} tokens/s`);
}

main().catch(console.error);
