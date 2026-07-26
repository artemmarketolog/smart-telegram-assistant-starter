import { TableAssistant } from "../src/assistant.ts";
import { loadOfflineConfig } from "../src/config.ts";
import { loadSources } from "../src/sources.ts";
import { StateStore } from "../src/store.ts";
import { resolve } from "node:path";

const question = process.argv.slice(2).join(" ").trim() || "Какая сумма оплаченных заказов у Анны?";
const config = loadOfflineConfig({
  sourceConfigPath: resolve("config/sources.example.json"),
  dataRoot: resolve("examples"),
});
const sources = loadSources(config.sourceConfigPath, config.dataRoot);
const store = new StateStore(":memory:", 15, 4);

try {
  const reply = await new TableAssistant(config, sources, store).answer(1, question);
  for (const message of reply.messages) console.log(message);
} finally {
  store.close();
}
