import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryTokenReader, TokenType } from "../dist/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "sample.bin");
const metaPath = path.join(outputDir, "sample.meta");

console.log(`Чтение бинарных файлов:`);
console.log(`- Meta: ${metaPath}`);
console.log(`- Bin: ${binPath}`);

try {
  const reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
  const trailer = reader.getTrailer();
  const totalLength = trailer.tokenStreamLength;

  console.log(`\nРазмер потока токенов: ${totalLength} байт`);
  console.log("Токены:");

  let offset = 0n;
  let count = 0;

  // Limit output to avoid spamming terminal if file is huge
  const MAX_TOKENS_TO_PRINT = 100;

  while (offset < totalLength) {
    const { token, byteLength } = await reader.readTokenAt(offset);

    // Format value for display
    let valueStr = "";
    if ("value" in token) {
        valueStr = `: ${JSON.stringify(token.value)}`;
    }

    // TokenType is an enum, we can use the reverse mapping if available in TS output,
    // but in plain JS/dist, enums compile to objects.
    // Let's check if TokenType[type] works. It usually does for numeric enums in TS.

    console.log(`[${offset}] ${TokenType[token.type] ?? token.type}${valueStr}`);

    offset += BigInt(byteLength);
    count++;

    if (count >= MAX_TOKENS_TO_PRINT) {
        console.log(`... и другие данные`);
        break;
    }
  }

  await reader.close();
  console.log("\nГотово.");
} catch (error) {
  console.error("Ошибка при чтении:", error.message);
  if (error.code === 'ENOENT') {
      console.error("Файлы не найдены. Сначала запустите: npm run example:parse");
  }
}
