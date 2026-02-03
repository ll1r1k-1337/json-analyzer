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

const encodeStringTable = (strings: string[]): Buffer => {
  const chunks: Buffer[] = [writeUInt32LE(strings.length)];
  for (const value of strings) {
    const bytes = Buffer.from(value, "utf8");
    chunks.push(writeUInt32LE(bytes.length), bytes);
  }
  return Buffer.concat(chunks);
};

const encodeOffsets = (offsets: OffsetEntry[]): Buffer => {
  const chunks: Buffer[] = [writeUInt32LE(offsets.length)];
  for (const entry of offsets) {
    chunks.push(Buffer.from([entry.kind]), writeUInt64LE(entry.offset));
  }
  return Buffer.concat(chunks);
};

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

const crc32 = (buffers: Buffer[]): number => {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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
  private readonly tokens: Buffer[] = [];
  private readonly offsets: OffsetEntry[] = [];
  private readonly stringIndex = new Map<string, number>();
  private readonly strings: string[] = [];
  private tokenLength = 0;
  private finalized = false;

  private currentBuffer: Buffer = Buffer.alloc(TOKEN_BUFFER_SIZE);
  private cursor = 0;

  constructor(
    private tokenStream: Writable,
    private metadataStream: Writable
  ) {}

  writeStartObject(): void {
    this.recordOffset(OffsetKind.Object);
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.StartObject, this.cursor);
    this.cursor += 1;
  }

  writeEndObject(): void {
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.EndObject, this.cursor);
    this.cursor += 1;
  }

  writeStartArray(): void {
    this.recordOffset(OffsetKind.Array);
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.StartArray, this.cursor);
    this.cursor += 1;
  }

  writeEndArray(): void {
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.EndArray, this.cursor);
    this.cursor += 1;
  }

  writeKey(key: string): void {
    const index = this.registerString(key);
    this.ensureSpace(5);
    this.currentBuffer.writeUInt8(TokenType.Key, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  writeString(value: string): void {
    const index = this.registerString(value);
    this.ensureSpace(5);
    this.currentBuffer.writeUInt8(TokenType.String, this.cursor);
    this.currentBuffer.writeUInt32LE(index, this.cursor + 1);
    this.cursor += 5;
  }

  writeNumber(value: number | string): void {
    const str = String(value);
    const len = Buffer.byteLength(str);
    this.ensureSpace(1 + 4 + len);
    this.currentBuffer.writeUInt8(TokenType.Number, this.cursor);
    this.currentBuffer.writeUInt32LE(len, this.cursor + 1);
    this.currentBuffer.write(str, this.cursor + 5, len, "utf8");
    this.cursor += 1 + 4 + len;
  }

  writeBoolean(value: boolean): void {
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(value ? TokenType.True : TokenType.False, this.cursor);
    this.cursor += 1;
  }

  writeNull(): void {
    this.ensureSpace(1);
    this.currentBuffer.writeUInt8(TokenType.Null, this.cursor);
    this.cursor += 1;
  }

  async finalize(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;

    if (this.cursor > 0) {
      this.tokens.push(this.currentBuffer.subarray(0, this.cursor));
      this.tokenLength += this.cursor;
    }

    const header = Buffer.concat([
      FORMAT_MAGIC,
      writeUInt16LE(FORMAT_VERSION),
      writeUInt16LE(0),
    ]);
    const stringTable = encodeStringTable(this.strings);
    const tokenStream = Buffer.concat(this.tokens);
    const index = encodeOffsets(this.offsets);

    const stringTableOffset = BigInt(HEADER_LENGTH);
    const tokenStreamOffset = 0n;
    const tokenStreamLength = BigInt(tokenStream.length);
    const indexOffset = BigInt(HEADER_LENGTH + stringTable.length);
    const indexLength = BigInt(index.length);

    const checksum = crc32([header, stringTable, tokenStream, index]);
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

    const tokenWriter = new BufferedStreamWriter(this.tokenStream);
    await tokenWriter.write(tokenStream);
    await tokenWriter.end();

    const metadataWriter = new BufferedStreamWriter(this.metadataStream);
    await metadataWriter.write(header);
    await metadataWriter.write(stringTable);
    await metadataWriter.write(index);
    await metadataWriter.write(trailer);
    await metadataWriter.end();
  }

  private registerString(value: string): number {
    const existing = this.stringIndex.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.strings.length;
    this.strings.push(value);
    this.stringIndex.set(value, index);
    return index;
  }

  private recordOffset(kind: OffsetKind): void {
    this.offsets.push({ kind, offset: BigInt(this.tokenLength + this.cursor) });
  }

  private ensureSpace(size: number): void {
    if (this.cursor + size > this.currentBuffer.length) {
      if (this.cursor > 0) {
        this.tokens.push(this.currentBuffer.subarray(0, this.cursor));
        this.tokenLength += this.cursor;
      }
      const newSize = Math.max(TOKEN_BUFFER_SIZE, size);
      this.currentBuffer = Buffer.alloc(newSize);
      this.cursor = 0;
    }
  }

}
