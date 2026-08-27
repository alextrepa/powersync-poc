# QA-004: Team-day offline readiness

Routine state: executable

Covers: [Ticket 06](../../../.scratch/powersync-field-operations-poc/issues/06-download-complete-team-day.md)

## Outcome

A worker downloads one complete team day, reopens it offline, and cannot confuse retained data from another team or date with the active package.

## Preconditions

- A published plan exists for today with two teams, several trucks, and more than one candidate lot for an assigned product.
- Another published plan exists on a different date.
- Use a new persistent browser profile.

## Procedure

1. Open the field PWA and enter Team 1.
   Expected: The app selects today's plan and does not claim offline readiness immediately.
2. Wait for `Ready offline` and review the package.
   Expected: Every truck and Team 1 assignment is present, along with the required product lots and relevant availability data.
3. Verify unrelated products and Team 2's complete plan are absent.
   Expected: The UI contains no unrelated rows or pickup history.
4. Disable all network access, close the browser, and reopen the installed app with the same profile.
   Expected: Team 1's complete day remains usable and still identifies the active team and date.
5. Restore connectivity, select Team 2, and wait for its first synchronization.
   Expected: The old Team 1 package remains stored but never appears in Team 2's active view.
6. Disable connectivity again and switch back to Team 1 for today.
   Expected: Team 1's retained package opens without a new synchronization and still contains the original trucks and assignments.
7. Select the other date while offline before that package has synchronized.
   Expected: The app says connectivity is required and keeps the existing packages intact.

## Pass criteria

- `Ready offline` appears only after the complete package synchronizes.
- Every required truck, assignment, candidate lot, flag, and availability input is present.
- Unrelated products and team plans remain absent.
- A downloaded package survives browser closure without connectivity.
- Team and date switching never leaks retained rows into the active view.

## Evidence

- Screenshots of readiness, all truck assignments, Team 2 isolation, Team 1 retained-package reopen, and the unsynchronized-package warning.
- A short record of included and intentionally excluded data.
- Browser, PowerSync, and storage versions.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
