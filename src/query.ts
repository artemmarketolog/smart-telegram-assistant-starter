import type {
  ColumnType,
  QueryFilter,
  QueryResult,
  TableRow,
  TableSnapshot,
  ValidatedQueryPlan,
} from "./types.ts";
import { normalizeText, parseNumber, typedValue } from "./value.ts";

function compare(row: TableRow, filter: QueryFilter, type: ColumnType): boolean {
  const raw = row.values[filter.column];
  if (raw === null || raw === undefined) return false;
  if (filter.operator === "contains") {
    return normalizeText(raw).includes(normalizeText(filter.value));
  }
  const left = typedValue(raw, type);
  const right = typedValue(filter.value, type);
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (filter.operator === "eq") return left === right;
  if (typeof left !== "number" || typeof right !== "number") return false;
  if (filter.operator === "gt") return left > right;
  if (filter.operator === "gte") return left >= right;
  if (filter.operator === "lt") return left < right;
  return left <= right;
}

function compareForSort(a: string | null, b: string | null, type: ColumnType): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const left = typedValue(a, type);
  const right = typedValue(b, type);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function executeQuery(snapshot: TableSnapshot, plan: ValidatedQueryPlan): QueryResult {
  let rows = snapshot.rows.filter((row) =>
    plan.filters.every((filter) => compare(row, filter, snapshot.source.columns[filter.column]!.type))
  );
  if (plan.sort) {
    const { column, direction } = plan.sort;
    const type = snapshot.source.columns[column]!.type;
    rows = [...rows].sort((a, b) => {
      const result = compareForSort(a.values[column] ?? null, b.values[column] ?? null, type);
      return direction === "asc" ? result : -result;
    });
  }

  let aggregateValue: number | null = null;
  if (plan.operation === "count") {
    aggregateValue = rows.length;
  } else if (plan.operation === "sum" || plan.operation === "average") {
    const values = rows
      .map((row) => {
        const raw = row.values[plan.aggregate_column!];
        if (raw === null || raw === undefined) {
          throw new Error(`aggregate column ${plan.aggregate_column} contains a blank value`);
        }
        const value = parseNumber(raw);
        if (value === null) throw new Error(`aggregate column ${plan.aggregate_column} contains an invalid number`);
        return value;
      });
    const sum = values.reduce((total, value) => total + value, 0);
    aggregateValue = plan.operation === "sum" ? sum : values.length > 0 ? sum / values.length : null;
  }

  const shouldReturnRows = plan.operation === "lookup" || plan.operation === "list";
  const returnedRows = shouldReturnRows ? rows.slice(0, plan.limit) : [];
  return {
    operation: plan.operation,
    sourceId: snapshot.source.id,
    sourceLabel: snapshot.source.label,
    revision: snapshot.revision,
    fetchedAt: snapshot.fetchedAt,
    matchedCount: rows.length,
    returnedRows,
    selectedColumns: plan.select_columns,
    aggregateColumn: plan.aggregate_column,
    aggregateValue,
    truncated: shouldReturnRows && rows.length > returnedRows.length,
  };
}
