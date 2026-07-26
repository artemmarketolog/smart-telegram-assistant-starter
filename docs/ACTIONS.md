# Adding actions safely

The reference bot is intentionally read-only. Do not turn on writes with a boolean and reuse the read query path.

Use a separate contract:

```text
owner request
→ typed proposal
→ runtime validation
→ deterministic target resolution by stable ID
→ policy risk classification
→ preview
→ explicit expiring confirmation
→ revision check
→ idempotent execute
→ readback
→ receipt/undo record
```

## Policy levels

- Read: no confirmation.
- Create without external side effects: optional confirmation, strict limits.
- Update: confirmation with exact fields and target ID.
- Delete, bulk, recurring or external send: stronger confirmation and hard item cap.
- Shell, arbitrary HTTP, arbitrary SQL or agent-authored code: forbidden.

The model proposes intent and typed arguments. It never decides whether confirmation is required and never executes a connector.

## Confirmation

A valid confirmation binds:

- owner ID;
- action type;
- exact target IDs;
- exact normalized arguments;
- expected revision;
- idempotency key;
- expiry.

“Да” without a bound pending proposal is not authorization. A changed proposal needs a new confirmation.

## Failure rules

- zero or multiple target matches → clarification, zero writes;
- revision changed → show fresh preview, zero writes;
- partial batch failure → rollback when supported, otherwise stop and report exact receipt;
- Telegram delivery failure after commit → keep a durable result receipt and outbox;
- retry → reuse the same idempotency key.
