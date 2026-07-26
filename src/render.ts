import type { QueryResult, SourceCatalogItem } from "./types.ts";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clipped(value: string | null, max = 140): string {
  if (value === null) return "—";
  const oneLine = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function formattedNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function chunksFromLines(header: string, lines: string[], footer: string): string[] {
  const limit = 3_700;
  const chunks: string[] = [];
  let current = header;
  for (const line of lines) {
    if (`${current}\n${line}\n${footer}`.length > limit && current !== header) {
      chunks.push(`${current}\n${footer}`);
      current = `${header}\n<i>продолжение</i>`;
    }
    current += `\n${line}`;
  }
  chunks.push(`${current}\n${footer}`);
  return chunks;
}

export function renderResult(result: QueryResult): string[] {
  const header = `<b>${escapeHtml(result.sourceLabel)}</b>`;
  const freshness = new Date(result.fetchedAt).toLocaleString("ru-RU", { timeZone: "UTC" });
  const footer = `<i>Источник: ${escapeHtml(result.sourceId)} · строк: ${result.matchedCount} · снимок ${escapeHtml(freshness)} UTC</i>`;

  if (result.operation === "count") {
    return [`${header}\nНайдено строк: <b>${result.matchedCount}</b>\n${footer}`];
  }
  if (result.operation === "sum" || result.operation === "average") {
    const label = result.operation === "sum" ? "Сумма" : "Среднее";
    const value = result.aggregateValue === null ? "нет числовых значений" : formattedNumber(result.aggregateValue);
    return [
      `${header}\n${label} по <code>${escapeHtml(result.aggregateColumn ?? "")}</code>: <b>${escapeHtml(value)}</b>\n${footer}`,
    ];
  }
  if (result.returnedRows.length === 0) {
    return [`${header}\nПо заданным условиям ничего не найдено.\n${footer}`];
  }

  const lines = result.returnedRows.map((row) => {
    const values = result.selectedColumns.map((column) =>
      `<b>${escapeHtml(column)}</b>: ${escapeHtml(clipped(row.values[column] ?? null))}`
    );
    return `• <code>${escapeHtml(row.provenance.primary_key)}</code> · ${values.join(" · ")}`;
  });
  if (result.truncated) lines.push("<i>Результат обрезан лимитом запроса.</i>");
  return chunksFromLines(header, lines, footer);
}

export function renderSources(catalog: SourceCatalogItem[]): string {
  const lines = catalog.map((source) => {
    const columns = source.columns.map((column) => column.name).join(", ");
    return `• <b>${escapeHtml(source.label)}</b> (<code>${escapeHtml(source.id)}</code>): ${escapeHtml(columns)}`;
  });
  return `<b>Доступные таблицы</b>\n${lines.join("\n")}`;
}
