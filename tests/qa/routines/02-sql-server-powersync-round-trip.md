# QA-002: SQL Server and PowerSync round trip

Routine state: executable

Covers: [Ticket 02](../../../.scratch/powersync-field-operations-poc/issues/02-prove-sql-server-download.md) and [Ticket 03](../../../.scratch/powersync-field-operations-poc/issues/03-prove-offline-upload.md)

## Outcome

One SQL Server change reaches persistent browser storage, and one offline browser mutation returns to SQL Server exactly once.

## Preconditions

- QA-001 passes for the build under test.
- The field browser uses a new persistent profile.
- `just qa-reset powersync-round-trip`, `just qa-inspect round-trip`, and `just qa-fault lost-upload-response` exist before this routine becomes executable.
- The Gate 0 probe screen is available in the field app.

## Procedure

1. Run `just qa-reset powersync-round-trip` and record the printed source identifier.
   Expected: The source database commits the named probe row and prints its identifier without exposing connection details.
2. Open the field probe screen and wait for synchronization.
   Expected: The row appears from local browser storage with the same identifier and value.
3. Disable the field client's network and create a second probe mutation.
   Expected: The UI shows the local value and one queued change while SQL Server remains unchanged.
4. Close and reopen the browser with the same profile while still offline.
   Expected: The local value and queued change remain.
5. Restore connectivity.
   Expected: The queue empties, SQL Server contains the mutation once, and the browser converges with the server.
6. Run `just qa-fault lost-upload-response`, create one more offline mutation, and reconnect.
   Expected: The API commits the mutation but drops the first success response. The client retries the stable operation identifier, SQL Server still contains one business effect, and the queue advances.
7. Run `just qa-fault clear` and `just qa-inspect round-trip`.
   Expected: Fault injection is disabled, and the sanitized view shows one record for each source and upload identifier.

## Pass criteria

- Source-to-browser replication completes through SQL Server CDC and PowerSync.
- Offline browser data survives browser closure.
- The upload commits once despite a retried success response.
- The queue empties and the browser converges within 30 seconds after service health and connectivity return.
- The observed identifiers match across browser and SQL Server evidence.

## Evidence

- Source and browser screenshots showing the same identifiers.
- Queue state before and after reconnect.
- Sanitized API evidence for the first commit and retry.
- Recorded source-to-client and reconnect-to-convergence times.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
