# 14: Qualify the complete local workflow in CI

**What to build:** Every pull request can run the finished POC workflow in containerized headless Chromium and produce enough evidence to detect loss, duplication, stuck queues, stale state, and slow convergence.

**Blocked by:** 12: Survive browser, API, and PowerSync interruptions.

**Status:** ready-for-agent

**Implementation:** complete and locally verified on 2026-08-27

- [x] The CI job starts the full stack through the same Compose and `just` lifecycle used locally.
- [x] The containerized Playwright runner uses isolated persistent contexts for the administrator and multiple teams.
- [x] The suite covers planning, team download, planned and alternative pickups, shortages, flags, both conflict reconnect orders, corrections, and service recovery.
- [x] Every local reconnect scenario converges within 30 seconds and leaves no queue non-empty after service health returns.
- [x] At least 20 complete reconnect runs pass with zero lost operations and zero duplicate business effects.
- [x] The run reports the full convergence timing distribution.
- [x] Failure-only traces, screenshots, health output, and service logs are sanitized and scanned for secrets.
- [x] Requirement coverage identifies any parent-spec behavior with no automated or manual evidence path.
