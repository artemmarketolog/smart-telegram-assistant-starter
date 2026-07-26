import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseCsv } from "./csv.ts";
import { typedValue } from "./value.ts";
import type {
  ColumnDefinition,
  ColumnType,
  LoadedSource,
  SourceCatalogItem,
  TableRow,
  TableSnapshot,
} from "./types.ts";

const MAX_SOURCES = 20;
const MAX_COLUMNS = 64;
const MAX_CSV_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 100_000;
const MAX_CELL_CHARS = 20_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} должен быть непустой строкой`);
  const trimmed = value.trim();
  if (trimmed.length > max || /[\u0000-\u001F]/.test(trimmed)) {
    throw new Error(`${field} содержит недопустимую строку`);
  }
  return trimmed;
}

function loadColumn(value: unknown, field: string): ColumnDefinition {
  if (!record(value)) throw new Error(`${field} должен быть объектом`);
  const type = requiredString(value.type, `${field}.type`) as ColumnType;
  if (!["text", "number", "date", "boolean"].includes(type)) {
    throw new Error(`${field}.type содержит неизвестный тип`);
  }
  const aliases = value.aliases ?? [];
  if (!Array.isArray(aliases) || aliases.length > 20 || aliases.some((item) =>
    typeof item !== "string" || item.length > 80 || /[\u0000-\u001F]/.test(item)
  )) {
    throw new Error(`${field}.aliases должен быть массивом строк`);
  }
  return {
    type,
    description: requiredString(value.description, `${field}.description`, 500),
    aliases: aliases.map((item) => String(item).trim()).filter(Boolean),
  };
}

function resolveInside(root: string, sourcePath: string): string {
  const absolute = resolve(root, sourcePath);
  const rel = relative(root, absolute);
  if (!rel || rel === ".") throw new Error("Путь источника должен указывать на CSV-файл");
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Источник выходит за DATA_ROOT: ${sourcePath}`);
  }
  const realRoot = realpathSync(root);
  const realSource = realpathSync(absolute);
  const realRel = relative(realRoot, realSource);
  if (realRel.startsWith("..") || isAbsolute(realRel)) {
    throw new Error(`Symlink источника выходит за DATA_ROOT: ${sourcePath}`);
  }
  return realSource;
}

export function loadSources(configPath: string, dataRoot: string): LoadedSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось прочитать SOURCE_CONFIG_PATH: ${message}`);
  }
  if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sources)) {
    throw new Error("Конфиг источников должен иметь version=1 и массив sources");
  }
  if (parsed.sources.length > MAX_SOURCES) throw new Error(`Разрешено не более ${MAX_SOURCES} источников`);

  const ids = new Set<string>();
  return parsed.sources.map((raw, index) => {
    if (!record(raw)) throw new Error(`sources[${index}] должен быть объектом`);
    const id = requiredString(raw.id, `sources[${index}].id`);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) {
      throw new Error(`sources[${index}].id должен быть lowercase slug длиной 2..64`);
    }
    if (ids.has(id)) throw new Error(`Повтор source id: ${id}`);
    ids.add(id);

    if (!record(raw.columns) || Object.keys(raw.columns).length === 0) {
      throw new Error(`sources[${index}].columns должен быть непустым объектом`);
    }
    if (Object.keys(raw.columns).length > MAX_COLUMNS) {
      throw new Error(`sources[${index}] содержит больше ${MAX_COLUMNS} колонок`);
    }
    const columns = Object.create(null) as Record<string, ColumnDefinition>;
    for (const [name, value] of Object.entries(raw.columns)) {
      if (!name.trim() || name.length > 120 || /[\u0000-\u001F]/.test(name)) {
        throw new Error(`sources[${index}] содержит недопустимое имя колонки`);
      }
      columns[name] = loadColumn(value, `sources[${index}].columns.${name}`);
    }
    const primaryKey = requiredString(raw.primary_key, `sources[${index}].primary_key`);
    if (!columns[primaryKey]) throw new Error(`primary_key ${primaryKey} не описан в columns`);
    const sourcePath = requiredString(raw.path, `sources[${index}].path`);

    return {
      id,
      label: requiredString(raw.label, `sources[${index}].label`, 120),
      description: requiredString(raw.description, `sources[${index}].description`, 500),
      path: sourcePath,
      absolutePath: resolveInside(dataRoot, sourcePath),
      primaryKey,
      columns,
    };
  });
}

export function sourceCatalog(sources: LoadedSource[]): SourceCatalogItem[] {
  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    description: source.description,
    primary_key: source.primaryKey,
    columns: Object.entries(source.columns).map(([name, column]) => ({
      name,
      type: column.type,
      description: column.description,
      aliases: column.aliases,
    })),
  }));
}

function normalizedHeaders(raw: string[]): string[] {
  const headers = raw.map((value) => value.trim());
  if (headers.some((value) => !value)) throw new Error("CSV содержит пустой заголовок");
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw new Error(`CSV содержит повторяющийся заголовок: ${header}`);
    seen.add(header);
  }
  return headers;
}

export function readSnapshot(source: LoadedSource): TableSnapshot {
  const before = statSync(source.absolutePath);
  if (!before.isFile()) throw new Error(`Источник ${source.id} должен быть обычным файлом`);
  if (before.size > MAX_CSV_BYTES) throw new Error(`Источник ${source.id} превышает лимит размера`);
  const text = readFileSync(source.absolutePath, "utf8");
  const parsed = parseCsv(text);
  if (parsed.length === 0) throw new Error(`Источник ${source.id} пуст`);
  if (parsed.length - 1 > MAX_ROWS) throw new Error(`Источник ${source.id} превышает лимит строк`);
  const headers = normalizedHeaders(parsed[0]!);
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  for (const column of Object.keys(source.columns)) {
    if (!headerIndexes.has(column)) throw new Error(`Источник ${source.id}: нет колонки ${column}`);
  }

  const keys = new Set<string>();
  const rows: TableRow[] = [];
  for (let index = 1; index < parsed.length; index++) {
    const cells = parsed[index]!;
    if (cells.every((value) => !value.trim())) continue;
    const values: Record<string, string | null> = {};
    for (const column of Object.keys(source.columns)) {
      const cell = cells[headerIndexes.get(column)!]?.trim() ?? "";
      if (cell.length > MAX_CELL_CHARS) {
        throw new Error(`Источник ${source.id}: слишком длинная ячейка в строке ${index + 1}`);
      }
      if (cell && source.columns[column]!.type !== "text" && typedValue(cell, source.columns[column]!.type) === null) {
        throw new Error(`Источник ${source.id}: неверный ${source.columns[column]!.type} в строке ${index + 1}`);
      }
      values[column] = cell || null;
    }
    const primaryKey = values[source.primaryKey];
    if (!primaryKey) throw new Error(`Источник ${source.id}: строка ${index + 1} без primary key`);
    if (keys.has(primaryKey)) {
      throw new Error(`Источник ${source.id}: duplicate primary key ${primaryKey}`);
    }
    keys.add(primaryKey);
    rows.push({
      values,
      provenance: {
        source_id: source.id,
        row_number: index + 1,
        primary_key: primaryKey,
      },
    });
  }

  const after = statSync(source.absolutePath);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    throw new Error(`Источник ${source.id} изменился во время чтения`);
  }
  return {
    source,
    rows,
    revision: `${after.size}:${Math.trunc(after.mtimeMs)}`,
    fetchedAt: new Date().toISOString(),
  };
}
