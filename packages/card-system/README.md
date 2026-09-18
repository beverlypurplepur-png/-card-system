# Card System identity demo

Card records contain only an independently generated UUID, the workspace/document/frame
reference and Card timestamps. Frame content, geometry and Yjs remain owned by AFFiNE.

## Phase 1: local verification

From the repository root:

```sh
yarn workspace @affine/card-system test
yarn workspace @affine/card-system typecheck
```

Tests apply `migrations/0001_create_cards.sql` to **in-memory PGlite PostgreSQL**.
They do not read database connection environment variables. HTTP tests bind only to
`127.0.0.1` on an ephemeral port and use isolated authentication/permission fixtures.
Frame lifecycle tests use the real AFFiNE Frame schema, Store and Yjs UndoManager;
copy tests exercise the real Frame clipboard creation method without mounting a UI.

The existing frontend Doc entity attaches the adapter for server-backed, writable
Stores. It subscribes before waiting for sync readiness, then checks the server
status and backfills. Local-only workspaces are not sent to an unrelated server.
The API uses existing authentication and `Doc.Update` permission checks.

## Production boundary

`CARD_SYSTEM_ENABLED` defaults to disabled. With it unset, the status route returns
`enabled: false`, the adapter detaches, and mutation routes return 503 before any
registry query. There is **no automatic migration** at startup or package install.

The SQL migration must be reviewed and applied separately before opting in with
`CARD_SYSTEM_ENABLED=true`. Phase 1 does not apply it to Railway. The registry uses
the existing server PostgreSQL connection, but only queries `card_system.cards`;
no AFFiNE Prisma models or tables are changed. Reopen documents after enabling.

## Lifecycle and limits

- Registration is atomic on the full reference, including soft-deleted rows.
- Active registrations leave timestamps unchanged; restoration keeps UUID and creation time.
- Delete is idempotent and never hard deletes. An unknown reference returns null.
- Frame updates do not update Card records; timestamps describe Card lifecycle only.
- Backfill registers existing Frames and is safe to repeat. It does not infer deletion from absence.
- Requests are ordered per Store, including pending operations across detach/reattach.
- Disposal unsubscribes; accepted requests drain. Disposal is not deletion.
- Failures are reported, and `flush()` rejects in tests/callers. `backfill()` can retry
  registrations. There is no durable offline queue or automatic retry of missed deletions.
- Only attached documents are observed. This demo does not reconcile changes made
  while no adapter was attached or impose global ordering across offline clients.
- Restoring a Card never reconstructs a deleted Frame; AFFiNE must restore that source ID.
