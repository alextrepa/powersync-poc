# 07: Record planned pickups offline

**What to build:** A field team can record what it physically picked from an assigned lot while offline and see the operation synchronize without losing truck progress or status feedback.

**Blocked by:** 06: Download a complete team day for offline use.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The worker can record an actual quantity against a planned assignment while offline.
- [x] A quantity above the assignment requires confirmation and creates an over-pick exception after server processing.
- [x] The pickup remains an immutable physical fact with a stable operation identifier.
- [x] Planned-picked quantity, allocation reservation, and lot quantity projections update transactionally.
- [x] Each truck shows not started, in progress, or complete from synchronized and queued work.
- [x] The PWA shows online state, queued changes, last successful synchronization, and exceptions caused by an uploaded action.
- [x] A real-stack browser scenario proves planned pickup, over-pick confirmation, upload, and convergence.
