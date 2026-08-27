# QA-008: Administrative corrections

Routine state: executable

Covers: [Ticket 11](../../../.scratch/powersync-field-operations-poc/issues/11-apply-admin-corrections.md)

## Outcome

An administrator can correct a field discrepancy exactly once while retaining the original reports and synchronizing the resolved state to every affected team.

## Preconditions

- QA-007 has produced an unresolved overdraw exception involving two teams.
- The admin operations view shows the related claims and pickups.
- Both affected field clients are available for synchronization.
- An unrelated Team 3 client is synchronized and available for the visibility check.
- `just qa-reset correction-projections`, `just qa-inspect correction-result`, `just qa-fault lost-correction-response`, and `just qa-command correction-payload-mismatch` exist before this routine becomes executable.

## Procedure

1. Open the exception and inspect its participants and original pickups.
   Expected: The admin can identify both teams, quantities, lots, and immutable source records.
2. Run `just qa-fault lost-correction-response`. In the overdraw case where the lot began at 10 and both teams reported 6, correct Team 2's effective pickup from 6 to 4.
   Expected: The API commits the correction, drops the first response, and the admin retries the same command identifier. Calculated lot inventory changes from negative 2 to zero, the original 6-unit pickup remains, and one 4-unit effective correction exists.
3. Run `just qa-fault clear`, then run `just qa-inspect correction-result`.
   Expected: `just qa-inspect correction-result` prints the committed command identifier. One correction exists, the retry returned its stored result, and no second inventory effect occurred.
4. Run `just qa-command correction-payload-mismatch` with that printed command identifier.
   Expected: The API rejects it and leaves all projections unchanged.
5. Resolve the exception and synchronize both affected field clients plus Team 3.
   Expected: The original pickups remain unchanged, one correction exists, both affected teams receive the resolved state, and Team 3 does not receive the exception or correction.
6. Run `just qa-reset correction-projections`. On its planned 5-unit assignment with an effective pickup of 5, correct the effective quantity to 3.
   Expected: The planned lot quantity increases by 2, planned-picked quantity becomes 3, reserved remainder increases by 2, and the original pickup remains 5.
7. Run `just qa-inspect correction-result` and retain the output.
   Expected: The sanitized authoritative view reports the quantity-correction values from step 6 and one correction effect.
8. Reset the same fixture, then reassign its 5-unit pickup from planned Lot A to alternative Lot B.
   Expected: Lot A quantity increases by 5, Lot B quantity decreases by 5, planned-picked quantity becomes zero, reserved remainder increases by 5, and the original pickup still names Lot A.
9. Run `just qa-inspect correction-result` and retain the output.
   Expected: The sanitized authoritative view reports the lot-reassignment values from step 8 and one correction effect.
10. Reset a 3-of-5 short-pick fixture, then release its reserved remainder of 2.
   Expected: Reserved remainder decreases by 2, recorded lot quantity does not change, and the original 3-unit pickup remains.
11. Run `just qa-inspect correction-result` and retain the output.
   Expected: The sanitized authoritative view reports the reservation-release values from step 10 and one correction effect.

## Pass criteria

- Original claims, pickups, shortage reports, and flags remain unchanged.
- Each correction effect updates every affected projection consistently.
- Command retry is idempotent and payload mismatch is rejected.
- Resolution reaches every participant and no unrelated team.

## Evidence

- Before-and-after admin screenshots for each correction type.
- Authoritative source facts, correction records, and projection summaries.
- Field screenshots showing synchronized resolution.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
