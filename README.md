# json-analyzer

## Пример использования

### CLI

```bash
npm run build
node dist/cli/index.js --input big.json --output-bin big.bin --output-meta big.meta
```

Параметры:

- `--input` — путь к входному JSON-файлу.
- `--output` — базовый путь к выходному бинарному файлу с токенами (файл `.meta`
  будет создан рядом).
- `--output-bin` — путь к выходному бинарному файлу с токенами.
- `--output-meta` — путь к файлу метаданных (строковая таблица, индекс, трейлер).

Также поддерживается позиционный вызов:

```bash
node dist/cli/index.js input.json output.bin output.meta
```

Если указан только `--output`, то файл метаданных будет создан как
`<output>.meta` либо с заменой расширения `.bin` на `.meta`.

Файлы формата:

- `*.bin` содержит только поток токенов.
- `*.meta` содержит заголовок, строковую таблицу, индекс оффсетов и трейлер.

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

- CLI-режим использует потоковый парсер, но `BinaryTokenWriter` буферизует токены
  и таблицу строк до финализации, поэтому пиковое потребление памяти зависит от
  объема токенизированных данных.
- Для потоковой обработки используйте модульное API `parseJsonStream`, чтобы
  избежать пикового использования памяти.
- В `src/io/streams.ts` заданы значения `highWaterMark` по умолчанию:
  64 КБ на чтение и 16 КБ на запись. Для больших файлов можно увеличить
  `highWaterMark` до 256 КБ–1 МБ, чтобы снизить накладные расходы на I/O,
  но это увеличит потребление памяти на буферы. Подбирайте значение по
  результатам профилирования и характеру нагрузки.
