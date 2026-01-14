import { once } from "node:events";
import { BinaryTokenWriter } from "../binary/writer";
import { createReadStream, createWriteStream } from "../io/streams";
import { parseJsonStream } from "../index";

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
const positionalArgs = args.filter(
  (value, index) => !consumedArgs.has(index) && !value.startsWith("--")
);

const inputPath = inputFlag ?? positionalArgs[0];
const outputPath = outputFlag ?? positionalArgs[1];

if (!inputPath || !outputPath) {
  console.error(
    "Usage: json-analyzer <input.json> <output.bin> or json-analyzer --input <input.json> --output <output.bin>"
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

const createStreamError = (label: string, path: string, error: Error): Error =>
  new Error(`Failed to ${label} "${path}": ${error.message}`);

const run = async (): Promise<void> => {
  try {
    console.log(`Input JSON: ${inputPath}`);
    console.log(`Output binary: ${outputPath}`);

    const readStream = createReadStream(inputPath, abortController.signal);
    const writeStream = createWriteStream(outputPath, abortController.signal);
    const writer = new BinaryTokenWriter(writeStream);

    const readError = once(readStream, "error").then(([error]) => {
      throw createStreamError("read input file", inputPath, error as Error);
    });
    const writeError = once(writeStream, "error").then(([error]) => {
      throw createStreamError("write output file", outputPath, error as Error);
    });

    await Promise.race([
      (async () => {
        await parseJsonStream(readStream, writer);
        await writer.finalize();
        writeStream.end();
        await once(writeStream, "finish");
      })(),
      readError,
      writeError,
    ]);

    console.log("Success: output written.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

void run();
