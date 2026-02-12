import { BinaryTokenReader } from "../dist/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const filename = process.argv[2] || "generated-5000.bin";
const binPath = path.join(outputDir, filename);
const metaPath = path.join(outputDir, filename.replace(".bin", ".meta"));

console.log("Reading from:", binPath);

try {
  const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
  const trailer = reader.getTrailer();
  const totalLength = trailer.tokenStreamLength;

  const start = process.hrtime.bigint();

  let offset = 0n;
  let count = 0;

  while (offset < totalLength) {
    const { token, byteLength } = await reader.readTokenAt(offset);
    offset += BigInt(byteLength);
    count++;
  }

  await reader.close();

  const end = process.hrtime.bigint();
  const seconds = Number(end - start) / 1e9;
  const totalBytes = Number(totalLength);
  const mb = totalBytes / (1024 * 1024);

  console.log("Benchmark Read Completed:");
  console.log(`- Time: ${seconds.toFixed(4)} s`);
  console.log(`- Tokens: ${count}`);
  console.log(`- Speed: ${(mb / seconds).toFixed(2)} MB/s`);
} catch (err) {
  console.error(err.message);
  if (err.code === 'ENOENT') {
    console.log("Tip: run `npm run benchmark:parse` first to generate data.");
  }
}
