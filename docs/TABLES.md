# Reliable tables

## Why bots “read a table badly”

Common causes:

- the entire sheet is pasted into a prompt and truncated;
- the model calculates sums itself;
- headers change or contain duplicates;
- row numbers are treated as stable IDs;
- dates and decimals use different locales;
- empty/formula/error cells are silently coerced;
- a cell contains instruction-like text;
- a browser view is scraped instead of using a data API;
- a cached snapshot is stale but the answer looks current.

The fix is a connector contract, not a longer prompt.

## Reference CSV contract

The bundled adapter:

- reads only files below `DATA_ROOT`;
- exposes only configured columns;
- requires one unique non-empty primary key per row;
- rejects missing/blank/duplicate headers;
- validates every non-empty declared number/date/boolean cell;
- supports quoted commas and newlines;
- keeps row number only as provenance;
- records a revision derived from local file metadata.

CSV formulas are treated as strings. They are never evaluated.

## Google Sheets

For a private sheet, build a separate read-only connector or sync worker:

1. Use the official Sheets API, not browser automation.
2. Configure exact `spreadsheet_id`, sheet/tab and range outside model output.
3. Use the smallest read-only OAuth scope and grant the identity access only to that spreadsheet.
4. Store credentials outside the repository with restrictive filesystem permissions.
5. Fetch all required pages/ranges and verify a revision/ETag when available.
6. Normalize displayed/raw values deliberately:
   - stable ID from a dedicated column;
   - dates into an agreed canonical format;
   - numbers using the sheet locale;
   - blanks as `null`;
   - formulas either as formula text or displayed value, never an accidental mix.
7. Validate the full snapshot before swapping it atomically into `DATA_ROOT`.
8. Return `fetched_at`, revision and source/range provenance.

The LLM must never choose `spreadsheet_id`, credentials, URL, tab or range. It chooses only an allowlisted logical `source_id` and columns.

For public Sheets, a fixed CSV export URL can be synced by a trusted worker, but public visibility may be unacceptable. Do not use an unvalidated URL from Telegram or Codex because that creates SSRF and data-exfiltration paths.

## Large tables

Do not send rows to the model. Execute filters and aggregates locally or in the trusted database/API. Bound:

- filter count;
- selected columns;
- returned rows;
- rendered cell length;
- snapshot size and sync time.

For millions of rows, replace the in-memory CSV executor with a read-only parameterized database query builder. Preserve the same `QueryPlan` allowlist and never concatenate model text into SQL.

## Writes

Writes are not implemented. If added:

- select a row by stable ID, never row number or fuzzy title;
- require revision/ETag to detect reorder/conflict;
- protect cells beginning with `=`, `+`, `-`, or `@` from formula injection;
- preview exact before/after values;
- require an expiring confirmation token for update/delete/bulk;
- use an idempotency key;
- read back the row after commit;
- write an audit receipt and define undo.

See [ACTIONS.md](ACTIONS.md).
