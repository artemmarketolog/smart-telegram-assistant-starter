# Architecture

## Design rule

Use the model for interpretation, not authority or computation.

The model may translate “сколько оплаченных заказов у Анны?” into:

```json
{
  "source_id": "orders",
  "operation": "count",
  "filters": [
    { "column": "manager", "operator": "eq", "value": "Анна" },
    { "column": "status", "operator": "eq", "value": "оплачен" }
  ],
  "select_columns": [],
  "aggregate_column": null,
  "sort": null,
  "limit": 10,
  "clarification": null
}
```

The model cannot read the rows, count them, execute a connector, or authorize a write. Trusted code checks the plan against the configured allowlist and produces the answer.

## Components

- `telegram.ts`: private owner gate, long polling, retry and outbox delivery.
- `store.ts`: `update_id` idempotency, outbox, bounded plan context and offset.
- `brain.ts`: Codex subprocess with temp cwd, env allowlist, queue cap and timeout.
- `planner.ts`: prompt, JSON Schema result and independent semantic validation.
- `sources.ts`: source config, path containment, CSV snapshot and provenance.
- `query.ts`: local typed filtering, sorting and aggregation.
- `render.ts`: deterministic HTML-safe Telegram output.
- `assistant.ts`: orchestration and deterministic commands.

## Trust boundaries

```text
Untrusted:
- Telegram update content
- Codex output
- CSV headers/cells
- Telegram API responses

Trusted:
- owner/private-chat policy
- source and column allowlists
- runtime validators
- deterministic executor
- SQLite transaction
```

CSV cells remain untrusted even though they are not sent to Codex. They are clipped and HTML-escaped before output.

## Context

Follow-up questions need some state, but replaying previous answers could leak cell values to the model. The store therefore keeps only:

- the previous owner question;
- the validated plan receipt: source, operation, filters, selected columns and sort.

The receipt is time- and count-bounded. It contains no table result rows.

## Why SQLite remains

SQLite is not a planner database here. It provides four transport guarantees:

- one processing record per Telegram `update_id`;
- durable outgoing messages;
- a restart-safe Telegram offset;
- bounded conversational receipts.

The application can be restarted after query execution but before Telegram delivery: the outbox keeps the response pending without recomputing the query.
