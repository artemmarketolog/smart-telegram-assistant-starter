import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface OutboxMessage {
  id: number;
  chatId: number;
  text: string;
  attempts: number;
}

export class StateStore {
  private readonly db: Database;

  constructor(
    path: string,
    private readonly contextTtlMinutes: number,
    private readonly contextTurnLimit: number,
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    try {
      chmodSync(path, 0o600);
    } catch {
      // Например, in-memory DB в тесте.
    }
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_updates (
        update_id INTEGER PRIMARY KEY,
        processed_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        question TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_turns_chat_time
        ON conversation_turns(chat_id, created_at_ms DESC);
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update_id INTEGER NOT NULL,
        part INTEGER NOT NULL,
        chat_id TEXT NOT NULL,
        text TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
        UNIQUE(update_id, part)
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.pruneExpiredContext();
    if (this.contextTurnLimit === 0) this.db.exec("DELETE FROM conversation_turns;");
  }

  isProcessed(updateId: number): boolean {
    return !!this.db.query("SELECT 1 FROM processed_updates WHERE update_id = ?").get(updateId);
  }

  commitUpdate(
    updateId: number,
    chatId: number,
    question: string,
    receipt: Record<string, unknown> | null,
    messages: string[],
  ): boolean {
    return this.db.transaction(() => {
      const inserted = this.db
        .query("INSERT OR IGNORE INTO processed_updates (update_id, processed_at_ms) VALUES (?, ?)")
        .run(updateId, Date.now());
      if (Number(inserted.changes) === 0) return false;
      messages.forEach((text, part) => {
        this.db
          .query("INSERT INTO outbox (update_id, part, chat_id, text) VALUES (?, ?, ?, ?)")
          .run(updateId, part, String(chatId), text);
      });
      if (receipt && this.contextTurnLimit > 0) {
        this.db
          .query("INSERT INTO conversation_turns (chat_id, question, receipt_json, created_at_ms) VALUES (?, ?, ?, ?)")
          .run(String(chatId), question.slice(0, 2_000), JSON.stringify(receipt), Date.now());
      }
      this.pruneContext(chatId);
      return true;
    })();
  }

  recentContext(chatId: number): string[] {
    if (this.contextTurnLimit === 0) return [];
    this.pruneContext(chatId);
    const rows = this.db
      .query(
        `SELECT question, receipt_json
         FROM conversation_turns
         WHERE chat_id = ?
         ORDER BY created_at_ms DESC, id DESC
         LIMIT ?`,
      )
      .all(String(chatId), this.contextTurnLimit) as Array<{ question: string; receipt_json: string }>;
    return rows.reverse().map((row) =>
      JSON.stringify({
        previous_question: row.question,
        applied_plan: JSON.parse(row.receipt_json) as unknown,
      })
    );
  }

  private pruneContext(chatId: number): void {
    this.pruneExpiredContext();
    if (this.contextTurnLimit === 0) {
      this.db.query("DELETE FROM conversation_turns WHERE chat_id = ?").run(String(chatId));
      return;
    }
    this.db.query(
      `DELETE FROM conversation_turns
       WHERE chat_id = ? AND id NOT IN (
         SELECT id FROM conversation_turns WHERE chat_id = ?
         ORDER BY created_at_ms DESC, id DESC LIMIT ?
       )`,
    ).run(String(chatId), String(chatId), this.contextTurnLimit);
  }

  private pruneExpiredContext(): void {
    const cutoff = Date.now() - this.contextTtlMinutes * 60_000;
    this.db.query("DELETE FROM conversation_turns WHERE created_at_ms < ?").run(cutoff);
  }

  pendingOutbox(limit = 20): OutboxMessage[] {
    this.pruneExpiredContext();
    return this.db
      .query(
        `SELECT id, CAST(chat_id AS INTEGER) AS chatId, text, attempts
         FROM outbox WHERE next_attempt_at_ms <= ?
         ORDER BY id LIMIT ?`,
      )
      .all(Date.now(), limit) as OutboxMessage[];
  }

  markOutboxSent(id: number): void {
    this.db.query("DELETE FROM outbox WHERE id = ?").run(id);
  }

  markOutboxFailed(id: number, delayMs: number): void {
    this.db
      .query("UPDATE outbox SET attempts = attempts + 1, next_attempt_at_ms = ? WHERE id = ?")
      .run(Date.now() + delayMs, id);
  }

  dropOutboxPermanentFailure(id: number): void {
    this.db.query("DELETE FROM outbox WHERE id = ?").run(id);
  }

  telegramOffset(): number {
    const row = this.db.query("SELECT value FROM metadata WHERE key = 'telegram_offset'").get() as
      | { value: string }
      | null;
    return row ? Number(row.value) || 0 : 0;
  }

  setTelegramOffset(offset: number): void {
    this.db.query(
      `INSERT INTO metadata (key, value) VALUES ('telegram_offset', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(String(offset));
  }

  close(): void {
    this.db.close();
  }
}
