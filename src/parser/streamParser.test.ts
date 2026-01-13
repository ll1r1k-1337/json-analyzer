import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { BinaryWriter } from "./streamParser";
import { parseJsonStream } from "./streamParser";

type Event =
  | { type: "startObject" }
  | { type: "endObject" }
  | { type: "startArray" }
  | { type: "endArray" }
  | { type: "key"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "null" };

class RecordingWriter implements BinaryWriter {
  readonly events: Event[] = [];

  writeStartObject(): void {
    this.events.push({ type: "startObject" });
  }

  writeEndObject(): void {
    this.events.push({ type: "endObject" });
  }

  writeStartArray(): void {
    this.events.push({ type: "startArray" });
  }

  writeEndArray(): void {
    this.events.push({ type: "endArray" });
  }

  writeKey(key: string): void {
    this.events.push({ type: "key", value: key });
  }

  writeString(value: string): void {
    this.events.push({ type: "string", value });
  }

  writeNumber(value: number | string): void {
    this.events.push({ type: "number", value: String(value) });
  }

  writeBoolean(value: boolean): void {
    this.events.push({ type: "boolean", value });
  }

  writeNull(): void {
    this.events.push({ type: "null" });
  }
}

const parseJson = async (payload: string): Promise<RecordingWriter> => {
  const writer = new RecordingWriter();
  await parseJsonStream(Readable.from([payload]), writer);
  return writer;
};

describe("stream parser", () => {
  it("emits the expected sequence for a small object", async () => {
    const writer = await parseJson('{"name":"Ada","age":42}');

    expect(writer.events).toEqual([
      { type: "startObject" },
      { type: "key", value: "name" },
      { type: "string", value: "Ada" },
      { type: "key", value: "age" },
      { type: "number", value: "42" },
      { type: "endObject" },
    ]);
  });

  it("handles arrays, objects, strings, numbers, booleans, and nulls", async () => {
    const writer = await parseJson(
      '{"items":[1,"two",false,null,{"ok":true}],"empty":{},"value":null}'
    );

    expect(writer.events).toEqual([
      { type: "startObject" },
      { type: "key", value: "items" },
      { type: "startArray" },
      { type: "number", value: "1" },
      { type: "string", value: "two" },
      { type: "boolean", value: false },
      { type: "null" },
      { type: "startObject" },
      { type: "key", value: "ok" },
      { type: "boolean", value: true },
      { type: "endObject" },
      { type: "endArray" },
      { type: "key", value: "empty" },
      { type: "startObject" },
      { type: "endObject" },
      { type: "key", value: "value" },
      { type: "null" },
      { type: "endObject" },
    ]);
  });
});
