# QA-006: Alternative lot claims

Routine state: executable

Covers: [Ticket 09](../../../.scratch/powersync-field-operations-poc/issues/09-use-alternative-lots.md)

## Outcome

A team can use last-known availability to claim, cancel, or complete work from an alternative lot without confusing intent with the physical pickup.

## Preconditions

- Team 1 has two separate unmet assignments of 3 units for one product.
- Three unflagged alternative lots have last-known free quantities of 8, 3, and 2.
- A second connected team can observe relevant active claims.

## Procedure

1. Open Team 1's alternative-lot list.
   Expected: Lots appear in descending last-known free quantity, with flagged or wrong-product lots absent.
2. Select the 8-unit lot for 3 units.
   Expected: An active 3-unit claim appears locally. After synchronization, the connected second team sees that lot's estimated free quantity change from 8 to 5.
3. Cancel the claim.
   Expected: It enters the cancelled state, and the connected second team's estimated free quantity returns from 5 to 8 after synchronization.
4. For the first unmet assignment, select the 3-unit lot and record the alternative pickup.
   Expected: While active, the 3-unit claim reduces estimated free quantity from 3 to zero. After pickup, the claim becomes picked and stops counting, a separate 3-unit pickup references it, recorded availability remains zero, and the first need is fulfilled.
5. For the second unmet assignment, select the 2-unit lot for its need of 3.
   Expected: The app warns that last-known quantity appears insufficient but permits the selection after confirmation. The resulting active 3-unit claim changes the connected team's estimated free quantity from 2 to negative 1 after synchronization.
6. Leave that claim active and complete the truck.
   Expected: The server creates an abandoned-claim exception.

## Pass criteria

- Ranking and filtering use the last synchronized availability inputs.
- An apparently insufficient lot requires warning but remains selectable.
- Active, cancelled, and picked states produce the exact availability changes stated in the procedure.
- The alternative pickup and its preceding claim remain separate facts.
- An active claim left at truck completion creates an exception.

## Evidence

- Screenshots of ranking, warning, claim states, and the abandoned-claim exception.
- Authoritative claim and pickup identifiers showing their relationship and distinct records.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
