import { BrainError } from "./brain.ts";
import type { OfflineConfig } from "./config.ts";
import { isClarification, planQuestion, validatePlan } from "./planner.ts";
import { executeQuery } from "./query.ts";
import { escapeHtml, renderResult, renderSources } from "./render.ts";
import { readSnapshot, sourceCatalog } from "./sources.ts";
import type { StateStore } from "./store.ts";
import type { LoadedSource } from "./types.ts";

export interface AssistantReply {
  messages: string[];
  receipt: Record<string, unknown> | null;
}

const HELP = [
  "<b>Что я умею</b>",
  "Задайте вопрос по подключённой таблице обычным языком.",
  "",
  "Примеры:",
  "• «Какой статус у заказа ORD-1002?»",
  "• «Сколько оплаченных заказов у Анны?»",
  "• «Какая сумма оплаченных заказов?»",
  "",
  "Команды: /sources · /health · /help",
  "Бот работает только на чтение.",
].join("\n");

export class TableAssistant {
  constructor(
    private readonly config: OfflineConfig,
    private readonly sources: LoadedSource[],
    private readonly store: StateStore,
  ) {}

  async answer(chatId: number, input: string): Promise<AssistantReply> {
    const text = input.trim();
    const command = text.split(/\s+/, 1)[0]?.toLowerCase();
    if (command === "/start" || command === "/help") return { messages: [HELP], receipt: null };
    if (command === "/health") return { messages: ["✅ Бот работает в read-only режиме."], receipt: null };
    if (command === "/sources") {
      return { messages: [renderSources(sourceCatalog(this.sources))], receipt: null };
    }
    if (!text) return { messages: ["Отправьте текстовый вопрос по таблице."], receipt: null };
    if (text.length > 2_000) return { messages: ["Сообщение слишком длинное. Лимит — 2000 символов."], receipt: null };

    try {
      const rawPlan = await planQuestion(text, this.sources, this.store.recentContext(chatId), this.config);
      const plan = validatePlan(rawPlan, this.sources);
      if (isClarification(plan)) {
        return {
          messages: [escapeHtml(plan.clarification || "Уточните вопрос.")],
          receipt: { kind: "clarification" },
        };
      }
      const source = this.sources.find((item) => item.id === plan.source_id)!;
      const snapshot = readSnapshot(source);
      const result = executeQuery(snapshot, plan);
      return {
        messages: renderResult(result),
        receipt: {
          kind: "table_query",
          source_id: plan.source_id,
          operation: plan.operation,
          filters: plan.filters,
          select_columns: plan.select_columns,
          aggregate_column: plan.aggregate_column,
          sort: plan.sort,
        },
      };
    } catch (error) {
      if (error instanceof BrainError) {
        const messages: Record<BrainError["code"], string> = {
          busy: "Сейчас слишком много запросов. Попробуйте ещё раз через минуту.",
          timeout: "Мозг не успел ответить. Попробуйте сформулировать вопрос короче.",
          failed: "Не удалось построить безопасный план запроса. Попробуйте ещё раз.",
          invalid_output: "Мозг вернул некорректный план. Данные не запрашивались.",
        };
        return { messages: [messages[error.code]], receipt: null };
      }
      return {
        messages: ["Не удалось безопасно выполнить запрос. Проверьте схему источника или уточните вопрос."],
        receipt: null,
      };
    }
  }
}
