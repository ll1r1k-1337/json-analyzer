# Бенчмарки

## Быстрый запуск

```bash
npm run build
node benchmarks/bench-parse.mjs
```

По умолчанию создается файл на 5000 записей. Можно переопределить размер:

```bash
RECORDS=20000 node benchmarks/bench-parse.mjs
```

Результаты и бинарные файлы сохраняются в `benchmarks/output`.

## Запуск через npm-скрипт

```bash
npm run benchmark:parse
```
