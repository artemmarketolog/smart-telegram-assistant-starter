import { TableAssistant } from "./assistant.ts";
import { loadRuntimeConfig } from "./config.ts";
import { logEvent } from "./logger.ts";
import { loadSources } from "./sources.ts";
import { StateStore } from "./store.ts";
import { TelegramBot } from "./telegram.ts";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const sources = loadSources(config.sourceConfigPath, config.dataRoot);
  if (sources.length === 0) throw new Error("Нужен хотя бы один источник");
  const store = new StateStore(config.stateDbPath, config.contextTtlMinutes, config.contextTurnLimit);
  const assistant = new TableAssistant(config, sources, store);
  const bot = new TelegramBot(config, assistant, store);

  const shutdown = (): void => bot.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await bot.run();
  } finally {
    store.close();
  }
}

main().catch(() => {
  logEvent("error", "fatal_startup_error", {
    code: "startup_validation_failed",
  });
  process.exitCode = 1;
});
