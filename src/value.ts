import type { ColumnType } from "./types.ts";

export function normalizeText(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function parseNumber(value: string): number | null {
  const normalized = value.replace(/[\s\u00A0]/g, "").replace(",", ".").replace(/[^\d.+-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const local = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(value.trim());
  const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3], local[2], local[1]] : null;
  if (!parts) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return stamp;
}

export function parseBoolean(value: string): boolean | null {
  const normalized = normalizeText(value);
  if (["1", "true", "да", "yes"].includes(normalized)) return true;
  if (["0", "false", "нет", "no"].includes(normalized)) return false;
  return null;
}

export function typedValue(value: string, type: ColumnType): string | number | boolean | null {
  if (type === "number") return parseNumber(value);
  if (type === "date") return parseDate(value);
  if (type === "boolean") return parseBoolean(value);
  return normalizeText(value);
}
