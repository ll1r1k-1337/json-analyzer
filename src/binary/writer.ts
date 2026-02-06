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

const DEFAULT_BUFFER_SIZE = 16 * 1024;
const TOKEN_BUFFER_SIZE = 64 * 1024;

type OffsetEntry = {
  kind: OffsetKind;
  offset: bigint;
};

const writeUInt16LE = (value: number): Buffer => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
};

const writeUInt32LE = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

const writeUInt64LE = (value: bigint): Buffer => {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value, 0);
  return buffer;
};

const encodeStringTable = (strings: string[], totalBytes: number): Buffer => {
  const size = 4 + strings.length * 4 + totalBytes;
  const buffer = Buffer.alloc(size);
  let offset = 0;

  buffer.writeUInt32LE(strings.length, offset);
  offset += 4;

  for (const value of strings) {
    const lengthOffset = offset;
    offset += 4;
    const byteLength = buffer.write(value, offset, "utf8");
    buffer.writeUInt32LE(byteLength, lengthOffset);
    offset += byteLength;
  }

  return buffer;
};

const encodeOffsets = (offsets: OffsetEntry[]): Buffer => {
  const size = 4 + offsets.length * (1 + 8);
  const buffer = Buffer.alloc(size);
  let offset = 0;

  buffer.writeUInt32LE(offsets.length, offset);
  offset += 4;

  for (const entry of offsets) {
    buffer.writeUInt8(entry.kind, offset);
    offset += 1;
    buffer.writeBigUInt64LE(entry.offset, offset);
    offset += 8;
  }
  return buffer;
};

class BufferedStreamWriter {
  private buffer: Buffer;
  private offset = 0;

