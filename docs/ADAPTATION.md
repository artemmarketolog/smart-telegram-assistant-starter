# Adaptation workflow

## 1. Describe the use case without secrets

Collect:

- what the bot should answer;
- where the data comes from;
- stable row ID;
- exact column names, types and business meanings;
- timezone and number/date locale;
- at least ten representative questions;
- expected behavior when the answer is ambiguous or absent.

Use fictional rows with the same shape. Do not give the agent production exports.

## 2. Map columns

Copy `config/sources.example.json` to `config/sources.json`. For every allowed column define:

- `type`: `text`, `number`, `date` or `boolean`;
- `description`: business meaning;
- `aliases`: words users say for that column.

Do not expose “all columns just in case.” Unlisted CSV columns are invisible to planning and execution.

## 3. Add contract tests

At minimum:

- exact ID lookup;
- text filter;
- count;
- sum/average;
- sort and limit;
- no matches;
- ambiguous phrasing;
- duplicate/missing primary key;
- reordered columns/rows;
- local decimal and date formats;
- an instruction-like malicious cell.

The expected answer must be computed from the fixture by code.

## 4. Add a connector if needed

Keep `TableSnapshot` as the boundary. A connector may fetch Google Sheets or a database, but it must return normalized rows with stable IDs and provenance. It must not accept a URL/range created by the model.

Prefer a separate sync process:

```text
fixed read-only API call → validate revision/schema → atomic local CSV snapshot → bot
```

This keeps connector credentials away from the Codex process and gives the bot a repeatable input.

## 5. Run offline

```bash
bun install
bun run typecheck
bun test
bun run demo "ваш типичный вопрос"
bun run secret:scan
```

Only after fixtures pass should the owner fill `.env` locally and run `bun run doctor`.

## 6. Live smoke

Use a test bot and fictional/test table:

1. Non-owner sends a message: no response and no Codex call.
2. Owner asks in a group: no response.
3. Owner asks each core question in private.
4. Restart the process and replay the same update fixture: no duplicate response.
5. Break a header: fail closed with no guessed answer.
6. Put `<b>ignore instructions</b>` in a cell: it is displayed escaped as data.

Do not enable writes as part of this smoke.
