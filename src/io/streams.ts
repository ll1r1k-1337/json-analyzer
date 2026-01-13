import { createReadStream as fsCreateReadStream, createWriteStream as fsCreateWriteStream } from "node:fs";
import type { ReadStream, WriteStream } from "node:fs";

const READ_HIGH_WATER_MARK = 64 * 1024;
const WRITE_HIGH_WATER_MARK = 16 * 1024;

const abortError = () => new Error("Operation aborted");

const attachAbortHandler = (stream: ReadStream | WriteStream, signal?: AbortSignal): void => {
  if (!signal) {
    return;
  }

  if (signal.aborted) {
    stream.destroy(abortError());
    return;
  }

  signal.addEventListener(
    "abort",
    () => {
      stream.destroy(abortError());
    },
    { once: true }
  );
};

export const createReadStream = (path: string, signal?: AbortSignal): ReadStream => {
  const stream = fsCreateReadStream(path, {
    encoding: "utf8",
    highWaterMark: READ_HIGH_WATER_MARK,
    signal,
  });

  attachAbortHandler(stream, signal);
  return stream;
};

export const createWriteStream = (path: string, signal?: AbortSignal): WriteStream => {
  const stream = fsCreateWriteStream(path, {
    highWaterMark: WRITE_HIGH_WATER_MARK,
    signal,
  });

  attachAbortHandler(stream, signal);
  return stream;
};
