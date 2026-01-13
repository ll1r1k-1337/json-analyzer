# json-analyzer

## Пример использования

### CLI

```bash
npm run build
node dist/cli/index.js --input big.json --output big.bin
```

Параметры:

- `--input` — путь к входному JSON-файлу.
- `--output` — путь к выходному бинарному файлу.

Также поддерживается позиционный вызов:

```bash
node dist/cli/index.js input.json output.bin
```

### Модульное API

```ts
import { createReadStream } from "node:fs";
import { parseJsonStream, type BinaryWriter } from "./src/index";

const writer: BinaryWriter = {
  writeStartObject() {},
  writeEndObject() {},
  writeStartArray() {},
  writeEndArray() {},
  writeKey(_key: string) {},
  writeString(_value: string) {},
  writeNumber(_value: number | string) {},
  writeBoolean(_value: boolean) {},
  writeNull() {},
};

await parseJsonStream(createReadStream("input.json"), writer);
```

## Ограничения и рекомендации

- CLI-режим сейчас читает весь JSON целиком в память, поэтому для больших файлов
  потребление памяти примерно соответствует размеру входа.
- Для потоковой обработки используйте модульное API `parseJsonStream`, чтобы
  избежать пикового использования памяти.
- В `src/io/streams.ts` заданы значения `highWaterMark` по умолчанию:
  64 КБ на чтение и 16 КБ на запись. Для больших файлов можно увеличить
  `highWaterMark` до 256 КБ–1 МБ, чтобы снизить накладные расходы на I/O,
  но это увеличит потребление памяти на буферы. Подбирайте значение по
  результатам профилирования и характеру нагрузки.
