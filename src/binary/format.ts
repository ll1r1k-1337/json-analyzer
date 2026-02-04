/**
 * Binary JSON format (v1)
 *
 * Layout (all integers are little-endian):
 *
 * [Metadata file (*.meta)]
 *   [Header]
 *     - magic: 4 bytes ("JSAN")
 *     - version: u16
 *     - flags: u16 (reserved, set to 0)
 *
 *   [String table]
 *     - count: u32
 *     - entries:
 *         - byteLength: u32
 *         - utf8 bytes
 *
 *   [Offset index]
 *     - count: u32
 *     - entries:
 *         - kind: u8 (1 = object, 2 = array)
 *         - tokenOffset: u64 (byte offset within token stream)
 *
 *   [Trailer]
 *     - magic: 4 bytes ("TRLR")
 *     - stringTableOffset: u64
 *     - tokenStreamOffset: u64 (offset in *.bin, currently 0)
 *     - tokenStreamLength: u64 (length of *.bin)
 *     - indexOffset: u64
 *     - indexLength: u64
 *     - checksum: u32 (CRC32 of header + string table + token stream + index)
 *
 * [Token stream file (*.bin)]
 *   - sequence of tokens (see TokenType below)
 *   - tokens may reference the string table by index (u32)
 */

export const FORMAT_MAGIC = Buffer.from("JSAN");
export const TRAILER_MAGIC = Buffer.from("TRLR");
export const FORMAT_VERSION = 1;

export const HEADER_LENGTH = 8;
export const TRAILER_LENGTH = 4 + 8 * 5 + 4;

export enum TokenType {
  StartObject = 0x01,
  EndObject = 0x02,
  StartArray = 0x03,
  EndArray = 0x04,
  Key = 0x05,
  String = 0x06,
  Number = 0x07,
  True = 0x08,
  False = 0x09,
  Null = 0x0a,
  NumberRef = 0x0b,
  Int8 = 0x0c,
  Uint8 = 0x0d,
  Int16 = 0x0e,
  Uint16 = 0x0f,
  Int32 = 0x10,
  Uint32 = 0x11,
  Float64 = 0x12,
}

export enum OffsetKind {
  Object = 1,
  Array = 2,
}
