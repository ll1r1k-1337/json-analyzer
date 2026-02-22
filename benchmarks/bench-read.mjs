import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryTokenReader } from "../dist/binary/reader.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const recordCount = process.env.RECORDS ?? 100000;
const binPath = path.join(outputDir, `generated-${recordCount}.bin`);
const metaPath = path.join(outputDir, `generated-${recordCount}.meta`);

async function main() {
  console.log(`Starting benchmark for ${recordCount} records...`);
  console.log(`Reading from ${binPath}`);

  try {
    const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
    const trailer = reader.getTrailer();
    const totalLength = trailer.tokenStreamLength;
    let offset = 0n;
    let tokenCount = 0;

    // Warmup (optional, but good for JIT)
    // await reader.readTokenAt(0n);

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
  } catch (err) {
    console.error(err);
    if (err.code === 'ENOENT') {
      console.log('File not found. Please run: RECORDS=100000 npm run benchmark:parse');
    }
  }
}

main().catch(console.error);
