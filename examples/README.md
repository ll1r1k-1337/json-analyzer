# Примеры использования

## Быстрый старт

```bash
npm run build
# Генерация бинарного файла
node examples/parse-to-binary.mjs
# Чтение бинарного файла
node examples/read-binary.mjs
```

Скрипт записи читает `examples/data/sample.json` и создает бинарные файлы в
`examples/output`.
Скрипт чтения открывает созданные файлы (`.meta` и `.bin`) и выводит список токенов.

## Запуск через npm-скрипт

```bash
# Парсинг JSON в бинарный формат
npm run example:parse

# Чтение бинарного формата
npm run example:read
```
