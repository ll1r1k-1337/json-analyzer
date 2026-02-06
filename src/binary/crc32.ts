import { crc32 } from 'node:zlib';

export class CRC32 {
  private static TABLE: Uint32Array;

  static {
    CRC32.TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let j = 0; j < 8; j += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      CRC32.TABLE[i] = value >>> 0;
    }
  }

  private state: number;

  constructor(initialState: number = 0) {
    this.state = initialState;
  }

  update(buffer: Buffer): void {
    // Use native node:zlib crc32.
    // The native implementation uses the standard CRC32 algorithm (init=0xFFFFFFFF, xorout=0xFFFFFFFF).
    // Our implementation uses init=0, xorout=0.
    // To adapt, we invert the initial state passed to zlib, and invert the result from zlib.
    this.state = (~crc32(buffer, (~this.state) >>> 0)) >>> 0;
  }

  getRawState(): number {
    return this.state;
  }

  static calculate(buffer: Buffer, initial: number = 0): number {
    return (~crc32(buffer, (~initial) >>> 0)) >>> 0;
  }

  // Combine two states.
  // state1: CRC state after processing prefix.
  // state2: CRC state of suffix (processed with 0 initial state).
  // len2: Length of suffix.
  // Returns: CRC state of (prefix || suffix).
  static combine(state1: number, state2: number, len2: bigint): number {
    // 1. Construct base matrix for 1-byte zero-shift (T^8).
    const row = new Uint32Array(32);
    for (let i = 0; i < 32; i++) {
      let c = (1 << i) >>> 0;
      // Apply 1 byte of zeros
      c = CRC32.TABLE[(c ^ 0) & 0xff] ^ (c >>> 8);
      row[i] = c >>> 0;
    }

    // 2. Matrix exponentiation: resultMat = row ^ len2
    let n = len2;
    let mat = row; // Current power of T^8
    let resultMat = new Uint32Array(32);
    // Identity matrix
    for (let i = 0; i < 32; i++) resultMat[i] = (1 << i) >>> 0;

    while (n > 0n) {
      if ((n & 1n) === 1n) {
        // resultMat = mat * resultMat
        resultMat = CRC32.gf2_matrix_multiply(mat, resultMat) as any;
      }
      n >>= 1n;
      if (n > 0n) {
        // mat = mat * mat
        mat = CRC32.gf2_matrix_multiply(mat, mat) as any;
      }
    }

    // 3. Apply resultMat to state1 (shift state1 by len2 zeros)
    const state1Shifted = CRC32.gf2_matrix_times(resultMat, state1);

    // 4. XOR with state2
    return (state1Shifted ^ state2) >>> 0;
  }

  // result = mat * vec
  private static gf2_matrix_times(mat: Uint32Array, vec: number): number {
    let sum = 0;
    let idx = 0;
    let v = vec;
    while (v !== 0) {
      if (v & 1) {
        sum ^= mat[idx];
      }
      v >>>= 1;
      idx++;
    }
    return sum >>> 0;
  }

  // result = left * right
  private static gf2_matrix_multiply(left: Uint32Array, right: Uint32Array): Uint32Array {
    const dest = new Uint32Array(32);
    for (let i = 0; i < 32; i++) {
      dest[i] = CRC32.gf2_matrix_times(left, right[i]);
    }
    return dest;
  }
}
