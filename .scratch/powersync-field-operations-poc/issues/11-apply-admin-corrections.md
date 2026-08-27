# 11: Review operations and apply append-only corrections

**What to build:** An administrator can inspect field activity and resolve discrepancies with explicit, idempotent corrections while every original field report remains intact.

**Blocked by:** 10: Preserve concurrent field work and expose conflicts.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The admin operations view shows claims, pickups, flags, unresolved exceptions, and prior corrections.
- [x] The admin can release a short-pick reservation remainder without changing recorded lot quantity.
- [x] The admin can correct an effective pickup quantity and transactionally recompute lot, allocation, and assignment projections.
- [x] The admin can reassign a pickup to another lot, reverse the old lot effect, apply the new lot effect, and restore any planned reservation.
- [x] The admin can record an inventory adjustment and resolve an exception without editing or deleting original field facts.
- [x] Correction commands use stable command identifiers and reject mismatched retries.
- [x] Corrected and resolved state synchronizes to every exception participant.
- [x] Domain and browser tests verify each correction effect and exactly-once retry behavior.
