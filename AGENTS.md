# Agent contract

This repository is a Telegram-only, read-only table assistant. Do not turn it into a planner, web app, generic autonomous agent, or public HTTP service unless the user explicitly changes scope.

Before changing code:

1. Read `SPEC.md`.
2. Read only the relevant file under `docs/`.
3. Inspect existing fixtures and tests.

## Non-negotiable invariants

- Authenticate before typing indicators, downloads, Codex, storage reads, or connectors.
- Accept only `chat.type=private`, `from.id=owner`, and `chat.id=owner`.
- Keep groups and all writes disabled by default.
- Treat the LLM output as untrusted. It may propose only the fields in the JSON schema.
- Never execute model-authored shell, SQL, JavaScript, URLs, file paths, or connector calls.
- Never pass table cells, Telegram/connector tokens, application env, or the application filesystem to Codex.
- Resolve only allowlisted source IDs, columns, operators, paths, and limits in trusted code.
- Require a stable primary key. Never use a mutable row number as business identity.
- Ambiguity, duplicate keys, missing headers, stale/conflicting revisions, or invalid plans must fail closed.
- Preserve Telegram `update_id` idempotency and the SQLite outbox.
- Escape all dynamic Telegram HTML and bound message/input sizes.
- Keep logs content-free: event IDs, stage, latency, counts, and error codes only.
- Tests must use temporary DB/files and fictional data.
- Never open, print, commit, or request real secrets. Ask the user to edit `.env` locally.

## Change workflow

1. Express new behavior as a typed contract and safety policy.
2. Add a fictional fixture and failing test.
3. Implement the smallest deterministic adapter/executor.
4. Run `bun run typecheck`, `bun test`, and `bun run secret:scan`.
5. For Telegram changes, test non-owner, owner-in-group, duplicate update, Telegram HTML, and retry paths.
6. For table changes, test reordered rows, duplicate/missing keys, locale values, truncation, and a malicious cell.

Do not enable writes by editing only `.env`. Writes require the architecture in `docs/ACTIONS.md`, policy tests, explicit user authorization, confirmation, idempotency, revision checks, and readback.
