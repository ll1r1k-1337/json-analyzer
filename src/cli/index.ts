const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: json-analyzer <input.json> <output.bin>");
  process.exit(1);
}

console.log(`Input JSON: ${inputPath}`);
console.log(`Output binary: ${outputPath}`);
