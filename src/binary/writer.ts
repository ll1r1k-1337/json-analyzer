import { Writable } from "node:stream";
import { once } from "node:events";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  HEADER_LENGTH,
  OffsetKind,
  TokenType,
  TRAILER_MAGIC,
  TRAILER_LENGTH,
} from "./format.js";
import type { BinaryWriter } from "../parser/streamParser.js";
import { CRC32 } from "./crc32.js";
import type { AnalysisReport } from "./analyzer.js";

export type WriterStats = {
  tokens: {
    objects: number;
    arrays: number;
    keys: number;
    strings: number;
    numbers: number;
    booleans: number;
    nulls: number;
  };
  strings: {
    uniqueCount: number;
    totalCount: number;
    uniqueBytes: number;
    totalBytes: number;
  };
};

const DEFAULT_BUFFER_SIZE = 64 * 1024;
const TOKEN_BUFFER_SIZE = 512 * 1024;

type OffsetEntry = {
  kind: OffsetKind;
  offset: string; // Changed to string for JSON serialization
};

type Container =
  | { type: 'root' }
  | { type: 'object' }
  | { type: 'array'; index: number };

class BufferedStreamWriter {
  private buffer: Buffer;
  private offset = 0;

  constructor(
    private stream: Writable,
    private size = DEFAULT_BUFFER_SIZE
  ) {
    this.buffer = Buffer.allocUnsafe(this.size);
  }

  private async flushBuffer(): Promise<void> {
    if (this.offset === 0) {
      return;
    }
    const slice = this.buffer.subarray(0, this.offset);
    this.offset = 0;
    if (!this.stream.write(slice)) {
      await once(this.stream, "drain");
    }
  }

  write(buffer: Buffer): void | Promise<void> {
    let remaining = buffer;
    while (remaining.length > 0) {
      const available = this.size - this.offset;
      if (remaining.length >= this.size) {
        // If buffer is full, we must flush. This requires async.
        const promise = this.flushBuffer().then(async () => {
          if (!this.stream.write(remaining)) {
            await once(this.stream, "drain");
          }
        });
        return promise;
      }
      if (remaining.length > available) {
        const slice = remaining.subarray(0, available);
        slice.copy(this.buffer, this.offset);
        this.offset += slice.length;
        remaining = remaining.subarray(available);
        const promise = this.flushBuffer().then(() => this.write(remaining));
        return promise;
      }
      remaining.copy(this.buffer, this.offset);
      this.offset += remaining.length;
      remaining = Buffer.alloc(0);
    }
  }

  async end(): Promise<void> {
    await this.flushBuffer();
  }
}

export class BinaryTokenWriter implements BinaryWriter {
  private readonly offsets: OffsetEntry[] = [];
  private readonly stringIndex = new Map<string, number>();
  private readonly strings: string[] = [];
  private tokenLength = 0;
  private finalized = false;

  private tokenWriter: BufferedStreamWriter;
  private crcTokens: CRC32;

  // Path tracking
  private readonly path: (string | number)[] = [];
  private readonly containers: Container[] = [{ type: 'root' }];

  // Optimization state
  private optimizedArrayType: TokenType | null = null;
  private bufferedNumbers: number[] = [];

  private stats: WriterStats = {
    tokens: {
      objects: 0,
      arrays: 0,
      keys: 0,
      strings: 0,
      numbers: 0,
      booleans: 0,
      nulls: 0,
    },
    strings: {
      uniqueCount: 0,
      totalCount: 0,
      uniqueBytes: 0,
      totalBytes: 0,
    },
  };

  private currentBuffer: Buffer = Buffer.allocUnsafe(TOKEN_BUFFER_SIZE);
  private cursor = 0;

  constructor(
    tokenStream: Writable,
    private metadataStream: Writable,
    private analysis?: AnalysisReport
  ) {
    this.tokenWriter = new BufferedStreamWriter(tokenStream);
    this.crcTokens = new CRC32();

    if (analysis) {
      this.strings = [...analysis.strings];
      this.strings.forEach((s, i) => this.stringIndex.set(s, i));
      this.stats.strings = { ...analysis.stringStats };
    }
  }

  getStats(): WriterStats {
    return this.stats;
  }

