# Troubleshooting

| Symptom | Check | Safe fix |
| --- | --- | --- |
| Bot is silent | `bun run doctor`; token/owner show only set/missing | Fill `.env` locally, restart one process |
| Owner gets no answer in a group | Expected behavior | Use private chat; do not enable groups casually |
| Telegram `401` | Bot token revoked or malformed | Rotate at BotFather, update env locally |
| Telegram `409 Conflict` | Another poller/webhook is active | Stop the other instance or remove the webhook |
| Telegram `400` | Invalid HTML or message size | Reproduce with fictional data; keep escaping/clipping |
| Codex `failed` | `codex --version`, local auth, selected model | Re-authenticate the restricted user; unset `CODEX_MODEL` |
| Codex timeout/busy | Queue, prompt size, process limits | Shorten schema/context; raise limits only after measurement |
| Source config not found | `SOURCE_CONFIG_PATH` | Copy the example and use an absolute production path |
| “Source exits DATA_ROOT” | CSV path traversal | Move snapshot under `DATA_ROOT`; do not relax containment |
| Missing/duplicate header | CSV export/schema drift | Fix mapping/export; do not guess a header |
| Duplicate primary key | Source data is ambiguous | Add/fix a stable ID in the system of record |
| Wrong date result | Column type/locale/canonical format | Normalize in the connector and add a fixture |
| Wrong decimal result | Comma/space/currency format | Normalize before snapshot or extend number tests |
| Google Sheet permission error | Identity, exact spreadsheet and read-only scope | Share only that sheet with the connector identity |
| Stale answer | Snapshot `fetched_at`/revision and sync worker | Fix sync; tell users the snapshot age |
| SQLite locked | Two bot processes or network filesystem | Run one poller and keep DB on local disk |
| Repeated answer after restart | DB path changed/lost | Use one persistent `STATE_DB_PATH` |
| Voice ignored | Not implemented in the core | Follow `docs/VOICE.md` and add safety tests |

Never diagnose by printing the full environment, Telegram update, table row, Codex prompt, or credentials. Use error codes, counts and fictional reproductions.
