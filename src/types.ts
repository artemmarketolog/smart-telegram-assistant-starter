export type ColumnType = "text" | "number" | "date" | "boolean";

export interface ColumnDefinition {
  type: ColumnType;
  description: string;
  aliases: string[];
}

export interface SourceDefinition {
  id: string;
  label: string;
  description: string;
  path: string;
  primaryKey: string;
  columns: Record<string, ColumnDefinition>;
}

export interface LoadedSource extends SourceDefinition {
  absolutePath: string;
}

export interface SourceCatalogItem {
  id: string;
  label: string;
  description: string;
  primary_key: string;
  columns: Array<{
    name: string;
    type: ColumnType;
    description: string;
    aliases: string[];
  }>;
}

export interface TableRow {
  values: Record<string, string | null>;
  provenance: {
    source_id: string;
    row_number: number;
    primary_key: string;
  };
}

export interface TableSnapshot {
  source: LoadedSource;
  rows: TableRow[];
  revision: string;
  fetchedAt: string;
}

export type QueryOperation = "lookup" | "list" | "count" | "sum" | "average";
export type FilterOperator = "eq" | "contains" | "gt" | "gte" | "lt" | "lte";

export interface QueryFilter {
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface QuerySort {
  column: string;
  direction: "asc" | "desc";
}

export interface QueryPlan {
  source_id: string | null;
  operation: QueryOperation | null;
  filters: QueryFilter[];
  select_columns: string[];
  aggregate_column: string | null;
  sort: QuerySort | null;
  limit: number;
  clarification: string | null;
}

export interface ValidatedQueryPlan extends Omit<QueryPlan, "source_id" | "operation" | "clarification"> {
  source_id: string;
  operation: QueryOperation;
  clarification: null;
}

export interface ClarificationPlan extends Omit<QueryPlan, "source_id" | "operation" | "clarification"> {
  source_id: null;
  operation: null;
  clarification: string;
}

export interface QueryResult {
  operation: QueryOperation;
  sourceId: string;
  sourceLabel: string;
  revision: string;
  fetchedAt: string;
  matchedCount: number;
  returnedRows: TableRow[];
  selectedColumns: string[];
  aggregateColumn: string | null;
  aggregateValue: number | null;
  truncated: boolean;
}
