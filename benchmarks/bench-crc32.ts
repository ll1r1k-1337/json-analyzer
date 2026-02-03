import { Buffer } from "node:buffer";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

const crc32Original = (buffers: Buffer[]): number => {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const crc32Optimized = (buffers: Buffer[]): number => {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    const len = buffer.length;
    for (let i = 0; i < len; i++) {
      crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const runBenchmark = () => {
  const size = 10 * 1024 * 1024; // 10MB
  const buffer = Buffer.alloc(size, 'a');
  // Fill buffer with some random data to prevent V8 from optimizing too much if it was empty (though 'a' is fine)
  for (let i = 0; i < 1000; i++) {
      buffer[i] = i % 256;
  }
  const buffers = [buffer];

  console.log('Running benchmark...');

  const iterations = 50;

  const startOriginal = performance.now();
  for (let i = 0; i < iterations; i++) {
    crc32Original(buffers);
  }
  const endOriginal = performance.now();
  const timeOriginal = endOriginal - startOriginal;
  console.log(`Original: ${timeOriginal.toFixed(2)}ms`);

  const startOptimized = performance.now();
  for (let i = 0; i < iterations; i++) {
    crc32Optimized(buffers);
  }
  const endOptimized = performance.now();
  const timeOptimized = endOptimized - startOptimized;
  console.log(`Optimized: ${timeOptimized.toFixed(2)}ms`);

  // Verification
  const originalResult = crc32Original(buffers);
  const optimizedResult = crc32Optimized(buffers);
  if (originalResult !== optimizedResult) {
      console.error(`Mismatch! Original: ${originalResult}, Optimized: ${optimizedResult}`);
      process.exit(1);
  } else {
      console.log("Verification passed: Both implementations return the same result.");
  }

  console.log(`Improvement: ${(timeOriginal / timeOptimized).toFixed(2)}x faster`);
};

runBenchmark();
