import { describe, expect, test } from "bun:test";
import { StateStore } from "../src/store.ts";

describe("idempotency and outbox", () => {
  test("один update_id создаёт ответ один раз", () => {
    const store = new StateStore(":memory:", 15, 4);
    try {
      expect(store.commitUpdate(100, 42, "вопрос", { source_id: "orders" }, ["ответ"])).toBe(true);
      expect(store.commitUpdate(100, 42, "повтор", { source_id: "orders" }, ["дубль"])).toBe(false);
      expect(store.pendingOutbox()).toHaveLength(1);
      expect(store.pendingOutbox()[0]?.text).toBe("ответ");
      store.markOutboxSent(store.pendingOutbox()[0]!.id);
      expect(store.pendingOutbox()).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("контекст содержит только вопрос и receipt, не Telegram-ответ", () => {
    const store = new StateStore(":memory:", 15, 4);
    try {
      store.commitUpdate(101, 42, "статус заказа", { source_id: "orders", operation: "lookup" }, ["SECRET CELL"]);
      const context = store.recentContext(42).join("\n");
      expect(context).toContain("lookup");
      expect(context).not.toContain("SECRET CELL");
    } finally {
      store.close();
    }
  });
});
