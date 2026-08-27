# 08: Report shortages and flag faulty lots

**What to build:** A worker who cannot fulfill an assignment can record the short quantity, explain why, and warn other teams about a faulty lot without releasing uncertain inventory.

**Blocked by:** 07: Record planned pickups offline.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] A short pickup requires one of the agreed reasons or an `other` reason.
- [x] Dead or damaged, incorrect count, inaccessible lot, and wrong product default to flagging.
- [x] No problem with the lot defaults to no flag, and `other` lets the worker choose.
- [x] The worker reviews the final flag decision before saving.
- [x] The unpicked planned remainder stays reserved until an administrator releases it.
- [x] A newly created flag makes the whole lot unavailable on the originating device immediately.
- [x] The shortage report and optional flag upload idempotently, and other connected team packages receive the flag.
- [x] Automated scenarios cover every reason, flag default, optional choice, reservation result, and propagation.
