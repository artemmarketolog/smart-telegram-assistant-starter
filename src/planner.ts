import type { OfflineConfig } from "./config.ts";
import { runBrain } from "./brain.ts";
import { QUERY_PLAN_SCHEMA } from "./planner-schema.ts";
import type {
  FilterOperator,
  ClarificationPlan,
  LoadedSource,
  QueryOperation,
  QueryPlan,
  QuerySort,
  ValidatedQueryPlan,
} from "./types.ts";
import { sourceCatalog } from "./sources.ts";
import { typedValue } from "./value.ts";

const OPERATIONS = new Set<QueryOperation>(["lookup", "list", "count", "sum", "average"]);
const OPERATORS = new Set<FilterOperator>(["eq", "contains", "gt", "gte", "lt", "lte"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function plannerSystem(timezone: string): string {
  return [
    "Ты строишь только план READ-ONLY запроса к таблице.",
    "Ты не получаешь строки таблицы: только разрешённые источники и метаданные колонок.",
    "Верни строго JSON по схеме. Используй только точные source id и column name из каталога.",
    "lookup — одна конкретная запись; list — список; count — количество; sum/average — числовая агрегация.",
    "Фильтры должны следовать вопросу пользователя. Не придумывай значения, которых нет в вопросе.",
    "Для текстового точного значения предпочитай eq, для фрагмента — contains.",
    "gt/gte/lt/lte допустимы только для number/date.",
    "Если смысл, источник или колонка неоднозначны — заполни clarification, а source_id и operation верни null.",
    "Никогда не предлагай запись, удаление, SQL, shell, URL или программный код.",
    `Часовой пояс: ${timezone}. Сегодня: ${localDate(timezone)}.`,
  ].join(" ");
}

export async function planQuestion(
  question: string,
  sources: LoadedSource[],
  recentContext: string[],
  config: OfflineConfig,
): Promise<QueryPlan> {
  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 2_000) throw new Error("Вопрос должен содержать от 1 до 2000 символов");
  const catalog = sourceCatalog(sources);
  const recentCandidates = recentContext.slice(-4).map((item) => item.slice(0, 400));
  const recent: string[] = [];
  const payload = (): string => JSON.stringify({
    sources: catalog,
    recent_context: recent,
    current_question: trimmed,
  });
  if (payload().length > 6_500) throw new Error("Метаданные источников слишком велики для безопасного prompt");
  for (let index = recentCandidates.length - 1; index >= 0; index--) {
    const candidate = recentCandidates[index]!;
    recent.unshift(candidate);
    if (payload().length > 6_500) recent.shift();
  }
  return runBrain<QueryPlan>(
    {
      system: plannerSystem(config.appTimezone),
      user: payload(),
      schema: QUERY_PLAN_SCHEMA,
    },
    config,
  );
}

function stringOrNull(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} должен быть строкой или null`);
  const trimmed = value.trim();
  if (trimmed.length > 500) throw new Error(`${field} слишком длинный`);
  return trimmed;
}

function parseSort(value: unknown): QuerySort | null {
  if (value === null) return null;
  if (!record(value) || typeof value.column !== "string" || !["asc", "desc"].includes(String(value.direction))) {
    throw new Error("sort имеет неверный формат");
  }
  return { column: value.column, direction: value.direction as "asc" | "desc" };
}

export function validatePlan(raw: unknown, sources: LoadedSource[]): ClarificationPlan | ValidatedQueryPlan {
  if (!record(raw)) throw new Error("План должен быть объектом");
  const expected = [
    "source_id",
    "operation",
    "filters",
    "select_columns",
    "aggregate_column",
    "sort",
    "limit",
    "clarification",
  ];
  if (Object.keys(raw).some((key) => !expected.includes(key))) throw new Error("План содержит лишние поля");

  const clarification = stringOrNull(raw.clarification, "clarification");
  if (clarification) {
    return {
      source_id: null,
      operation: null,
      filters: [],
      select_columns: [],
      aggregate_column: null,
      sort: null,
      limit: 1,
      clarification,
    };
  }

  const sourceId = stringOrNull(raw.source_id, "source_id");
  const operation = stringOrNull(raw.operation, "operation") as QueryOperation | null;
  const source = sources.find((item) => item.id === sourceId);
  if (!source) throw new Error("План ссылается на неизвестный источник");
  if (!operation || !OPERATIONS.has(operation)) throw new Error("План содержит неизвестную операцию");
  if (!Array.isArray(raw.filters) || raw.filters.length > 8) throw new Error("filters имеет неверный формат");
  if (!Array.isArray(raw.select_columns) || raw.select_columns.length > 6) {
    throw new Error("select_columns имеет неверный формат");
  }
  if (!Number.isInteger(raw.limit) || Number(raw.limit) < 1 || Number(raw.limit) > 20) {
    throw new Error("limit должен быть от 1 до 20");
  }

  const columns = new Set(Object.keys(source.columns));
  const filters = raw.filters.map((item, index) => {
    if (!record(item) || typeof item.column !== "string" || typeof item.operator !== "string" ||
      typeof item.value !== "string" || !item.value.trim() || item.value.length > 500) {
      throw new Error(`filters[${index}] имеет неверный формат`);
    }
    if (Object.keys(item).some((key) => !["column", "operator", "value"].includes(key))) {
      throw new Error(`filters[${index}] содержит лишние поля`);
    }
    const operator = item.operator as FilterOperator;
    if (!columns.has(item.column) || !OPERATORS.has(operator)) {
      throw new Error(`filters[${index}] ссылается на неизвестную колонку/оператор`);
    }
    const type = source.columns[item.column]!.type;
    if (["gt", "gte", "lt", "lte"].includes(operator) && type !== "number" && type !== "date") {
      throw new Error(`filters[${index}]: сравнение порядка допустимо только для number/date`);
    }
    if (type !== "text" && typedValue(item.value, type) === null) {
      throw new Error(`filters[${index}] содержит значение неверного типа`);
    }
    return { column: item.column, operator, value: item.value.trim() };
  });

  const requestedColumns = raw.select_columns.map((value) => {
    if (typeof value !== "string" || !columns.has(value)) throw new Error("select_columns содержит неизвестную колонку");
    return value;
  });
  const selectColumns = [...new Set(requestedColumns)];
  if ((operation === "lookup" || operation === "list") && selectColumns.length === 0) {
    selectColumns.push(source.primaryKey, ...Object.keys(source.columns).filter((name) => name !== source.primaryKey).slice(0, 3));
  }

  const aggregateColumn = stringOrNull(raw.aggregate_column, "aggregate_column");
  if (operation === "sum" || operation === "average") {
    if (!aggregateColumn || source.columns[aggregateColumn]?.type !== "number") {
      throw new Error("Для sum/average нужна разрешённая number-колонка");
    }
  } else if (aggregateColumn !== null) {
    throw new Error("aggregate_column допустим только для sum/average");
  }

  const sort = parseSort(raw.sort);
  if (record(raw.sort) && Object.keys(raw.sort).some((key) => !["column", "direction"].includes(key))) {
    throw new Error("sort содержит лишние поля");
  }
  if (sort && !columns.has(sort.column)) throw new Error("sort ссылается на неизвестную колонку");
  return {
    source_id: source.id,
    operation,
    filters,
    select_columns: selectColumns,
    aggregate_column: aggregateColumn,
    sort,
    limit: Number(raw.limit),
    clarification: null,
  };
}

export function isClarification(
  plan: ClarificationPlan | ValidatedQueryPlan,
): plan is ClarificationPlan {
  return plan.clarification !== null;
}
