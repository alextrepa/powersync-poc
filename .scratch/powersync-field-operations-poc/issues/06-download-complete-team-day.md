# 06: Download a complete team day for offline use

**What to build:** A worker can enter a team number, download the full day and its candidate inventory, then reopen that team package without connectivity.

**Blocked by:** 03: Prove an offline mutation reaches SQL Server once; 05: Plan trucks and publish deterministic team assignments.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The field PWA defaults to the current date, accepts a team number, and remembers the last entered number.
- [x] The package contains every truck and assignment for the selected plan and team.
- [x] The package contains every lot for required products plus the flags and remaining allocations needed to estimate availability.
- [x] The package excludes unrelated products, complete plans from other teams, and unrelated field history.
- [x] The app reports `Ready offline` only after the complete package finishes its first synchronization.
- [x] A downloaded package reopens offline after the browser closes.
- [x] Retaining and switching between two packages never mixes plan-specific or team-specific rows in the visible UI.
- [x] The field app, service worker, and PowerSync browser database work through the containerized frontend endpoint.
