# 10: Preserve concurrent field work and expose conflicts

**What to build:** Two offline teams can act on the same alternative lot, and synchronization preserves both physical reports while making any inventory discrepancy visible to the office and affected teams.

**Blocked by:** 09: Claim and pick from alternative lots.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] Separate persistent browser contexts can take the same synchronized snapshot and work offline independently.
- [x] Concurrent pickups that exactly consume free inventory both survive and converge to zero without an overdraw exception.
- [x] Concurrent pickups above free inventory both survive, may produce negative calculated inventory, and create an overdraw exception.
- [x] A pickup recorded before receipt of another team's flag survives and creates a flagged-source exception.
- [x] Each shared exception has explicit participant links for every affected plan and team.
- [x] Expected business conflicts are acknowledged so neither PowerSync FIFO queue remains blocked.
- [x] Both reconnect orders produce the same authoritative business facts and deliver the shared exception to both teams.
- [x] An unrelated team does not receive the shared exception.
