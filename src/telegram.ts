import type { RuntimeConfig } from "./config.ts";
import { logEvent } from "./logger.ts";
import type { TableAssistant } from "./assistant.ts";
import type { StateStore } from "./store.ts";

const TELEGRAM_API = "https://api.telegram.org";
const RETRY_DELAYS_MS = [400, 1_200, 3_000] as const;

interface TelegramMessage {
  message_id?: number;
  from?: { id?: number };
  chat?: { id?: number; type?: string };
  text?: string;
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

class TelegramError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    readonly retriable: boolean,
  ) {
    super(`telegram_${status}`);
  }
}

export function isAuthorizedPrivateMessage(message: TelegramMessage | undefined, ownerId: number): boolean {
  return !!message &&
    message.chat?.type === "private" &&
    message.from?.id === ownerId &&
    message.chat?.id === ownerId;
}

async function telegramCall<T>(
  token: string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 40_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      result?: T;
      parameters?: { retry_after?: number };
    };
    if (!response.ok || body.ok !== true) {
      const retryAfter = Number(body.parameters?.retry_after);
      const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
      throw new TelegramError(
        response.status,
        retryAfterSeconds,
        response.status === 429 || response.status >= 500,
      );
    }
    return body.result as T;
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    throw new TelegramError(0, null, true);
  } finally {
    clearTimeout(timeout);
  }
}

type SendOutcome = "sent" | "retry_later" | "permanent_failure";

async function sendWithRetry(token: string, chatId: number, text: string): Promise<SendOutcome> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await telegramCall(token, "sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }, 15_000);
      return "sent";
    } catch (error) {
      const telegramError = error as TelegramError;
      if (!telegramError.retriable) return "permanent_failure";
      if (attempt === RETRY_DELAYS_MS.length) return "retry_later";
      const delay = telegramError.retryAfterSeconds
        ? telegramError.retryAfterSeconds * 1_000
        : RETRY_DELAYS_MS[attempt]!;
      await Bun.sleep(delay + Math.floor(Math.random() * 150));
    }
  }
  return "retry_later";
}

export class TelegramBot {
  private stopped = false;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly assistant: TableAssistant,
    private readonly store: StateStore,
  ) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    logEvent("info", "telegram_started", { owner_id_configured: true, private_chat_only: true });
    let offset = this.store.telegramOffset();
    while (!this.stopped) {
      await this.flushOutbox();
      try {
        const updates = await telegramCall<TelegramUpdate[]>(
          this.config.telegramToken,
          "getUpdates",
          { offset, timeout: 30, allowed_updates: ["message"] },
          40_000,
        );
        for (const update of updates) {
          const updateId = Number(update.update_id);
          if (!Number.isSafeInteger(updateId)) continue;
          const handled = await this.handleUpdate(updateId, update.message);
          if (handled) {
            offset = Math.max(offset, updateId + 1);
            this.store.setTelegramOffset(offset);
          }
        }
      } catch (error) {
        const code = error instanceof TelegramError ? `telegram_${error.status}` : "poll_failed";
        logEvent("warn", "telegram_poll_failed", { code });
        await Bun.sleep(1_000);
      }
    }
    await this.flushOutbox();
    logEvent("info", "telegram_stopped");
  }

  private async handleUpdate(updateId: number, message: TelegramMessage | undefined): Promise<boolean> {
    if (!isAuthorizedPrivateMessage(message, this.config.ownerId)) {
      logEvent("info", "telegram_update_ignored", { update_id: updateId });
      return true;
    }
    if (this.store.isProcessed(updateId)) return true;
    const chatId = message!.chat!.id!;
    const text = message!.text;
    if (typeof text !== "string") {
      this.store.commitUpdate(updateId, chatId, "", null, ["Пока поддерживаются только текстовые сообщения."]);
      await this.flushOutbox();
      return true;
    }

    void telegramCall(this.config.telegramToken, "sendChatAction", { chat_id: chatId, action: "typing" }, 5_000)
      .catch(() => undefined);
    const started = Date.now();
    const reply = await this.assistant.answer(chatId, text);
    this.store.commitUpdate(updateId, chatId, text, reply.receipt, reply.messages);
    logEvent("info", "telegram_update_processed", {
      update_id: updateId,
      latency_ms: Date.now() - started,
      response_parts: reply.messages.length,
    });
    await this.flushOutbox();
    return true;
  }

  private async flushOutbox(): Promise<void> {
    for (const item of this.store.pendingOutbox()) {
      const outcome = await sendWithRetry(this.config.telegramToken, item.chatId, item.text);
      if (outcome === "sent") {
        this.store.markOutboxSent(item.id);
      } else if (outcome === "permanent_failure") {
        this.store.dropOutboxPermanentFailure(item.id);
        logEvent("error", "telegram_outbox_dead", { outbox_id: item.id, attempts: item.attempts + 1 });
      } else {
        const delay = Math.min(60_000, 2 ** Math.min(item.attempts, 8) * 1_000);
        this.store.markOutboxFailed(item.id, delay);
        logEvent("warn", "telegram_outbox_deferred", { outbox_id: item.id, attempts: item.attempts + 1 });
      }
    }
  }
}
