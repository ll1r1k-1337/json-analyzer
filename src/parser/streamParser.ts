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

const writeToken = async (writer: BinaryWriter, token: JsonToken): Promise<void> => {
  switch (token.name) {
    case "startObject":
      await writer.writeStartObject();
      return;
    case "endObject":
      await writer.writeEndObject();
      return;
    case "startArray":
      await writer.writeStartArray();
      return;
    case "endArray":
      await writer.writeEndArray();
      return;
    case "keyValue":
      await writer.writeKey(String(token.value ?? ""));
      return;
    case "stringValue":
      await writer.writeString(String(token.value ?? ""));
      return;
    case "numberValue":
      if (token.value === undefined) {
        throw new Error("Number token missing value");
      }
      await writer.writeNumber(token.value as number | string);
      return;
    case "trueValue":
      await writer.writeBoolean(true);
      return;
    case "falseValue":
      await writer.writeBoolean(false);
      return;
    case "nullValue":
      await writer.writeNull();
      return;
    default:
      return;
  }
};

const createWriterSink = (writer: BinaryWriter): Writable =>
  new Writable({
    objectMode: true,
    async write(chunk: JsonToken, _encoding, callback) {
      try {
        await writeToken(writer, chunk);
        callback();
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
