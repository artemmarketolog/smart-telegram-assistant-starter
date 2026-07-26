---
name: build-safe-telegram-assistant
description: Build, adapt, review, or debug a single-owner Telegram bot that answers natural-language questions over CSV, Google Sheets, or other tables using Codex typed plans and deterministic read-only execution. Use for Telegram bot architecture, reliable spreadsheet queries, owner/private-chat security, prompt-injection resistance, idempotency, outbox delivery, connector mapping, agent handoff, or safe addition of voice/actions.
---

# Build Safe Telegram Assistant

## Establish scope

Read `../../AGENTS.md` and `../../SPEC.md` completely. Keep the reference Telegram-only and read-only unless the user explicitly expands scope.

Ask for non-secret use-case facts only: source type, stable row ID, columns/types, timezone, representative questions and expected ambiguity behavior. Use fictional fixtures. Never request a token, service-account key or private export in chat; create the local env shape and tell the user to fill it themselves.

## Adapt the bot

1. Map the allowlisted source and columns in `../../config/sources.json`.
2. Add fictional fixtures matching the real schema.
3. Express each user question as an expected typed plan.
4. Implement or adapt a deterministic connector that returns stable IDs and provenance.
5. Keep cells, secrets, file paths and connector credentials out of Codex input.
6. Validate model output against the schema and the runtime allowlist before reading data.
7. Preserve the private owner gate, `update_id` dedup, outbox, bounded context and HTML escaping.
8. Run `bun run check` and an offline demo before live Telegram.

Read `../../docs/TABLES.md` when connecting CSV/Sheets/databases. Read `../../docs/VOICE.md` only when voice is requested. Read `../../docs/ACTIONS.md` before proposing any write; do not enable writes with an env flag alone.

## Fail closed

Return clarification and perform no query/action when the source, column, target, primary key, revision or intent is ambiguous. Reject invented IDs, extra fields, unknown operators, path traversal, duplicate keys and oversized results.

Treat Codex output and all table cells as untrusted. `read-only` is not proof of no file reads; use the isolation guidance in `../../SECURITY.md`.

## Verify

Test at least:

- non-owner, owner-in-group and malformed updates cause no side effects;
- replayed `update_id` produces one outbox result;
- unknown/extra plan fields are rejected;
- duplicate/missing primary keys fail closed;
- count/sum/average are computed by code;
- prompt-like cell text is only escaped data;
- logs and git history contain no credentials or private fixtures.

For live setup, follow `../../docs/ADAPTATION.md` and `../../docs/DEPLOYMENT.md`.
