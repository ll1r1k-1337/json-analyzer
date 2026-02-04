import { open } from "node:fs/promises";
import {
  FORMAT_MAGIC,
  FORMAT_VERSION,
  HEADER_LENGTH,
  OffsetKind,
  TokenType,
  TRAILER_LENGTH,
  TRAILER_MAGIC,
} from "./format.js";

type RandomAccessReader = {
  size: number;
  read(offset: number, length: number): Promise<Buffer>;
  close?: () => Promise<void>;
};

class BufferReader implements RandomAccessReader {
  constructor(private buffer: Buffer) {}

  get size(): number {
    return this.buffer.length;
  }

  async read(offset: number, length: number): Promise<Buffer> {
    return this.buffer.subarray(offset, offset + length);
  }
}

class FileReader implements RandomAccessReader {
  private constructor(
    private handle: Awaited<ReturnType<typeof open>>,
    public size: number
  ) {}

  static async create(path: string): Promise<FileReader> {
    const handle = await open(path, "r");
    const stats = await handle.stat();
    return new FileReader(handle, stats.size);
  }

  async read(offset: number, length: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await this.handle.read(buffer, 0, length, offset);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}

export type BinaryHeader = {
  magic: Buffer;
  version: number;
  flags: number;
};

export type BinaryTrailer = {
  stringTableOffset: bigint;
  tokenStreamOffset: bigint;
  tokenStreamLength: bigint;
  indexOffset: bigint;
  indexLength: bigint;
  checksum: number;
};

export type BinaryIndexEntry = {
  kind: OffsetKind;
  tokenOffset: bigint;
};

export type BinaryToken =
  | { type: TokenType.StartObject }
  | { type: TokenType.EndObject }
  | { type: TokenType.StartArray }
  | { type: TokenType.EndArray }
  | { type: TokenType.Key; value: string }
  | { type: TokenType.String; value: string }
  | { type: TokenType.Number; value: string }
  | { type: TokenType.True; value: true }
  | { type: TokenType.False; value: false }
  | { type: TokenType.Null; value: null };

export type BinaryTokenResult = {
  token: BinaryToken;
  byteLength: number;
};

const toNumber = (value: bigint, label: string): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds safe integer range`);
  }
  return Number(value);
};

const parseHeader = (buffer: Buffer): BinaryHeader => {
  if (buffer.length !== HEADER_LENGTH) {
    throw new Error(`Unexpected header length: ${buffer.length}`);
  }
  const magic = buffer.subarray(0, 4);
  if (!magic.equals(FORMAT_MAGIC)) {
    throw new Error("Invalid binary header magic");
  }
  const version = buffer.readUInt16LE(4);
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${version}`);
  }
  const flags = buffer.readUInt16LE(6);
  return { magic, version, flags };
};

const parseTrailer = (buffer: Buffer): BinaryTrailer => {
  if (buffer.length !== TRAILER_LENGTH) {
    throw new Error(`Unexpected trailer length: ${buffer.length}`);
  }
  const magic = buffer.subarray(0, 4);
  if (!magic.equals(TRAILER_MAGIC)) {
    throw new Error("Invalid trailer magic");
  }
  return {
    stringTableOffset: buffer.readBigUInt64LE(4),
    tokenStreamOffset: buffer.readBigUInt64LE(12),
    tokenStreamLength: buffer.readBigUInt64LE(20),
    indexOffset: buffer.readBigUInt64LE(28),
    indexLength: buffer.readBigUInt64LE(36),
    checksum: buffer.readUInt32LE(44),
  };
};

const parseStringTable = (buffer: Buffer): string[] => {
  const count = buffer.readUInt32LE(0);
  const strings: string[] = [];
  let offset = 4;
  for (let i = 0; i < count; i += 1) {
    if (offset + 4 > buffer.length) {
      throw new Error("Unexpected end of string table");
    }
    const byteLength = buffer.readUInt32LE(offset);
    offset += 4;
    if (offset + byteLength > buffer.length) {
      throw new Error("Unexpected end of string table data");
    }
    const value = buffer.subarray(offset, offset + byteLength).toString("utf8");
    offset += byteLength;
    strings.push(value);
  }
  return strings;
};

const parseIndex = (buffer: Buffer): BinaryIndexEntry[] => {
  const count = buffer.readUInt32LE(0);
  const entries: BinaryIndexEntry[] = [];
  let offset = 4;
  for (let i = 0; i < count; i += 1) {
    if (offset + 9 > buffer.length) {
      throw new Error("Unexpected end of offset index");
    }
    const kind = buffer.readUInt8(offset) as OffsetKind;
    const tokenOffset = buffer.readBigUInt64LE(offset + 1);
    offset += 9;
    entries.push({ kind, tokenOffset });
  }
  return entries;
};

export class BinaryTokenReader {
  private constructor(
    private source: RandomAccessReader,
    private header: BinaryHeader,
    private trailer: BinaryTrailer,
    private stringTable: string[],
    private index: BinaryIndexEntry[]
  ) {}

  static async fromBuffer(buffer: Buffer): Promise<BinaryTokenReader> {
    const reader = new BufferReader(buffer);
    return BinaryTokenReader.fromStreamSources(reader);
  }

  static async fromFile(path: string): Promise<BinaryTokenReader> {
    const reader = await FileReader.create(path);
    return BinaryTokenReader.fromStreamSources(reader);
  }

