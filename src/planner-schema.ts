export const QUERY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "source_id",
    "operation",
    "filters",
    "select_columns",
    "aggregate_column",
    "sort",
    "limit",
    "clarification",
  ],
  properties: {
    source_id: {
      type: ["string", "null"],
      maxLength: 64,
      description: "Точный id только из каталога sources; null при уточнении",
    },
    operation: {
      enum: ["lookup", "list", "count", "sum", "average", null],
      description: "Тип детерминированной операции; null при уточнении",
    },
    filters: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["column", "operator", "value"],
        properties: {
          column: { type: "string", maxLength: 120 },
          operator: { enum: ["eq", "contains", "gt", "gte", "lt", "lte"] },
          value: { type: "string", maxLength: 500 },
        },
      },
    },
    select_columns: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 120 },
      description: "Какие колонки показать для lookup/list",
    },
    aggregate_column: {
      type: ["string", "null"],
      maxLength: 120,
      description: "Числовая колонка только для sum/average",
    },
    sort: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["column", "direction"],
          properties: {
            column: { type: "string", maxLength: 120 },
            direction: { enum: ["asc", "desc"] },
          },
        },
      ],
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      description: "Максимум строк в ответе",
    },
    clarification: {
      type: ["string", "null"],
      maxLength: 500,
      description: "Короткий вопрос, если источник/колонка/смысл неоднозначны",
    },
  },
} as const;
