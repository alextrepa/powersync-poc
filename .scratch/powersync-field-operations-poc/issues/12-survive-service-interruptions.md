# 12: Survive browser, API, and PowerSync interruptions

**What to build:** Field work remains available and eventually converges after realistic browser and service failures, with no lost operation, duplicate effect, or permanently blocked queue.

**Blocked by:** 11: Review operations and apply append-only corrections.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] A persistent browser profile retains a downloaded day and queued field operations across complete browser closure and restart.
- [x] API failure before commit leaves operations queued, and recovery applies them in order.
- [x] A lost success response after commit retries each field operation type without duplicating its effect.
- [x] PowerSync restart while clients have queued work does not lose data or prevent convergence.
- [x] Administrative correction retries remain idempotent independently of field operation handling.
- [x] Every queue empties within 30 seconds after the Compose services report healthy.
- [x] `just stop` followed by `just start` retains database state and restores the application without manual repair.
- [x] Automated failure scenarios use the real containerized services and persistent browser storage.
