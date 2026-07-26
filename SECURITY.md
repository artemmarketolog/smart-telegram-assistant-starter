# Security

## Supported use

The starter is designed for one owner, private Telegram chat, read-only local CSV snapshots, and a dedicated runtime. It is not a multi-user SaaS and does not implement table writes.

## Security properties

- Owner ID and private-chat checks happen before Codex or data access.
- Telegram and connector secrets stay in the parent process and are not passed to Codex.
- Codex output is constrained by JSON Schema and checked again at runtime.
- The LLM cannot select an unknown source, column, operator, file path, URL, SQL, or shell command.
- Table cells are not sent to Codex.
- Source paths cannot escape `DATA_ROOT`.
- Telegram updates are idempotent and responses use an outbox.
- Dynamic Telegram HTML is escaped.
- Logs exclude message/table content and secrets.
- `.env`, databases, snapshots, logs, and credentials are gitignored.

## Important limitation

Codex CLI needs access to its own authentication state. A temporary working directory, an env allowlist, `--ephemeral`, and `-s read-only` reduce exposure, but do not prove that the process cannot read every file visible to its OS user.

For private or regulated data:

- run Codex as a dedicated Unix user/container with no application DB, table snapshots, SSH keys, browser profiles, or unrelated credentials;
- mount only the minimal Codex auth/config it needs;
- keep Telegram and source credentials in the trusted parent/connector process;
- verify the isolation again after Codex/runtime updates.

Do not describe `read-only` as “no file access.”

## Secrets

- Never commit `.env`, service-account JSON, OAuth refresh tokens, database files, exported private tables, audio, logs, HAR files, screenshots, or backups.
- Ask users to enter secrets locally. Do not ask them to paste tokens into an agent chat.
- Use least-privilege, read-only connector scopes and share only the required spreadsheet.
- Rotate a credential immediately if it may have entered git history; deleting the working-tree file is not enough.

Run:

```bash
bun run secret:scan
git log -p --all | your-approved-history-scanner
```

The bundled scanner is a fast local guard, not a replacement for GitHub secret scanning or a dedicated history scanner such as Gitleaks/TruffleHog.

## Reporting

Do not open a public issue with a token or private dataset. Use GitHub’s private vulnerability reporting for the repository. Include a minimal fictional reproduction.
