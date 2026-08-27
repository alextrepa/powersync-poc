# QA-013: Integrity and retry guardrails

Routine state: executable

Covers: Tickets 05, 09, 10, 11, and 12

## Outcome

Published work cannot be rewritten, field facts remain bound to their assignment and claim, and uncertain retries produce one business effect.

## Preconditions

- Start the full local stack with `just start`.
- Use unique product and lot codes.
- Open both the field PWA and admin console.

## Procedure

1. Publish a plan, then attempt to change or delete one of its allocations through the public API.
   Expected: Both requests return HTTP 409 and the published assignment is unchanged.
2. On a downloaded route, disconnect the phone, claim an alternative lot, and immediately record that claim as picked without reconnecting.
   Expected: The claim appears locally, both commands remain queued, and reconnection applies them in order.
3. Flag one assigned lot while offline, then open the alternative selector for another assignment for the same product.
   Expected: The just-flagged lot is already marked unavailable on that phone.
4. Reserve an alternative lot on a separate future plan and reload the selected route.
   Expected: Estimated free quantity subtracts the other plan's active reservation.
5. Arm `just qa-fault lost-correction-response` and record a quantity return in the admin console.
   Expected: The console reconciles the uncertain response and the correction ledger contains one command and one inventory effect.
6. Submit a planned pickup with another lot ID, an alternative pickup without its matching active claim, and a second pickup against an already used claim.
   Expected: Every invalid relationship is rejected without changing inventory.

## Pass criteria

- Frozen assignments and reservations remain internally consistent.
- Offline claim, flag, and completion state is immediately visible locally.
- Candidate availability includes every synchronized active reservation.
- Invalid pickup relationships cannot mutate unrelated inventory.
- Retried corrections and field commands create one effect.

## Evidence

- HTTP status and authoritative plan snapshots.
- Queue counts before and after reconnect.
- Screenshots of local claim and unavailable-lot states.
- Correction command ID and before/after lot quantities.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
