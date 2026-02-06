import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Readable, Transform } from "node:stream";
import pkg from "stream-json";
const { parser } = pkg;

export interface BinaryWriter {
  writeStartObject(): void | Promise<void>;
  writeEndObject(): void | Promise<void>;
  writeStartArray(): void | Promise<void>;
  writeEndArray(): void | Promise<void>;
  writeKey(key: string): void | Promise<void>;
  writeString(value: string): void | Promise<void>;
  writeNumber(value: number | string): void | Promise<void>;
  writeBoolean(value: boolean): void | Promise<void>;
  writeNull(): void | Promise<void>;
}

type JsonToken = {
  name: string;
  value?: unknown;
};

const writeToken = (writer: BinaryWriter, token: JsonToken): void | Promise<void> => {
  switch (token.name) {
    case "startObject":
      return writer.writeStartObject();
    case "endObject":
      return writer.writeEndObject();
    case "startArray":
      return writer.writeStartArray();
    case "endArray":
      return writer.writeEndArray();
    case "keyValue":
      return writer.writeKey(String(token.value ?? ""));
    case "stringValue":
      return writer.writeString(String(token.value ?? ""));
    case "numberValue":
      if (token.value === undefined) {
        throw new Error("Number token missing value");
      }
      return writer.writeNumber(token.value as number | string);
    case "trueValue":
      return writer.writeBoolean(true);
    case "falseValue":
      return writer.writeBoolean(false);
    case "nullValue":
      return writer.writeNull();
    default:
      return;
  }
};

const createWriterSink = (writer: BinaryWriter): Writable =>
  new Writable({
    objectMode: true,
    write(chunk: JsonToken, _encoding, callback) {
      try {
        const result = writeToken(writer, chunk);
        if (result && typeof result.then === 'function') {
          result.then(() => callback(), (err) => callback(err));
        } else {
          callback();
        }
      } catch (error) {
        callback(error as Error);
      }
    },
  });

export const createStreamParser = (writer: BinaryWriter): { parser: Transform; sink: Writable } => {
  const parserStream = parser();
  const sink = createWriterSink(writer);

  return { parser: parserStream, sink };
};

export const parseJsonStream = async (readable: Readable, writer: BinaryWriter): Promise<void> => {
  const { parser: parserStream, sink } = createStreamParser(writer);
  await pipeline(readable, parserStream, sink);
};