  static async fromFiles(
    metaPath: string,
    binPath: string
  ): Promise<BinaryTokenReader> {
    const metaReader = await FileReader.create(metaPath);
    const binReader = await FileReader.create(binPath);
    try {
      return await BinaryTokenReader.fromStreamSources(metaReader, binReader);
    } catch (error) {
      if (metaReader.close) await metaReader.close();
      if (binReader.close) await binReader.close();
      throw error;
    }
  }

  getHeader(): BinaryHeader {
    return this.header;
  }

  getTrailer(): BinaryTrailer {
    return this.trailer;
  }

  getStringTable(): string[] {
    return [...this.stringTable];
  }

  getIndex(): BinaryIndexEntry[] {
    return [...this.index];
  }

  async readTokenAt(offset: bigint): Promise<BinaryTokenResult> {
    const tokenStreamOffset = this.trailer.tokenStreamOffset;
    const tokenStreamLength = this.trailer.tokenStreamLength;
    if (offset < 0n || offset >= tokenStreamLength) {
      throw new Error("Token offset out of bounds");
    }

    const absoluteOffset = tokenStreamOffset + offset;
    const firstByte = await this.readBytes(absoluteOffset, 1);
    if (firstByte.length < 1) {
      throw new Error("Unable to read token type");
    }

    const type = firstByte.readUInt8(0) as TokenType;
    switch (type) {
      case TokenType.StartObject:
        return { token: { type }, byteLength: 1 };
      case TokenType.EndObject:
        return { token: { type }, byteLength: 1 };
      case TokenType.StartArray:
        return { token: { type }, byteLength: 1 };
      case TokenType.EndArray:
        return { token: { type }, byteLength: 1 };
      case TokenType.True:
        return { token: { type, value: true }, byteLength: 1 };
      case TokenType.False:
        return { token: { type, value: false }, byteLength: 1 };
      case TokenType.Null:
        return { token: { type, value: null }, byteLength: 1 };
      case TokenType.Key:
      case TokenType.String: {
        const payload = await this.readBytes(absoluteOffset + 1n, 4);
        if (payload.length < 4) {
          throw new Error("Unable to read string table index");
        }
        const index = payload.readUInt32LE(0);
        const value = this.stringTable[index];
        if (value === undefined) {
          throw new Error(`String table index out of bounds: ${index}`);
        }
        const token =
          type === TokenType.Key
            ? ({ type, value } as BinaryToken)
            : ({ type, value } as BinaryToken);
        return { token, byteLength: 5 };
      }
      case TokenType.Number: {
        const lengthBytes = await this.readBytes(absoluteOffset + 1n, 4);
        if (lengthBytes.length < 4) {
          throw new Error("Unable to read number length");
        }
        const byteLength = lengthBytes.readUInt32LE(0);
        const numberBytes = await this.readBytes(
          absoluteOffset + 5n,
          byteLength
        );
        if (numberBytes.length < byteLength) {
          throw new Error("Unable to read number bytes");
        }
        const value = numberBytes.toString("utf8");
        return { token: { type, value }, byteLength: 5 + byteLength };
      }
      case TokenType.NumberRef: {
        const payload = await this.readBytes(absoluteOffset + 1n, 4);
        if (payload.length < 4) {
          throw new Error("Unable to read string table index");
        }
        const index = payload.readUInt32LE(0);
        const value = this.stringTable[index];
        if (value === undefined) {
          throw new Error(`String table index out of bounds: ${index}`);
        }
        return { token: { type: TokenType.Number, value }, byteLength: 5 };
      }
      default:
        throw new Error(`Unknown token type: ${type}`);
    }
  }

  async close(): Promise<void> {
    if (this.source.close) {
      await this.source.close();
    }
  }

  private async readBytes(offset: bigint, length: number): Promise<Buffer> {
    const offsetNumber = toNumber(offset, "Offset");
    return this.source.read(offsetNumber, length);
  }

  private static async fromStreamSources(
    metaReader: RandomAccessReader,
    tokenReader?: RandomAccessReader
  ): Promise<BinaryTokenReader> {
    if (metaReader.size < HEADER_LENGTH + TRAILER_LENGTH) {
      throw new Error("Binary file too small to contain header/trailer");
    }

    const header = parseHeader(await metaReader.read(0, HEADER_LENGTH));
    const trailer = parseTrailer(
      await metaReader.read(metaReader.size - TRAILER_LENGTH, TRAILER_LENGTH)
    );

    const stringTableOffset = toNumber(
      trailer.stringTableOffset,
      "String table offset"
    );
    const tokenStreamOffset = toNumber(
      trailer.tokenStreamOffset,
      "Token stream offset"
    );
    const indexOffset = toNumber(trailer.indexOffset, "Index offset");
    const indexLength = toNumber(trailer.indexLength, "Index length");

    let source = tokenReader;
    let stringTableLength: number;

    if (!source) {
      // Single file mode
      if (tokenStreamOffset < stringTableOffset) {
        throw new Error("Token stream offset precedes string table");
      }
      source = metaReader;
      // In single file mode (legacy), tokens follow string table
      stringTableLength = tokenStreamOffset - stringTableOffset;
    } else {
      // Split file mode: string table is followed by index in metadata file
      stringTableLength = indexOffset - stringTableOffset;
    }

    const stringTableBuffer = await metaReader.read(
      stringTableOffset,
      stringTableLength
    );
    const strings = parseStringTable(stringTableBuffer);

    const indexBuffer = await metaReader.read(indexOffset, indexLength);
    const index = parseIndex(indexBuffer);

    // If we used a separate metaReader, we should close it now as we only need the token source going forward
    if (source !== metaReader && metaReader.close) {
      await metaReader.close();
    }

    return new BinaryTokenReader(source, header, trailer, strings, index);
  }
}
