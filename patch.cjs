const fs = require('fs');

let content = fs.readFileSync('src/binary/reader.ts', 'utf8');

const search = `    const absoluteOffset = tokenStreamOffset + offset;
    const firstByte = await this.readBytes(absoluteOffset, 1);
    if (firstByte.length < 1) {
      throw new Error("Unable to read token type");
    }

    const type = firstByte.readUInt8(0) as TokenType;
    switch (type) {
      case TokenType.StartObject:
      case TokenType.EndObject:
      case TokenType.StartArray:
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
          throw new Error(\`String table index out of bounds: \${index}\`);
        }
        return { token: { type, value }, byteLength: 5 };
      }
      case TokenType.Number: {
        const lengthBytes = await this.readBytes(absoluteOffset + 1n, 4);
        if (lengthBytes.length < 4) throw new Error("Unable to read number length");
        const byteLength = lengthBytes.readUInt32LE(0);
        const numberBytes = await this.readBytes(absoluteOffset + 5n, byteLength);
        if (numberBytes.length < byteLength) throw new Error("Unable to read number bytes");
        const value = numberBytes.toString("utf8");
        return { token: { type, value }, byteLength: 5 + byteLength };
      }
      case TokenType.NumberRef: {
        const payload = await this.readBytes(absoluteOffset + 1n, 4);
        if (payload.length < 4) throw new Error("Unable to read string table index");
        const index = payload.readUInt32LE(0);
        const value = this.stringTable[index];
        if (value === undefined) throw new Error(\`String table index out of bounds: \${index}\`);
        return { token: { type: TokenType.Number, value }, byteLength: 5 };
      }
      case TokenType.Int8:
      case TokenType.Uint8: {
        const payload = await this.readBytes(absoluteOffset + 1n, 1);
        if (payload.length < 1) throw new Error("Unable to read value");
        const value = type === TokenType.Int8 ? payload.readInt8(0) : payload.readUInt8(0);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 2 };
      }
      case TokenType.Int16:
      case TokenType.Uint16: {
        const payload = await this.readBytes(absoluteOffset + 1n, 2);
        if (payload.length < 2) throw new Error("Unable to read value");
        const value = type === TokenType.Int16 ? payload.readInt16LE(0) : payload.readUInt16LE(0);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 3 };
      }
      case TokenType.Int32:
      case TokenType.Uint32: {
        const payload = await this.readBytes(absoluteOffset + 1n, 4);
        if (payload.length < 4) throw new Error("Unable to read value");
        const value = type === TokenType.Int32 ? payload.readInt32LE(0) : payload.readUInt32LE(0);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 5 };
      }
      case TokenType.Float64: {
        const payload = await this.readBytes(absoluteOffset + 1n, 8);
        if (payload.length < 8) throw new Error("Unable to read Float64 value");
        const value = payload.readDoubleLE(0);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 9 };
      }

      // Typed Arrays
      case TokenType.Uint8Array:
      case TokenType.Int8Array:
      case TokenType.Uint16Array:
      case TokenType.Int16Array:
      case TokenType.Uint32Array:
      case TokenType.Int32Array:
      case TokenType.Float32Array:
      case TokenType.Float64Array: {
          const lengthBytes = await this.readBytes(absoluteOffset + 1n, 4);
          if (lengthBytes.length < 4) throw new Error("Unable to read typed array length");
          const byteLength = lengthBytes.readUInt32LE(0);
          const data = await this.readBytes(absoluteOffset + 5n, byteLength);
          if (data.length < byteLength) throw new Error("Unable to read typed array data");

          return { token: { type, value: data }, byteLength: 5 + byteLength };
      }`;

const replace = `    const absoluteOffset = tokenStreamOffset + offset;

    // Speculative read: fetch 16 bytes to cover token header and typical fixed-size payloads
    // This avoids a second microtask/await for common tokens, reducing overhead significantly.
    const SPECULATIVE_READ_SIZE = 16;
    const chunk = await this.readBytes(absoluteOffset, SPECULATIVE_READ_SIZE);
    if (chunk.length < 1) {
      throw new Error("Unable to read token type");
    }

    const type = chunk.readUInt8(0) as TokenType;
    switch (type) {
      case TokenType.StartObject:
      case TokenType.EndObject:
      case TokenType.StartArray:
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
        if (chunk.length < 5) {
          throw new Error("Unable to read string table index");
        }
        const index = chunk.readUInt32LE(1);
        const value = this.stringTable[index];
        if (value === undefined) {
          throw new Error(\`String table index out of bounds: \${index}\`);
        }
        return { token: { type, value }, byteLength: 5 };
      }
      case TokenType.Number: {
        if (chunk.length < 5) throw new Error("Unable to read number length");
        const byteLength = chunk.readUInt32LE(1);
        const totalLength = 5 + byteLength;
        let numberBytes: Buffer;
        if (chunk.length >= totalLength) {
          numberBytes = chunk.subarray(5, totalLength);
        } else {
          numberBytes = await this.readBytes(absoluteOffset + 5n, byteLength);
          if (numberBytes.length < byteLength) throw new Error("Unable to read number bytes");
        }
        const value = numberBytes.toString("utf8");
        return { token: { type, value }, byteLength: totalLength };
      }
      case TokenType.NumberRef: {
        if (chunk.length < 5) throw new Error("Unable to read string table index");
        const index = chunk.readUInt32LE(1);
        const value = this.stringTable[index];
        if (value === undefined) throw new Error(\`String table index out of bounds: \${index}\`);
        return { token: { type: TokenType.Number, value }, byteLength: 5 };
      }
      case TokenType.Int8:
      case TokenType.Uint8: {
        if (chunk.length < 2) throw new Error("Unable to read value");
        const value = type === TokenType.Int8 ? chunk.readInt8(1) : chunk.readUInt8(1);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 2 };
      }
      case TokenType.Int16:
      case TokenType.Uint16: {
        if (chunk.length < 3) throw new Error("Unable to read value");
        const value = type === TokenType.Int16 ? chunk.readInt16LE(1) : chunk.readUInt16LE(1);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 3 };
      }
      case TokenType.Int32:
      case TokenType.Uint32: {
        if (chunk.length < 5) throw new Error("Unable to read value");
        const value = type === TokenType.Int32 ? chunk.readInt32LE(1) : chunk.readUInt32LE(1);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 5 };
      }
      case TokenType.Float64: {
        if (chunk.length < 9) throw new Error("Unable to read Float64 value");
        const value = chunk.readDoubleLE(1);
        return { token: { type: TokenType.Number, value: String(value) }, byteLength: 9 };
      }

      // Typed Arrays
      case TokenType.Uint8Array:
      case TokenType.Int8Array:
      case TokenType.Uint16Array:
      case TokenType.Int16Array:
      case TokenType.Uint32Array:
      case TokenType.Int32Array:
      case TokenType.Float32Array:
      case TokenType.Float64Array: {
          if (chunk.length < 5) throw new Error("Unable to read typed array length");
          const byteLength = chunk.readUInt32LE(1);
          const data = await this.readBytes(absoluteOffset + 5n, byteLength);
          if (data.length < byteLength) throw new Error("Unable to read typed array data");

          return { token: { type, value: data }, byteLength: 5 + byteLength };
      }`;

if (!content.includes(search)) {
  console.error("Could not find block to replace");
} else {
  content = content.replace(search, replace);
  fs.writeFileSync('src/binary/reader.ts', content);
  console.log("Replaced successfully.");
}
