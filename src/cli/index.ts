import { once } from "node:events";
import { createReadStream, createWriteStream } from "../io/streams.js";
import { parseJsonStream } from "../parser/streamParser.js";
import { BinaryTokenWriter } from "../binary/writer.js";

const args = process.argv.slice(2);
const consumedArgs = new Set<number>();

const readFlagValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  consumedArgs.add(index);
  const value = args[index + 1];
  if (value) {
    consumedArgs.add(index + 1);
  }
  return value;
};

const inputFlag = readFlagValue("--input");
const outputFlag = readFlagValue("--output");
const outputBinFlag = readFlagValue("--output-bin");
const outputMetaFlag = readFlagValue("--output-meta");
const positionalArgs = args.filter(
  (value, index) => !consumedArgs.has(index) && !value.startsWith("--")
);

const inputPath = inputFlag ?? positionalArgs[0];
const outputBinPath = outputBinFlag ?? positionalArgs[1] ?? outputFlag;
const outputMetaPath =
  outputMetaFlag ??
  positionalArgs[2] ??
  (outputFlag
    ? outputFlag.endsWith(".bin")
      ? outputFlag.replace(/\.bin$/i, ".meta")
      : `${outputFlag}.meta`
    : undefined);

if (!inputPath || !outputBinPath || !outputMetaPath) {
  console.error(
    "Usage: json-analyzer <input.json> <output.bin> <output.meta> " +
      "or json-analyzer --input <input.json> --output-bin <output.bin> --output-meta <output.meta> " +
      "or json-analyzer --input <input.json> --output <output.bin>"
  );
  process.exit(1);
}

const abortController = new AbortController();

process.on("SIGINT", () => {
  if (!abortController.signal.aborted) {
    console.error("Aborting: received SIGINT.");
    abortController.abort();
  }
});

const watchStreamError = (
  stream: NodeJS.ReadableStream | NodeJS.WritableStream,
  message: string,
  cleanup: Array<() => void>
): Promise<never> =>
  new Promise((_, reject) => {
    const onError = (error: Error) => {
      reject(new Error(`${message}: ${error.message}`));
    };
    stream.once("error", onError);
    cleanup.push(() => stream.off("error", onError));
  });

const run = async (): Promise<void> => {
  const cleanupHandlers: Array<() => void> = [];
  try {
    console.log(`Input JSON: ${inputPath}`);
    console.log(`Output token stream: ${outputBinPath}`);
    console.log(`Output metadata: ${outputMetaPath}`);

    const readStream = createReadStream(inputPath, abortController.signal);
    const tokenStream = createWriteStream(outputBinPath, abortController.signal);
    const metadataStream = createWriteStream(outputMetaPath, abortController.signal);
    const streamErrors = [
      watchStreamError(
        readStream,
        `Failed to read input file "${inputPath}"`,
        cleanupHandlers
      ),
      watchStreamError(
        tokenStream,
        `Failed to write output file "${outputBinPath}"`,
        cleanupHandlers
      ),
      watchStreamError(
        metadataStream,
        `Failed to write output file "${outputMetaPath}"`,
        cleanupHandlers
      ),
    ];

    const writer = new BinaryTokenWriter(tokenStream, metadataStream);
    await Promise.race([parseJsonStream(readStream, writer), ...streamErrors]);
    await writer.finalize();
    tokenStream.end();
    metadataStream.end();
    await Promise.all([once(tokenStream, "finish"), once(metadataStream, "finish")]);

    const stats = writer.getStats();
    console.log("Success: output written.");
    console.log("Analysis Report:");
    console.log("  Tokens:");
    console.log(`    Objects:  ${stats.tokens.objects}`);
    console.log(`    Arrays:   ${stats.tokens.arrays}`);
    console.log(`    Keys:     ${stats.tokens.keys}`);
    console.log(`    Strings:  ${stats.tokens.strings}`);
    console.log(`    Numbers:  ${stats.tokens.numbers}`);
    console.log(`    Booleans: ${stats.tokens.booleans}`);
    console.log(`    Nulls:    ${stats.tokens.nulls}`);
    console.log("  String Deduplication:");
    console.log(`    Unique Strings: ${stats.strings.uniqueCount}`);
    console.log(`    Total Strings:  ${stats.strings.totalCount}`);
    console.log(`    Unique Bytes:   ${stats.strings.uniqueBytes}`);
    console.log(`    Total Bytes:    ${stats.strings.totalBytes}`);
    if (stats.strings.totalBytes > 0) {
      const saved = stats.strings.totalBytes - stats.strings.uniqueBytes;
      const ratio = (saved / stats.strings.totalBytes) * 100;
      console.log(`    Saved:          ${saved} bytes (${ratio.toFixed(2)}%)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    for (const cleanup of cleanupHandlers) {
      cleanup();
    }
  }
};

void run();
