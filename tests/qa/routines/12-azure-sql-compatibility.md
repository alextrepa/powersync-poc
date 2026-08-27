# QA-012: Azure SQL compatibility

Routine state: executable

Covers: [Ticket 16](../../../.scratch/powersync-field-operations-poc/issues/16-pass-azure-sql-gate.md)

## Outcome

The containerized application stack uses temporary Azure SQL Database as its source and passes the required conflict and retry checks within the Azure convergence threshold.

## Preconditions

- QA-002 and QA-007 have passing local SQL Server execution logs for the same build, and their evidence directories are recorded as the comparison baseline.
- A temporary Azure SQL Database supports the required CDC configuration.
- Azure credentials and connection details exist only in approved secret storage.
- The tester has an agreed resource-removal procedure.
- `just azure-start`, `just azure-stop`, `just azure-clean`, `just qa-reset azure-round-trip`, `just qa-reset azure-overdraw`, `just qa-inspect azure-result`, and `just qa-fault lost-upload-response` exist before this routine becomes executable.

## Procedure

1. Run `just azure-start` to start the containerized applications, PowerSync, PostgreSQL bucket storage, and test tools against Azure SQL instead of the local SQL Server container.
   Expected: Every required service becomes healthy without exposing connection details.
2. Run `just qa-reset azure-round-trip`, record its printed identifier, open the Gate 0 probe screen, and wait for that identifier.
   Expected: The browser displays the Azure-backed row from local PowerSync storage. `just qa-inspect azure-result` shows the same source identifier, and the tester records source-to-client time.
3. Run `just qa-reset azure-overdraw`, synchronize its two printed team assignments, take both clients offline, and record a 6-unit alternative pickup from the same 10-unit lot on each. Reconnect Team 1 first, then Team 2.
   Expected: Both 6-unit pickups survive, calculated inventory becomes negative 2, an overdraw exception reaches both teams, and both queues empty.
4. Run `just qa-inspect azure-result` and retain the output as the Team-1-first result.
   Expected: The authoritative view contains both pickups, negative 2 inventory, the shared exception, both participants, and empty queues.
5. Run `just qa-reset azure-overdraw` again, resynchronize both clients, repeat the two offline 6-unit pickups, and reconnect Team 2 first, then Team 1.
   Expected: The final business facts match the first run.
6. Run `just qa-inspect azure-result` and retain the output as the Team-2-first result.
   Expected: Pickup quantities, negative 2 inventory, exception type, participant teams, and empty queues match the retained Team-1-first result.
7. Run `just qa-reset azure-round-trip`, wait for its printed probe identifier in the field browser, disable that client's network, create one uniquely identified probe mutation, and run `just qa-fault lost-upload-response` before reconnecting.
   Expected: The first success response is dropped, the client retries the same operation identifier, Azure SQL contains one business effect, and the queue advances.
8. Run `just qa-fault clear` and `just qa-inspect azure-result`, then compare the retained Azure results with the recorded QA-002 and QA-007 local evidence.
   Expected: Identifiers may differ, but operation counts, pickup quantities, exception participants, queue completion, and final calculated inventory match. Every Azure reconnect completes within 120 seconds. Any semantic difference fails the routine; timing and operational differences are recorded.
9. Capture sanitized evidence, run `just azure-stop`, then run `just azure-clean`.
   Expected: Evidence remains available and the temporary database no longer exists.

## Pass criteria

- Azure SQL replication and uploads work with the containerized application services.
- Both reconnect orders preserve all physical facts and converge to the same result.
- Retried operations have one business effect.
- Every reconnect converges within 120 seconds.
- Evidence contains no secret, and temporary resources are removed.

## Evidence

- Azure service tier, region, database configuration, and version details without credentials.
- Source-to-client and reconnect-to-convergence timings.
- Authoritative pickup, exception, participant, and operation records.
- Resource-removal confirmation.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
