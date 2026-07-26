import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadSources, readSnapshot } from "../src/sources.ts";
import { executeQuery } from "../src/query.ts";
import { validatePlan } from "../src/planner.ts";
import type { ValidatedQueryPlan } from "../src/types.ts";

const sources = loadSources(resolve("config/sources.example.json"), resolve("examples"));

describe("table query", () => {
  test("LLM строит только план, а сумма считается кодом", () => {
    const plan = validatePlan({
      source_id: "orders",
      operation: "sum",
      filters: [
        { column: "manager", operator: "eq", value: "Анна" },
        { column: "status", operator: "eq", value: "оплачен" },
      ],
      select_columns: [],
      aggregate_column: "amount",
      sort: null,
      limit: 10,
      clarification: null,
    }, sources) as ValidatedQueryPlan;
    const result = executeQuery(readSnapshot(sources[0]!), plan);
    expect(result.matchedCount).toBe(2);
    expect(result.aggregateValue).toBe(324_500);
    expect(result.returnedRows).toEqual([]);
  });

  test("не разрешает неизвестную колонку или лишнее поле", () => {
    const base = {
      source_id: "orders",
      operation: "list",
      filters: [],
      select_columns: ["status"],
      aggregate_column: null,
      sort: null,
      limit: 10,
      clarification: null,
    };
    expect(() => validatePlan({ ...base, select_columns: ["secret"] }, sources)).toThrow("неизвестную");
    expect(() => validatePlan({ ...base, shell: "rm -rf /" }, sources)).toThrow("лишние");
    expect(() => validatePlan({
      ...base,
      filters: [{ column: "status", operator: "eq", value: "оплачен", sql: "DROP TABLE" }],
    }, sources)).toThrow("лишние");
  });

  test("уточнение никогда не превращается в запрос", () => {
    const plan = validatePlan({
      source_id: "invented",
      operation: "list",
      filters: [{ column: "x", operator: "eq", value: "y" }],
      select_columns: ["x"],
      aggregate_column: null,
      sort: null,
      limit: 20,
      clarification: "По какой таблице искать?",
    }, sources);
    expect(plan.source_id).toBeNull();
    expect(plan.filters).toEqual([]);
  });

  test("не считает правдоподобную сумму при пустом числовом значении", () => {
    const plan = validatePlan({
      source_id: "orders",
      operation: "sum",
      filters: [],
      select_columns: [],
      aggregate_column: "amount",
      sort: null,
      limit: 10,
      clarification: null,
    }, sources) as ValidatedQueryPlan;
    const snapshot = readSnapshot(sources[0]!);
    snapshot.rows[0]!.values.amount = null;
    expect(() => executeQuery(snapshot, plan)).toThrow("blank");
  });
});
