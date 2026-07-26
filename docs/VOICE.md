# Optional voice messages

Voice is not included in the minimal reference because it adds another credential, cost and file-processing surface. Add it only if the use case needs it.

Safe order:

1. Verify owner and private chat before `getFile`.
2. Check Telegram metadata and enforce a size/duration cap.
3. Download with a timeout and streaming byte limit.
4. Accept only expected audio formats; do not trust the filename alone.
5. Use a per-request directory with restrictive permissions.
6. Send audio only to the configured STT provider with its own minimal credential.
7. Feed the resulting text through the same read-only planner.
8. Delete audio in `finally` on success, timeout and error.

Do not log raw audio, transcript or STT response. Document retention and cost. Keep the STT key in the parent process and out of the Codex environment.

Required tests:

- non-owner and owner-in-group cause no download;
- oversized/truncated/wrong-type files fail before STT;
- network timeout cleans temporary files;
- transcript length is bounded;
- a transcript containing prompt injection cannot add fields/actions outside `QueryPlan`.
