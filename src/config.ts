import { resolve } from "node:path";

export interface RuntimeConfig {
  telegramToken: string;
  ownerId: number;
  appTimezone: string;
  sourceConfigPath: string;
  dataRoot: string;
  stateDbPath: string;
  codexBin: string;
  codexModel: string | null;
  codexReasoningEffort: "low" | "medium" | "high";
  codexTimeoutMs: number;
  maxBrainQueue: number;
  allowGroups: false;
  allowWrites: false;
  logContent: false;
  contextTtlMinutes: number;
  contextTurnLimit: number;
}

export interface OfflineConfig {
  appTimezone: string;
  sourceConfigPath: string;
  dataRoot: string;
  codexBin: string;
  codexModel: string | null;
  codexReasoningEffort: "low" | "medium" | "high";
  codexTimeoutMs: number;
  maxBrainQueue: number;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} должен быть целым числом от ${min} до ${max}`);
  }
  return parsed;
}

function strictDisabled(name: string): false {
  const raw = process.env[name]?.trim() || "0";
  if (raw !== "0") {
    throw new Error(`${name}=1 не поддерживается эталонной read-only реализацией`);
  }
  return false;
}

function timezoneEnv(): string {
  const timezone = process.env.APP_TIMEZONE?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`APP_TIMEZONE содержит неизвестный часовой пояс: ${timezone}`);
  }
  return timezone;
}

function reasoningEffort(): "low" | "medium" | "high" {
  const value = process.env.CODEX_REASONING_EFFORT?.trim() || "medium";
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new Error("CODEX_REASONING_EFFORT должен быть low, medium или high");
  }
  return value;
}

export function loadOfflineConfig(overrides: Partial<OfflineConfig> = {}): OfflineConfig {
  return {
    appTimezone: overrides.appTimezone ?? timezoneEnv(),
    sourceConfigPath: resolve(overrides.sourceConfigPath ?? process.env.SOURCE_CONFIG_PATH?.trim() ?? "config/sources.json"),
    dataRoot: resolve(overrides.dataRoot ?? process.env.DATA_ROOT?.trim() ?? "data-sources"),
    codexBin: overrides.codexBin ?? process.env.CODEX_BIN?.trim() ?? "codex",
    codexModel: overrides.codexModel ?? (process.env.CODEX_MODEL?.trim() || null),
    codexReasoningEffort: overrides.codexReasoningEffort ?? reasoningEffort(),
    codexTimeoutMs: overrides.codexTimeoutMs ?? intEnv("CODEX_TIMEOUT_MS", 60_000, 5_000, 180_000),
    maxBrainQueue: overrides.maxBrainQueue ?? intEnv("MAX_BRAIN_QUEUE", 8, 0, 100),
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  const offline = loadOfflineConfig();
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const ownerRaw = process.env.TELEGRAM_OWNER_ID?.trim() || "";
  const ownerId = Number(ownerRaw);
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN обязателен");
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new Error("TELEGRAM_OWNER_ID должен быть положительным числом");
  }

  return {
    ...offline,
    telegramToken,
    ownerId,
    stateDbPath: resolve(process.env.STATE_DB_PATH?.trim() || "data/bot.db"),
    allowGroups: strictDisabled("ALLOW_GROUPS"),
    allowWrites: strictDisabled("ALLOW_WRITES"),
    logContent: strictDisabled("LOG_CONTENT"),
    contextTtlMinutes: intEnv("CONTEXT_TTL_MINUTES", 15, 1, 1440),
    contextTurnLimit: intEnv("CONTEXT_TURN_LIMIT", 6, 0, 20),
  };
}
