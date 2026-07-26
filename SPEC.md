# Technical contract

## Scope

One owner asks a Telegram bot read-only questions about allowlisted tabular sources. Codex translates natural language into a typed query plan. Trusted TypeScript validates and executes that plan. No planner, calendar, web UI, generic tools, autonomous actions, or table writes are part of the reference implementation.

## Request pipeline

```text
Telegram update
→ private owner gate
→ update_id dedup
→ deterministic commands
→ Codex query plan
→ JSON Schema + runtime + semantic validation
→ allowlisted source snapshot
→ deterministic query
→ escaped render
→ transactional processed_update + outbox
→ bounded Telegram delivery retry
```

## Telegram contract

- `message.chat.type` must equal `private`.
- `message.from.id` and `message.chat.id` must both equal `TELEGRAM_OWNER_ID`.
- Authorization runs before any side effect.
- Only `message` updates are requested; edited/channel/group messages are ignored.
- One `update_id` is committed once. Output parts share that update.
- A sent outbox record is deleted; a failed one remains with bounded backoff.

## Brain contract

Input:

- current date and configured IANA timezone;
- source IDs and descriptions;
- allowed column names/types/descriptions/aliases;
- current question;
- at most four recent `{previous_question, applied_plan}` receipts.

Forbidden brain input:

- table cells;
- Telegram or connector credentials;
- application environment;
- database contents;
- arbitrary file paths or URLs.

Output is `QueryPlan`:

```ts
{
  source_id: string | null;
  operation: "lookup" | "list" | "count" | "sum" | "average" | null;
  filters: Array<{
    column: string;
    operator: "eq" | "contains" | "gt" | "gte" | "lt" | "lte";
    value: string;
  }>;
  select_columns: string[];
  aggregate_column: string | null;
  sort: { column: string; direction: "asc" | "desc" } | null;
  limit: number;
  clarification: string | null;
}
```

The executor rejects extra fields, unknown IDs/columns/operators, invalid limits, ordered comparisons on text, and aggregates on non-number columns.

## Source contract

Each source has:

- lowercase stable `id`;
- local CSV `path` contained by `DATA_ROOT`;
- stable `primary_key`;
- explicit allowlist of columns;
- type and natural-language description for each column.

At read time the adapter rejects blank/duplicate headers, missing configured columns, empty/duplicate primary keys, invalid declared number/date/boolean values, oversized snapshots, changing files, symlink/path escapes outside `DATA_ROOT`, and ambiguous aggregates with blank values. Extra CSV columns are never exposed to the planner or executor.

Each result row carries:

```ts
{
  source_id: string;
  row_number: number;  // provenance only, never business identity
  primary_key: string;
}
```

## Storage contract

SQLite stores:

- processed Telegram update IDs;
- pending outbox parts;
- short-lived previous questions and applied plans;
- Telegram offset.

Table values are not copied into conversation context. Delivered outbox content is deleted. Context is bounded by time and turn count.

## Failure behavior

- Ambiguity → clarification, zero query/action.
- Brain timeout/invalid output → generic error code, no raw prompt/output in logs.
- Invalid source/config/CSV → generic user response; diagnostic details stay in local tests/doctor.
- Telegram 429/5xx/network → bounded retry; 4xx does not spin.
- Duplicate update → no recomputation and no duplicate outbox rows.
