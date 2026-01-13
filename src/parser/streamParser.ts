import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Readable, Transform } from "node:stream";
import { parser } from "stream-json";

export interface BinaryWriter {
  writeStartObject(): void;
  writeEndObject(): void;
  writeStartArray(): void;
  writeEndArray(): void;
  writeKey(key: string): void;
  writeString(value: string): void;
  writeNumber(value: number | string): void;
  writeBoolean(value: boolean): void;
  writeNull(): void;
}

type JsonToken = {
  name: string;
  value?: unknown;
};

const writeToken = (writer: BinaryWriter, token: JsonToken): void => {
  switch (token.name) {
    case "startObject":
      writer.writeStartObject();
      return;
    case "endObject":
      writer.writeEndObject();
      return;
    case "startArray":
      writer.writeStartArray();
      return;
    case "endArray":
      writer.writeEndArray();
      return;
    case "keyValue":
      writer.writeKey(String(token.value ?? ""));
      return;
    case "stringValue":
      writer.writeString(String(token.value ?? ""));
      return;
    case "numberValue":
      if (token.value === undefined) {
        throw new Error("Number token missing value");
      }
      writer.writeNumber(token.value as number | string);
      return;
    case "trueValue":
      writer.writeBoolean(true);
      return;
    case "falseValue":
      writer.writeBoolean(false);
      return;
    case "nullValue":
      writer.writeNull();
      return;
    default:
      return;
  }
};

const createWriterSink = (writer: BinaryWriter): Writable =>
  new Writable({
    objectMode: true,
    write(chunk: JsonToken, _encoding, callback) {
      try {
        writeToken(writer, chunk);
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
