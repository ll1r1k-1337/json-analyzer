import { BinaryTokenWriter } from "../src/binary/writer.js";
import { Writable } from "node:stream";

class NullStream extends Writable {
  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void): void {
    callback();
  }
}

async function run() {
  const count = 1_000_000;
  const floats = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    // Generate unique floats to avoid string deduplication benefits
    floats[i] = Math.random() * 1000000 + (i * 0.000001);
  }

  const tokenStream = new NullStream();
  const metadataStream = new NullStream();
  // We need to pass metadataStream as second argument.
  // The constructor signature is (tokenStream, metadataStream, analysis?)
  const writer = new BinaryTokenWriter(tokenStream, metadataStream);

  console.log(`Starting benchmark with ${count} unique floats...`);
  const start = performance.now();

  // writer.writeStartArray(); // Optional, just to be valid JSON structure

  for (let i = 0; i < count; i++) {
    const res = writer.writeNumber(floats[i]);
    if (res) await res;
  }

  // writer.writeEndArray();

  await writer.finalize();

  const end = performance.now();
  const duration = end - start;
  const throughput = count / (duration / 1000);

  console.log(`Wrote ${count} floats in ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${throughput.toFixed(2)} floats/sec`);

  // Also print stats to see how many strings were created
  const stats = writer.getStats();
  console.log('Stats:', JSON.stringify(stats, null, 2));
}

run().catch(console.error);
