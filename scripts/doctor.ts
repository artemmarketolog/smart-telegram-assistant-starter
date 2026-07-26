import { existsSync } from "node:fs";
import { loadOfflineConfig } from "../src/config.ts";
import { loadSources } from "../src/sources.ts";

function status(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "✓" : "✗"} ${label}: ${detail}`);
}

let failed = false;
const config = loadOfflineConfig();

const codex = Bun.spawnSync([config.codexBin, "--version"], { stdout: "pipe", stderr: "ignore" });
status("Codex CLI", codex.exitCode === 0, codex.exitCode === 0 ? "доступен" : "не найден/не авторизован");
failed ||= codex.exitCode !== 0;

const configExists = existsSync(config.sourceConfigPath);
status("Конфиг источников", configExists, configExists ? "найден" : "скопируйте config/sources.example.json");
if (configExists) {
  try {
    const sources = loadSources(config.sourceConfigPath, config.dataRoot);
    status("CSV-источники", sources.length > 0, `валидных источников: ${sources.length}`);
    failed ||= sources.length === 0;
  } catch {
    status("CSV-источники", false, "ошибка схемы/пути (значения не выводятся)");
    failed = true;
  }
} else {
  failed = true;
}

const tokenSet = !!process.env.TELEGRAM_BOT_TOKEN?.trim();
const ownerSet = /^\d+$/.test(process.env.TELEGRAM_OWNER_ID?.trim() || "");
status("TELEGRAM_BOT_TOKEN", tokenSet, tokenSet ? "set" : "missing");
status("TELEGRAM_OWNER_ID", ownerSet, ownerSet ? "set" : "missing");
failed ||= !tokenSet || !ownerSet;

status("Read-only policy", process.env.ALLOW_WRITES !== "1", "writes disabled");
status("Private-chat policy", process.env.ALLOW_GROUPS !== "1", "groups disabled");

process.exitCode = failed ? 1 : 0;
