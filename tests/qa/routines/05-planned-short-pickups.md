# QA-005: Planned and short pickup workflow

Routine state: executable

Covers: [Ticket 07](../../../.scratch/powersync-field-operations-poc/issues/07-record-planned-pickups.md) and [Ticket 08](../../../.scratch/powersync-field-operations-poc/issues/08-report-shortages-and-flags.md)

## Outcome

A team can record planned, short, and over-pick quantities offline while the app preserves the physical facts, reservation rules, flag choice, and synchronization status.

## Preconditions

- A team package is ready offline with four assignments of 5 units from separate lots.
- The field client starts online with zero queued changes.
- `just qa-reset shortage-reasons` and `just qa-inspect pickup-result` exist before this routine becomes executable.

## Procedure

1. Disable connectivity and record a planned pickup of 5 against the first assignment.
   Expected: The truck becomes in progress and the queued-change count increases.
2. Record 3 of 5 against the second assignment and choose `incorrect inventory count`.
   Expected: The form defaults to flagging the lot and shows that choice before save.
3. Save the short pickup with the flag enabled.
   Expected: The lot becomes unavailable locally, the unmet quantity remains visible, and the remaining 2 units stay reserved.
4. Record 3 of 5 against the third assignment and choose `no problem with the lot`.
   Expected: The form defaults to no flag and saves without disabling the lot.
5. Attempt to record 6 against a 5-unit assignment.
   Expected: The app requires explicit over-pick confirmation before saving.
6. Confirm and save the over-pick.
   Expected: The fourth assignment shows a local pickup of 6 and the queued-change count increases.
7. Restore connectivity and wait for the queue to empty.
   Expected: Every physical pickup reaches SQL Server once, the short-pick reason and flag agree with the local record, and the over-pick creates an exception.
8. Run `just qa-inspect pickup-result` and retain the output, then run `just qa-reset shortage-reasons`.
   Expected: The first workflow reports four immutable pickups, two shortage reports, the chosen flag, the retained 2-unit remainder, and one over-pick exception. The reset then prints identifiers for six fresh 5-unit assignments.
9. Wait until the field client contains all six printed assignment identifiers and reports `Ready offline`.
   Expected: The reset fixture is fully synchronized before manual entry begins.
10. Record 3 units against one fresh assignment for each reason: dead or damaged, incorrect inventory count, inaccessible lot, wrong product, no problem with the lot, and other.
   Expected: The first four reasons default to flag, no problem defaults to no flag, and other permits both flag choices before the tester saves the chosen value.
11. Synchronize the reason matrix and run `just qa-inspect pickup-result`.
   Expected: Six shortage reports exist with the selected reasons and final flag choices, every uncertain 2-unit remainder stays reserved, and each resulting flag matches the saved choice.

## Pass criteria

- Offline entry works for exact, short, and over-pick quantities.
- Every shortage reason applies the specified default and allows the final choice required by the spec.
- A short pickup does not release the uncertain reservation remainder.
- The originating client applies a new flag before synchronization.
- Status feedback remains accurate, and all queued operations synchronize once.

## Evidence

- Screenshots of reason defaults, final flag review, local unavailability, over-pick confirmation, and queue state.
- Authoritative pickup, shortage, flag, reservation, and exception summary after reconnect.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
