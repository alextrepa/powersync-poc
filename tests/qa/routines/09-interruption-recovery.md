# QA-009: Interruption and recovery

Routine state: executable

Covers: [Ticket 12](../../../.scratch/powersync-field-operations-poc/issues/12-survive-service-interruptions.md)

## Outcome

Queued field work survives browser, API, PowerSync, and full Compose interruptions and converges without loss, duplication, or manual queue repair.

## Preconditions

- A team day is ready offline in a persistent browser profile.
- `just qa-service <service> <action>` and `just qa-inspect operations` exist before this routine becomes executable.
- Use unique operation identifiers for every test case.

## Procedure

1. Run `just e2e-interruption` as the automated real-stack baseline.
   Expected: The browser queues work, API and PowerSync both stop, the queue stays pending, both services recover, and exactly one effect reaches SQL Server. `tests/qa/evidence/interruption-summary.json` records exit code 0.
2. Work offline, record two field operations, close the browser completely, and reopen it with the same profile.
   Expected: The day and both queued operations remain.
3. Run `just qa-service api stop`, then restore the network.
   Expected: The operations remain queued and the UI reports that synchronization has not completed.
4. Run `just qa-service api start` and wait for API health.
   Expected: Both operations commit in order, once each, and the queue empties.
5. Disable client connectivity, queue another operation, run `just qa-service powersync restart`, wait for service health, and then restore client connectivity.
   Expected: The operation reaches SQL Server once and the browser converges.
6. Disable client connectivity again, queue another operation, run `just stop`, then run `just start` and restore client connectivity only after health checks pass.
   Expected: Database state survives, the browser retains its operation, and synchronization resumes after services become healthy.
7. Run `just qa-inspect operations` and inspect every operation and exception created during the routine.
   Expected: No duplicate effect, lost operation, or unacknowledged business exception remains.

## Pass criteria

- Persistent browser data survives complete browser closure.
- Failures before commit retain the queue.
- Recovery applies operations in order and exactly once.
- PowerSync and full-stack restarts require no manual queue editing.
- Every queue empties within 30 seconds after services and connectivity recover.

## Evidence

- Queue counts and timestamps at each interruption boundary.
- Sanitized service lifecycle and API logs.
- Authoritative operation identifiers and business-effect counts.
- Final browser and SQL Server state comparison.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
| 2026-08-27 | uncommitted signed checkpoint pending | Docker Desktop, Chromium 151 | Codex | pass | `../evidence/interruption-summary.json` | Automated simultaneous API and PowerSync interruption; manual full-Compose/device steps remain separate. |
