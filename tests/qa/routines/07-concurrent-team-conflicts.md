# QA-007: Concurrent team conflicts

Routine state: executable

Covers: [Ticket 10](../../../.scratch/powersync-field-operations-poc/issues/10-preserve-offline-conflicts.md)

## Outcome

Two offline teams can report conflicting physical work, and synchronization preserves both reports, drains both queues, and exposes one shared discrepancy.

## Preconditions

- `just qa-reset concurrent-overdraw` and `just qa-inspect conflict-result` exist before this routine becomes executable.
- The named fixture gives Team 1 and Team 2 separate unmet assignments for the same product and one alternative lot with 10 free units.
- Two isolated persistent field clients have synchronized those teams.
- An unrelated Team 3 package is available for the exception visibility check.

## Procedure

1. Run `just qa-reset concurrent-overdraw`, synchronize both team clients, and record the printed plan, assignment, and lot identifiers.
   Expected: Both teams show their unmet work and the same alternative lot with 10 free units.
2. Disable connectivity on both team clients.
   Expected: Both apps remain usable from their synchronized packages.
3. Record an alternative pickup of 6 units on each team.
   Expected: Each client stores its own pickup and queued operation.
4. Reconnect Team 1 and wait for its queue to empty, then reconnect Team 2.
   Expected: SQL Server preserves both pickups, calculated inventory becomes negative 2, and an overdraw exception is created.
5. Synchronize both clients and Team 3, then run `just qa-inspect conflict-result`.
   Expected: Teams 1 and 2 receive the shared exception. Team 3 does not.
6. Run `just qa-reset concurrent-overdraw`, resynchronize the clients, and repeat the two 6-unit pickups with Team 2 reconnecting first.
   Expected: Both queues empty and both clients receive the shared exception.
7. Run `just qa-inspect conflict-result` and compare it with the retained first-run output.
   Expected: The authoritative pickup quantities, negative 2 inventory result, exception type, participant teams, and queue states match the first run.
8. Run `just qa-reset concurrent-exact-fit`, resynchronize the clients, and repeat with each team picking 5 units.
   Expected: Both pickups survive, inventory converges to zero, and no overdraw exception exists.
9. Run `just qa-inspect conflict-result`.
   Expected: The authoritative view reports two 5-unit pickups, zero calculated inventory, empty queues, and no overdraw exception.

## Pass criteria

- No physical pickup is discarded or overwritten.
- Both queues empty in each reconnect order.
- Overdraw creates one visible exception linked to both affected teams.
- Reconnect order does not change the final business facts.
- The exact-fit case creates no false exception.

## Evidence

- Timestamped screens from both team clients before and after reconnect.
- Authoritative pickups, calculated inventory, exception, and participant records.
- Queue timing for each reconnect order.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
