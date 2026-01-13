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
} from "./format";
import type { BinaryWriter } from "../parser/streamParser";

const DEFAULT_BUFFER_SIZE = 16 * 1024;

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

  constructor(private stream: Writable) {}

  writeStartObject(): void {
    this.recordOffset(OffsetKind.Object);
    this.pushToken(Buffer.from([TokenType.StartObject]));
  }

  writeEndObject(): void {
    this.pushToken(Buffer.from([TokenType.EndObject]));
  }

  writeStartArray(): void {
    this.recordOffset(OffsetKind.Array);
    this.pushToken(Buffer.from([TokenType.StartArray]));
  }

  writeEndArray(): void {
    this.pushToken(Buffer.from([TokenType.EndArray]));
  }

  writeKey(key: string): void {
    const index = this.registerString(key);
    const buffer = Buffer.alloc(1 + 4);
    buffer.writeUInt8(TokenType.Key, 0);
    buffer.writeUInt32LE(index, 1);
    this.pushToken(buffer);
  }

  writeString(value: string): void {
    const index = this.registerString(value);
    const buffer = Buffer.alloc(1 + 4);
    buffer.writeUInt8(TokenType.String, 0);
    buffer.writeUInt32LE(index, 1);
    this.pushToken(buffer);
  }

  writeNumber(value: number | string): void {
    const bytes = Buffer.from(String(value), "utf8");
    const buffer = Buffer.alloc(1 + 4 + bytes.length);
    buffer.writeUInt8(TokenType.Number, 0);
    buffer.writeUInt32LE(bytes.length, 1);
    bytes.copy(buffer, 5);
    this.pushToken(buffer);
  }

  writeBoolean(value: boolean): void {
    this.pushToken(Buffer.from([value ? TokenType.True : TokenType.False]));
  }

  writeNull(): void {
    this.pushToken(Buffer.from([TokenType.Null]));
  }

  async finalize(): Promise<void> {
    if (this.finalized) {
      return;
    }
    this.finalized = true;

    const header = Buffer.concat([
      FORMAT_MAGIC,
      writeUInt16LE(FORMAT_VERSION),
      writeUInt16LE(0),
    ]);
    const stringTable = encodeStringTable(this.strings);
    const tokenStream = Buffer.concat(this.tokens);
    const index = encodeOffsets(this.offsets);

    const stringTableOffset = BigInt(HEADER_LENGTH);
    const tokenStreamOffset = BigInt(HEADER_LENGTH + stringTable.length);
    const tokenStreamLength = BigInt(tokenStream.length);
    const indexOffset = tokenStreamOffset + tokenStreamLength;
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

    const writer = new BufferedStreamWriter(this.stream);
    await writer.write(header);
    await writer.write(stringTable);
    await writer.write(tokenStream);
    await writer.write(index);
    await writer.write(trailer);
    await writer.end();
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
    this.offsets.push({ kind, offset: BigInt(this.tokenLength) });
  }

  private pushToken(buffer: Buffer): void {
    this.tokens.push(buffer);
    this.tokenLength += buffer.length;
  }
}