  private currentContainer(): Container {
    return this.containers[this.containers.length - 1];
  }

  private beforeValue(): void {
    const container = this.currentContainer();
    if (container.type === 'array') {
      container.index++;
      this.path.push(container.index);
    }
  }

  private afterValue(): void {
    const container = this.currentContainer();
    if (container.type === 'array') {
      this.path.pop();
    } else if (container.type === 'object') {
       this.path.pop();
    }
  }

  private async flushCurrentBuffer(): Promise<void> {
      if (this.cursor > 0) {
        const chunk = this.currentBuffer.subarray(0, this.cursor);
        this.crcTokens.update(chunk);
        await this.tokenWriter.write(chunk);
        this.tokenLength += this.cursor;
        this.cursor = 0;
      }
  }

  private abortOptimization(): void | Promise<void> {
    if (!this.optimizedArrayType) return;

    // Write the deferred StartArray token
    this.stats.tokens.arrays += 1;
    this.recordOffset(OffsetKind.Array);

    // We need to write StartArray, but we are inside a method call (e.g. writeString)
    // We should ensure space and write directly.

    const writeOps: (() => void | Promise<void>)[] = [];

    // StartArray
    writeOps.push(() => {
        const result = this.ensureSpace(1);
        if (result) return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
            this.cursor += 1;
        });
        this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
        this.cursor += 1;
    });

    // Buffered numbers
    for (const num of this.bufferedNumbers) {
        writeOps.push(() => this.writeStandardNumber(num));
    }

    this.optimizedArrayType = null;
    this.bufferedNumbers = [];

    // Execute ops sequentially
    let promise: Promise<void> | void = undefined;
    for (const op of writeOps) {
        if (promise) {
            promise = promise.then(op);
        } else {
            const res = op();
            if (res) promise = res;
        }
    }
    return promise;
  }

  writeStartObject(): void | Promise<void> {
    if (this.optimizedArrayType) {
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeStartObject());
    }

    this.beforeValue();
    this.stats.tokens.objects += 1;
    this.recordOffset(OffsetKind.Object);
    this.containers.push({ type: 'object' });

    const result = this.ensureSpace(1);
    if (result) {
      return result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.StartObject, this.cursor);
        this.cursor += 1;
      });
    }
    this.currentBuffer.writeUInt8(TokenType.StartObject, this.cursor);
    this.cursor += 1;
  }

  writeEndObject(): void | Promise<void> {
    const container = this.containers.pop();
    if (!container || container.type !== 'object') throw new Error("Unbalanced object");

    const result = this.ensureSpace(1);
    let promise: Promise<void> | void = undefined;
    if (result) {
      promise = result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.EndObject, this.cursor);
        this.cursor += 1;
      });
    } else {
      this.currentBuffer.writeUInt8(TokenType.EndObject, this.cursor);
      this.cursor += 1;
    }

    if (promise) return promise.then(() => this.afterValue());
    this.afterValue();
  }

  writeStartArray(): void | Promise<void> {
    if (this.optimizedArrayType) {
        // Nested array inside optimized array -> abort
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeStartArray());
    }

    this.beforeValue();

    // Check analysis
    if (this.analysis) {
        const pathStr = this.path.join('/');
        const type = this.analysis.arrays.get(pathStr);
        if (type) {
            this.optimizedArrayType = type;
            this.bufferedNumbers = [];
            this.containers.push({ type: 'array', index: -1 });
            // Do NOT write StartArray token
            return;
        }
    }

    this.stats.tokens.arrays += 1;
    this.recordOffset(OffsetKind.Array);
    this.containers.push({ type: 'array', index: -1 });

    const result = this.ensureSpace(1);
    if (result) {
      return result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
        this.cursor += 1;
      });
    }
    this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
    this.cursor += 1;
  }

  writeEndArray(): void | Promise<void> {
    const container = this.containers.pop();
    if (!container || container.type !== 'array') throw new Error("Unbalanced array");

    if (this.optimizedArrayType) {
        // End of optimized array
        const type = this.optimizedArrayType;
        const data = this.bufferedNumbers;
        this.optimizedArrayType = null;
        this.bufferedNumbers = [];

        const p = this.writeTypedArray(type, data);
        if (p) return p.then(() => this.afterValue());
        this.afterValue();
        return;
    }

    const result = this.ensureSpace(1);
    let promise: Promise<void> | void = undefined;
    if (result) {
      promise = result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.EndArray, this.cursor);
        this.cursor += 1;
      });
    } else {
      this.currentBuffer.writeUInt8(TokenType.EndArray, this.cursor);
      this.cursor += 1;
    }

    if (promise) return promise.then(() => this.afterValue());
    this.afterValue();
  }

  private writeTypedArray(type: TokenType, data: number[]): void | Promise<void> {
      // Create buffer for the TypedArray
      let byteLength = 0;
      let buffer: Buffer;

      switch(type) {
          case TokenType.Uint8Array:
          case TokenType.Int8Array:
              byteLength = data.length;
              buffer = Buffer.allocUnsafe(5 + byteLength); // Type(1) + Length(4) + Data
              buffer.writeUInt8(type, 0);
              buffer.writeUInt32LE(byteLength, 1);
              if (type === TokenType.Uint8Array) {
                  for(let i=0; i<data.length; i++) buffer.writeUInt8(data[i], 5+i);
              } else {
                  for(let i=0; i<data.length; i++) buffer.writeInt8(data[i], 5+i);
              }
              break;
          case TokenType.Uint16Array:
          case TokenType.Int16Array:
              byteLength = data.length * 2;
              buffer = Buffer.allocUnsafe(5 + byteLength);
              buffer.writeUInt8(type, 0);
              buffer.writeUInt32LE(byteLength, 1);
              if (type === TokenType.Uint16Array) {
                  for(let i=0; i<data.length; i++) buffer.writeUInt16LE(data[i], 5+i*2);
              } else {
                  for(let i=0; i<data.length; i++) buffer.writeInt16LE(data[i], 5+i*2);
              }
              break;
          case TokenType.Uint32Array:
          case TokenType.Int32Array:
              byteLength = data.length * 4;
              buffer = Buffer.allocUnsafe(5 + byteLength);
              buffer.writeUInt8(type, 0);
              buffer.writeUInt32LE(byteLength, 1);
              if (type === TokenType.Uint32Array) {
                  for(let i=0; i<data.length; i++) buffer.writeUInt32LE(data[i], 5+i*4);
              } else {
                  for(let i=0; i<data.length; i++) buffer.writeInt32LE(data[i], 5+i*4);
              }
              break;
          case TokenType.Float64Array:
              byteLength = data.length * 8;
              buffer = Buffer.allocUnsafe(5 + byteLength);
              buffer.writeUInt8(type, 0);
              buffer.writeUInt32LE(byteLength, 1);
              for(let i=0; i<data.length; i++) buffer.writeDoubleLE(data[i], 5+i*8);
              break;
          case TokenType.Float32Array:
              byteLength = data.length * 4;
              buffer = Buffer.allocUnsafe(5 + byteLength);
              buffer.writeUInt8(type, 0);
              buffer.writeUInt32LE(byteLength, 1);
              for(let i=0; i<data.length; i++) buffer.writeFloatLE(data[i], 5+i*4);
              break;
          default:
              throw new Error("Unknown TypedArray type");
      }

      // We are writing a large blob. Flush current buffer first.
      return this.flushCurrentBuffer().then(async () => {
         this.crcTokens.update(buffer);
         await this.tokenWriter.write(buffer);
         this.tokenLength += buffer.length;
      });
  }

  writeKey(key: string): void | Promise<void> {
    if (this.optimizedArrayType) {
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeKey(key));
    }

    this.stats.tokens.keys += 1;
    const index = this.registerString(key);
    this.path.push(key); // Push key

    const result = this.ensureSpace(5);
    if (result) {
      return result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.Key, this.cursor);
        this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
        this.cursor += 5;
      });
    }
    this.currentBuffer.writeUInt8(TokenType.Key, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  writeString(value: string): void | Promise<void> {
    if (this.optimizedArrayType) {
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeString(value));
    }

    this.beforeValue();

    this.stats.tokens.strings += 1;
    const index = this.registerString(value);
    const result = this.ensureSpace(5);
    let promise: Promise<void> | void = undefined;
    if (result) {
      promise = result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.String, this.cursor);
        this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
        this.cursor += 5;
      });
    } else {
      this.currentBuffer.writeUInt8(TokenType.String, this.cursor);
      this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
      this.cursor += 5;
    }

    if (promise) return promise.then(() => this.afterValue());
    this.afterValue();
  }

  private writeStandardNumber(value: number | string): void | Promise<void> {
    this.stats.tokens.numbers += 1;
    const num = Number(value);

    if (Number.isInteger(num)) {
      if (num >= 0 && num <= 255) {
        const result = this.ensureSpace(2);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Uint8, this.cursor);
            this.currentBuffer.writeUInt8(num, this.cursor + 1);
            this.cursor += 2;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Uint8, this.cursor);
        this.currentBuffer.writeUInt8(num, this.cursor + 1);
        this.cursor += 2;
        return;
      }
      if (num >= -128 && num <= 127) {
        const result = this.ensureSpace(2);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Int8, this.cursor);
            this.currentBuffer.writeInt8(num, this.cursor + 1);
            this.cursor += 2;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Int8, this.cursor);
        this.currentBuffer.writeInt8(num, this.cursor + 1);
        this.cursor += 2;
        return;
      }
      if (num >= 0 && num <= 65535) {
        const result = this.ensureSpace(3);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Uint16, this.cursor);
            this.currentBuffer.writeUInt16LE(num, this.cursor + 1);
            this.cursor += 3;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Uint16, this.cursor);
        this.currentBuffer.writeUInt16LE(num, this.cursor + 1);
        this.cursor += 3;
        return;
      }
      if (num >= -32768 && num <= 32767) {
        const result = this.ensureSpace(3);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Int16, this.cursor);
            this.currentBuffer.writeInt16LE(num, this.cursor + 1);
            this.cursor += 3;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Int16, this.cursor);
        this.currentBuffer.writeInt16LE(num, this.cursor + 1);
        this.cursor += 3;
        return;
      }
      if (num >= 0 && num <= 4294967295) {
        const result = this.ensureSpace(5);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Uint32, this.cursor);
            this.currentBuffer.writeUInt32LE(num, this.cursor + 1);
            this.cursor += 5;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Uint32, this.cursor);
        this.currentBuffer.writeUInt32LE(num, this.cursor + 1);
        this.cursor += 5;
        return;
      }
      if (num >= -2147483648 && num <= 2147483647) {
        const result = this.ensureSpace(5);
        if (result) {
          return result.then(() => {
            this.currentBuffer.writeUInt8(TokenType.Int32, this.cursor);
            this.currentBuffer.writeInt32LE(num, this.cursor + 1);
            this.cursor += 5;
          });
        }
        this.currentBuffer.writeUInt8(TokenType.Int32, this.cursor);
        this.currentBuffer.writeInt32LE(num, this.cursor + 1);
        this.cursor += 5;
        return;
      }
    }

    // Optimization: use Float64 for other numbers to avoid string table overhead
    if (Number.isFinite(num)) {
      const result = this.ensureSpace(9);
      if (result) {
        return result.then(() => {
          this.currentBuffer.writeUInt8(TokenType.Float64, this.cursor);
          this.currentBuffer.writeDoubleLE(num, this.cursor + 1);
          this.cursor += 9;
        });
      }
      this.currentBuffer.writeUInt8(TokenType.Float64, this.cursor);
      this.currentBuffer.writeDoubleLE(num, this.cursor + 1);
      this.cursor += 9;
      return;
    }

    const index = this.registerString(String(num));
    const result = this.ensureSpace(5);
    if (result) {
      return result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.NumberRef, this.cursor);
        this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
        this.cursor += 5;
      });
    }
    this.currentBuffer.writeUInt8(TokenType.NumberRef, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  writeNumber(value: number | string): void | Promise<void> {
    this.beforeValue();

    if (this.optimizedArrayType) {
        this.bufferedNumbers.push(Number(value));
        this.afterValue();
        return;
    }

    const p = this.writeStandardNumber(value);
    if (p) return p.then(() => this.afterValue());
    this.afterValue();
  }

  writeBoolean(value: boolean): void | Promise<void> {
    if (this.optimizedArrayType) {
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeBoolean(value));
    }

    this.beforeValue();

    this.stats.tokens.booleans += 1;
    const result = this.ensureSpace(1);
    let promise: Promise<void> | void = undefined;
    if (result) {
      promise = result.then(() => {
        this.currentBuffer.writeUInt8(value ? TokenType.True : TokenType.False, this.cursor);
        this.cursor += 1;
      });
    } else {
      this.currentBuffer.writeUInt8(value ? TokenType.True : TokenType.False, this.cursor);
      this.cursor += 1;
    }

    if (promise) return promise.then(() => this.afterValue());
    this.afterValue();
  }

  writeNull(): void | Promise<void> {
    if (this.optimizedArrayType) {
        const p = this.abortOptimization();
        if (p) return p.then(() => this.writeNull());
    }

    this.beforeValue();

    this.stats.tokens.nulls += 1;
    const result = this.ensureSpace(1);
    let promise: Promise<void> | void = undefined;
    if (result) {
      promise = result.then(() => {
        this.currentBuffer.writeUInt8(TokenType.Null, this.cursor);
        this.cursor += 1;
      });
    } else {
      this.currentBuffer.writeUInt8(TokenType.Null, this.cursor);
      this.cursor += 1;
    }

    if (promise) return promise.then(() => this.afterValue());
    this.afterValue();
  }

  async finalize(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;

    if (this.cursor > 0) {
      const chunk = this.currentBuffer.subarray(0, this.cursor);
      this.crcTokens.update(chunk);
      await this.tokenWriter.write(chunk);
      this.tokenLength += this.cursor;
    }

    // Ensure all tokens are written to the stream
    await this.tokenWriter.end();

    // Prepare JSON metadata
    const metadata = {
        magic: FORMAT_MAGIC.toString('utf8'),
        version: FORMAT_VERSION,
        stringTable: this.strings,
        index: this.offsets.map(o => ({ kind: o.kind, offset: o.offset.toString() })),
        // Optional extra info
        stats: this.stats,
        tokenStreamLength: this.tokenLength.toString(),
        tokenStreamChecksum: this.crcTokens.getRawState() // crc32 returns number (Int32)
    };

    // Write JSON to metadata stream
    // Using stringify might block for huge metadata?
    // If strings table is huge, stringify is expensive.
    // But we are in finalize, so maybe acceptable.

    const json = JSON.stringify(metadata, null, 2);

    // Write to metadata stream
    const buffer = Buffer.from(json, 'utf8');

    // We assume metadataStream is a standard writable.
    if (!this.metadataStream.write(buffer)) {
        await once(this.metadataStream, "drain");
    }
    this.metadataStream.end();
  }

  private registerString(value: string): number {
    this.stats.strings.totalCount += 1;

    const existing = this.stringIndex.get(value);
    if (existing !== undefined) {
      this.stats.strings.totalBytes += value.length;
      return existing;
    }

    const byteLength = Buffer.byteLength(value, "utf8");
    this.stats.strings.totalBytes += byteLength;
    this.stats.strings.uniqueCount += 1;
    this.stats.strings.uniqueBytes += byteLength;

    const index = this.strings.length;
    this.strings.push(value);
    this.stringIndex.set(value, index);
    return index;
  }

  private recordOffset(kind: OffsetKind): void {
    this.offsets.push({ kind, offset: BigInt(this.tokenLength + this.cursor).toString() });
  }

  private ensureSpace(size: number): void | Promise<void> {
    if (this.cursor + size > this.currentBuffer.length) {
      if (this.cursor > 0) {
        const chunk = this.currentBuffer.subarray(0, this.cursor);
        this.crcTokens.update(chunk);
        const result = this.tokenWriter.write(chunk);
        this.tokenLength += this.cursor;

        if (result && typeof result.then === 'function') {
           return result.then(() => {
             const newSize = Math.max(TOKEN_BUFFER_SIZE, size);
             this.currentBuffer = Buffer.allocUnsafe(newSize);
             this.cursor = 0;
           });
        }
      }
      const newSize = Math.max(TOKEN_BUFFER_SIZE, size);
      this.currentBuffer = Buffer.allocUnsafe(newSize);
      this.cursor = 0;
    }
  }

}
