# Deployment

The bot uses Telegram long polling and needs no inbound port, public domain or tunnel.

## Recommended layout

- dedicated Unix user for the bot;
- a separate, even more restricted user/container for Codex when practical;
- source code read-only;
- writable state directory for SQLite;
- writable data directory for validated snapshots;
- environment file outside git, mode `0600`;
- exactly one running poller per Telegram token.

Example paths:

```text
/opt/smart-telegram-assistant/       code, read-only
/var/lib/smart-telegram-assistant/   bot.db and snapshots
/etc/smart-telegram-assistant.env    secrets, 0600
```

Set absolute paths in the environment:

```dotenv
SOURCE_CONFIG_PATH=/opt/smart-telegram-assistant/config/sources.json
DATA_ROOT=/var/lib/smart-telegram-assistant/sources
STATE_DB_PATH=/var/lib/smart-telegram-assistant/bot.db
```

Do not expose the source or DB directory through a web server.

## Service behavior

The supervisor should:

- start `bun run start` in the repository;
- restart on failure with a short delay;
- send SIGTERM and allow outbox flush;
- apply a restrictive umask;
- limit memory, processes and file descriptors;
- allow outbound HTTPS only where your platform supports egress policy;
- keep logs content-free and rotate them.

Codex CLI authentication must belong to the restricted runtime identity. Do not mount a developer’s whole home directory into production merely to reuse Codex auth.

## Release check

```bash
bun install --frozen-lockfile
bun run check
bun run doctor
```

Then perform a test-bot smoke before switching the production service. If Telegram returns `409 Conflict`, another poller or webhook is active; stop it rather than running two instances.

Back up the SQLite state if conversational receipts/outbox matter, and back up source data at its system of record. Never commit either backup.
