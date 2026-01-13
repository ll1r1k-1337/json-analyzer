import { createReadStream, createWriteStream } from "../io/streams";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: json-analyzer <input.json> <output.bin>");
  process.exit(1);
}

const abortController = new AbortController();

process.on("SIGINT", () => {
  if (!abortController.signal.aborted) {
    console.error("Aborting: received SIGINT.");
    abortController.abort();
  }
});

const readJson = (path: string, signal: AbortSignal): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const stream = createReadStream(path, signal);
    let data = "";

    stream.on("data", (chunk: string) => {
      data += chunk;
    });

    stream.on("error", (error) => {
      stream.destroy();
      reject(new Error(`Failed to read input file "${path}": ${error.message}`));
    });

    stream.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error(`Invalid JSON in "${path}": ${message}`));
      }
    });
  });

const writeOutput = (path: string, payload: Buffer, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const stream = createWriteStream(path, signal);

    stream.on("error", (error) => {
      stream.destroy();
      reject(new Error(`Failed to write output file "${path}": ${error.message}`));
    });

    stream.on("finish", () => {
      resolve();
    });

    stream.write(payload, (error) => {
      if (error) {
        stream.destroy();
        reject(new Error(`Failed to write output file "${path}": ${error.message}`));
        return;
      }

      stream.end();
    });
  });

const run = async (): Promise<void> => {
  try {
    console.log(`Input JSON: ${inputPath}`);
    console.log(`Output binary: ${outputPath}`);

    const json = await readJson(inputPath, abortController.signal);
    const payload = Buffer.from(JSON.stringify(json), "utf8");

    await writeOutput(outputPath, payload, abortController.signal);

    console.log("Success: output written.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

void run();
