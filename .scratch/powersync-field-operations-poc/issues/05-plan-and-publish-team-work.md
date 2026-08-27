# 05: Plan trucks and publish deterministic team assignments

**What to build:** An administrator can plan several truck loads for a date, reserve plants from lots, preview the generated team split, and publish an immutable day of work.

**Blocked by:** 04: Manage products, lots, quantities, and flags.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The admin can create one draft daily plan with a positive team count and several numbered trucks.
- [x] Adding or increasing an allocation reserves lot inventory immediately, including for future dates.
- [x] Concurrent administrative requests cannot reserve more than the free lot quantity.
- [x] Draft allocations can be moved, reduced, or cancelled with correct reservation changes.
- [x] The split gives each team the floor share, distributes the remainder to the lowest team numbers, and omits zero-quantity rows.
- [x] The admin can preview the exact split before publication.
- [x] Publication is idempotent, freezes the plan, does not reserve inventory twice, and rejects flagged lots or inconsistent plans.
- [x] Focused domain tests cover split and reservation boundaries, and a browser scenario publishes a multi-truck day.
