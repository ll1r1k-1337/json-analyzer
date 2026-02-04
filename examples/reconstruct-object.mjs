import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryTokenReader, TokenType } from "../dist/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(dirname, "output");
const binPath = path.join(outputDir, "sample.bin");
const metaPath = path.join(outputDir, "sample.meta");

console.log(`Reconstructing object from binary files:`);
console.log(`- Meta: ${metaPath}`);
console.log(`- Bin: ${binPath}`);

async function main() {
  let reader;
  try {
    reader = await BinaryTokenReader.fromFiles(metaPath, binPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error("Files not found. First run: npm run example:parse");
      process.exit(1);
    }
    throw error;
  }

  try {
    const trailer = reader.getTrailer();
    const totalLength = trailer.tokenStreamLength;

    let offset = 0n;
    const stack = [];
    let currentContainer = undefined;
    let currentKey = undefined;
    let root = undefined;

    while (offset < totalLength) {
      const { token, byteLength } = await reader.readTokenAt(offset);
      offset += BigInt(byteLength);

      let value;
      let handled = false;

      switch (token.type) {
        case TokenType.StartObject:
          value = {};
          if (currentContainer === undefined) {
             root = value;
          } else if (Array.isArray(currentContainer)) {
             currentContainer.push(value);
          } else {
             currentContainer[currentKey] = value;
             currentKey = undefined;
          }
          stack.push(currentContainer);
          currentContainer = value;
          handled = true;
          break;

        case TokenType.EndObject:
          currentContainer = stack.pop();
          handled = true;
          break;

        case TokenType.StartArray:
          value = [];
          if (currentContainer === undefined) {
             root = value;
          } else if (Array.isArray(currentContainer)) {
             currentContainer.push(value);
          } else {
             currentContainer[currentKey] = value;
             currentKey = undefined;
          }
          stack.push(currentContainer);
          currentContainer = value;
          handled = true;
          break;

        case TokenType.EndArray:
          currentContainer = stack.pop();
          handled = true;
          break;

        case TokenType.Key:
          currentKey = token.value;
          handled = true;
          break;

        case TokenType.String:
          value = token.value;
          break;

        case TokenType.Number:
           value = Number(token.value);
           break;

        case TokenType.True:
           value = true;
           break;

        case TokenType.False:
           value = false;
           break;

        case TokenType.Null:
           value = null;
           break;
      }

      if (!handled) {
          // It's a value (String, Number, Bool, Null)
          if (currentContainer === undefined) {
              // Single value at root
              root = value;
          } else if (Array.isArray(currentContainer)) {
              currentContainer.push(value);
          } else {
              currentContainer[currentKey] = value;
              currentKey = undefined;
          }
      }
    }

    console.log("\nReconstructed Object:");
    try {
      console.log(JSON.stringify(root, null, 2));
    } catch (error) {
      if (error instanceof RangeError) {
        console.error("Error: Object is too large to display as a string.");
        if (Array.isArray(root)) {
          console.log(`Array with ${root.length} items.`);
        } else if (typeof root === 'object' && root !== null) {
          console.log(`Object with keys: ${Object.keys(root).slice(0, 10).join(', ')}${Object.keys(root).length > 10 ? '...' : ''}`);
        } else {
          console.log(root);
        }
      } else {
        throw error;
      }
    }

  } finally {
    if (reader) await reader.close();
  }
}

main().catch(console.error);
