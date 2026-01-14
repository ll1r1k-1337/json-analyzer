import { once } from "node:events";
import { createReadStream, createWriteStream } from "../io/streams";
import { parseJsonStream } from "../parser/streamParser";
import { BinaryTokenWriter } from "../binary/writer";

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
const outputBinFlag = readFlagValue("--output-bin");
const outputMetaFlag = readFlagValue("--output-meta");
const positionalArgs = args.filter(
  (value, index) => !consumedArgs.has(index) && !value.startsWith("--")
);

const inputPath = inputFlag ?? positionalArgs[0];
const outputBinPath = outputBinFlag ?? positionalArgs[1];
const outputMetaPath = outputMetaFlag ?? positionalArgs[2];

if (!inputPath || !outputBinPath || !outputMetaPath) {
  console.error(
    "Usage: json-analyzer <input.json> <output.bin> <output.meta> " +
      "or json-analyzer --input <input.json> --output-bin <output.bin> --output-meta <output.meta>"
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
  stream: NodeJS.ReadableStream,
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

    console.log("Success: output written.");
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