  constructor(
    private stream: Writable,
    private size = DEFAULT_BUFFER_SIZE
  ) {
    this.buffer = Buffer.alloc(this.size);
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

  async write(buffer: Buffer): Promise<void> {
    let remaining = buffer;
    while (remaining.length > 0) {
      const available = this.size - this.offset;
      if (remaining.length >= this.size) {
        await this.flushBuffer();
        if (!this.stream.write(remaining)) {
          await once(this.stream, "drain");
        }
        return;
      }
      if (remaining.length > available) {
        const slice = remaining.subarray(0, available);
        slice.copy(this.buffer, this.offset);
        this.offset += slice.length;
        remaining = remaining.subarray(available);
        await this.flushBuffer();
        continue;
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

  private currentBuffer: Buffer = Buffer.alloc(TOKEN_BUFFER_SIZE);
  private cursor = 0;

  constructor(
    private tokenStream: Writable,
    private metadataStream: Writable
  ) {
    this.tokenWriter = new BufferedStreamWriter(tokenStream);
    this.crcTokens = new CRC32();
  }

  getStats(): WriterStats {
    return this.stats;
  }

  async writeStartObject(): Promise<void> {
    this.stats.tokens.objects += 1;
    this.recordOffset(OffsetKind.Object);
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.StartObject, this.cursor);
    this.cursor += 1;
  }

  async writeEndObject(): Promise<void> {
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.EndObject, this.cursor);
    this.cursor += 1;
  }

  async writeStartArray(): Promise<void> {
    this.stats.tokens.arrays += 1;
    this.recordOffset(OffsetKind.Array);
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
    this.cursor += 1;
  }

  async writeEndArray(): Promise<void> {
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.EndArray, this.cursor);
    this.cursor += 1;
  }

  async writeKey(key: string): Promise<void> {
    this.stats.tokens.keys += 1;
    const index = this.registerString(key);
    await this.ensureSpace(5);
    this.currentBuffer.writeUInt8(TokenType.Key, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  async writeString(value: string): Promise<void> {
    this.stats.tokens.strings += 1;
    const index = this.registerString(value);
    await this.ensureSpace(5);
    this.currentBuffer.writeUInt8(TokenType.String, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  async writeNumber(value: number | string): Promise<void> {
    this.stats.tokens.numbers += 1;
    const num = Number(value);

    if (Number.isInteger(num)) {
      if (num >= 0 && num <= 255) {
        await this.ensureSpace(2);
        this.currentBuffer.writeUInt8(TokenType.Uint8, this.cursor);
        this.currentBuffer.writeUInt8(num, this.cursor + 1);
        this.cursor += 2;
        return;
      }
      if (num >= -128 && num <= 127) {
        await this.ensureSpace(2);
        this.currentBuffer.writeUInt8(TokenType.Int8, this.cursor);
        this.currentBuffer.writeInt8(num, this.cursor + 1);
        this.cursor += 2;
        return;
      }
      if (num >= 0 && num <= 65535) {
        await this.ensureSpace(3);
        this.currentBuffer.writeUInt8(TokenType.Uint16, this.cursor);
        this.currentBuffer.writeUInt16LE(num, this.cursor + 1);
        this.cursor += 3;
        return;
      }
      if (num >= -32768 && num <= 32767) {
        await this.ensureSpace(3);
        this.currentBuffer.writeUInt8(TokenType.Int16, this.cursor);
        this.currentBuffer.writeInt16LE(num, this.cursor + 1);
        this.cursor += 3;
        return;
      }
      if (num >= 0 && num <= 4294967295) {
        await this.ensureSpace(5);
        this.currentBuffer.writeUInt8(TokenType.Uint32, this.cursor);
        this.currentBuffer.writeUInt32LE(num, this.cursor + 1);
        this.cursor += 5;
        return;
      }
      if (num >= -2147483648 && num <= 2147483647) {
        await this.ensureSpace(5);
        this.currentBuffer.writeUInt8(TokenType.Int32, this.cursor);
        this.currentBuffer.writeInt32LE(num, this.cursor + 1);
        this.cursor += 5;
        return;
      }
    }

    const index = this.registerString(String(num));
    await this.ensureSpace(5);
    this.currentBuffer.writeUInt8(TokenType.NumberRef, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  async writeBoolean(value: boolean): Promise<void> {
    this.stats.tokens.booleans += 1;
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(value ? TokenType.True : TokenType.False, this.cursor);
    this.cursor += 1;
  }

  async writeNull(): Promise<void> {
    this.stats.tokens.nulls += 1;
    await this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.Null, this.cursor);
    this.cursor += 1;
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

    const header = Buffer.concat([
      FORMAT_MAGIC,
      writeUInt16LE(FORMAT_VERSION),
      writeUInt16LE(0),
    ]);
    const stringTable = encodeStringTable(this.strings, this.stats.strings.uniqueBytes);
    // const tokenStream = Buffer.concat(this.tokens); // Removed
    const index = encodeOffsets(this.offsets);

    const stringTableOffset = BigInt(HEADER_LENGTH);
    const tokenStreamOffset = 0n;
    const tokenStreamLength = BigInt(this.tokenLength);
    const indexOffset = BigInt(HEADER_LENGTH + stringTable.length);
    const indexLength = BigInt(index.length);

    // Checksum calculation: Header || StringTable || Tokens || Index
    // Part 1: Header || StringTable (calculated with 0xFFFFFFFF initial state)
    const statePrefix = CRC32.calculate(Buffer.concat([header, stringTable]), 0xffffffff);

    // Part 2: Tokens (calculated with 0 initial state, available in this.crcTokens)
    const stateTokens = this.crcTokens.getRawState();

    // Combine Part 1 and Part 2
    const combinedState = CRC32.combine(statePrefix, stateTokens, tokenStreamLength);

    // Part 3: Index (update combined state with index)
    const finalState = CRC32.calculate(index, combinedState);

    // Finalize CRC (XOR out)
    const checksum = (finalState ^ 0xffffffff) >>> 0;

    const trailer = Buffer.concat([
      TRAILER_MAGIC,
      writeUInt64LE(stringTableOffset),
      writeUInt64LE(tokenStreamOffset),
      writeUInt64LE(tokenStreamLength),
      writeUInt64LE(indexOffset),
      writeUInt64LE(indexLength),
      writeUInt32LE(checksum),
    ]);

    if (trailer.length !== TRAILER_LENGTH) {
      throw new Error(`Unexpected trailer length: ${trailer.length}`);
    }

    const metadataWriter = new BufferedStreamWriter(this.metadataStream);
    await metadataWriter.write(header);
    await metadataWriter.write(stringTable);
    await metadataWriter.write(index);
    await metadataWriter.write(trailer);
    await metadataWriter.end();
  }

  private registerString(value: string): number {
    this.stats.strings.totalCount += 1;
    const byteLength = Buffer.byteLength(value, "utf8");
    this.stats.strings.totalBytes += byteLength;

    const existing = this.stringIndex.get(value);
    if (existing !== undefined) {
      return existing;
    }

    this.stats.strings.uniqueCount += 1;
    this.stats.strings.uniqueBytes += byteLength;

    const index = this.strings.length;
    this.strings.push(value);
    this.stringIndex.set(value, index);
    return index;
  }

  private recordOffset(kind: OffsetKind): void {
    this.offsets.push({ kind, offset: BigInt(this.tokenLength + this.cursor) });
  }

  private async ensureSpace(size: number): Promise<void> {
    if (this.cursor + size > this.currentBuffer.length) {
      if (this.cursor > 0) {
        const chunk = this.currentBuffer.subarray(0, this.cursor);
        this.crcTokens.update(chunk);
        await this.tokenWriter.write(chunk);
        this.tokenLength += this.cursor;
      }
      const newSize = Math.max(TOKEN_BUFFER_SIZE, size);
      this.currentBuffer = Buffer.alloc(newSize);
      this.cursor = 0;
    }
  }

}
