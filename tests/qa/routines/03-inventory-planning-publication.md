# QA-003: Inventory planning and publication

Routine state: executable

Covers: [Ticket 04](../../../.scratch/powersync-field-operations-poc/issues/04-manage-inventory.md) and [Ticket 05](../../../.scratch/powersync-field-operations-poc/issues/05-plan-and-publish-team-work.md)

## Outcome

An administrator can create inventory, reserve it across several trucks, preview the exact team split, and publish one immutable daily plan.

## Preconditions

- The local stack is healthy.
- The database contains no plan for the chosen future date.
- Use one product with two unflagged lots containing 20 and 10 units.

## Procedure

1. Create the product and both lots in the admin application, rename the product, and recount the first lot.
   Expected: Both lots show the renamed product, and the first lot shows the revised recorded quantity with an inventory-adjustment entry.
2. Create a future daily plan with two teams and two numbered trucks.
   Expected: The plan remains editable and displays Team 1 and Team 2.
3. Allocate 5 units from the first lot to Truck 1 and 4 units from the same lot to Truck 2.
   Expected: The lot immediately shows 9 reserved units and 11 free units.
4. Edit the first allocation: reduce it to 3 units and move it to Truck 2. Then cancel the second allocation.
   Expected: Truck 1 no longer contains the allocation, Truck 2 shows 3 units, the cancelled allocation disappears, and only 3 units remain reserved.
5. Restore the original two allocations, then try to allocate 12 more units from that lot.
   Expected: The application rejects the request without changing reservations.
6. Preview the team split.
   Expected: The 5-unit allocation splits 3 to Team 1 and 2 to Team 2. The 4-unit allocation splits 2 and 2.
7. Flag the second lot and try to add a new allocation from it.
   Expected: The application rejects the draft allocation from the flagged lot.
8. Clear the flag, add a valid allocation from the second lot, flag it again, and attempt publication.
   Expected: The draft allocation remains recorded, but publication is rejected while its lot is flagged.
9. Clear the flag without editing quantity, inspect the flag history, then publish the plan.
   Expected: The quantity remains 10, the history contains both flag and clear cycles, publication succeeds, inventory is not reserved again, and the plan structure freezes.
10. Retry publication and attempt to edit the published team count or allocations.
   Expected: The retry creates no duplicate assignments, and structural edits are rejected.

## Pass criteria

- Product, lot, quantity, flag, and clear-flag behavior remains consistent.
- Reservations change when draft allocations change and never exceed free inventory.
- Split preview follows the floor-and-lowest-team remainder rule.
- Publication is idempotent and immutable.
- Flag clearing retains history and does not alter quantity.

## Evidence

- Screenshots of inventory, reservation totals, flag history, split preview, and published plan.
- Rejected over-allocation and flagged-lot messages.
- Authoritative assignment and reservation summary after the publication retry.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
