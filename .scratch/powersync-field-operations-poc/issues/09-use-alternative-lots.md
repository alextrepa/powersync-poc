# 09: Claim and pick from alternative lots

**What to build:** A team with an unmet quantity can choose another lot using last-known availability, announce its intent, and either complete or cancel that alternative work.

**Blocked by:** 08: Report shortages and flag faulty lots.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] Candidate lots are unflagged, contain the required product, and are ranked by last-known free quantity.
- [x] Availability includes recorded quantity, remaining allocations across plan dates, and active claims across teams.
- [x] A lot that appears insufficient remains selectable after a clear warning and confirmation.
- [x] Selecting a lot creates a separate active claim with a stable operation identifier.
- [x] A claim can become picked or cancelled and stops reducing availability after leaving the active state.
- [x] An alternative pickup remains a separate immutable fact linked to its preceding claim.
- [x] Completing a truck with an active claim creates an abandoned-claim exception.
- [x] Multi-context browser scenarios cover claim visibility, cancellation, completion, insufficient quantity, and abandonment.
