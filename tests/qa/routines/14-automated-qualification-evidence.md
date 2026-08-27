# QA-014: Automated qualification evidence

Routine state: executable

Covers: Ticket 14

## Outcome

The complete containerized Chromium qualification is repeatable, deterministic, and leaves auditable timing and interruption evidence.

## Preconditions

- Docker Compose, Node.js, and Just are available.
- The local `.env` contains only POC credentials.
- Tailscale, Android, and Azure gates are out of scope for this routine.

## Procedure

1. Run `just check` and `just e2e`.
   Expected: Static checks, unit tests, and every real-stack Chromium scenario pass with one deterministic Playwright worker.
2. Run `just e2e-recovery`.
   Expected: API and PowerSync restart and the browser-visible stack becomes healthy again.
3. Run `just e2e-interruption`.
   Expected: Queued work survives both services being unavailable and converges once with no queue repair.
4. Run `just e2e-convergence 20`.
   Expected: All 20 iterations pass and `tests/qa/evidence/convergence-summary.json` reports zero unexpected results.
5. Inspect both summary files and compare the maximum iteration with the 30-second local threshold.
   Expected: The interruption exit code is 0 and every measured iteration stays below 30 seconds.

## Pass criteria

- No static, unit, browser, restart, or interruption failure.
- Twenty expected convergence results and zero unexpected results.
- Maximum convergence duration below 30 seconds.
- Evidence contains no configured credential value.

## Evidence

- `tests/qa/evidence/convergence-summary.json`
- `tests/qa/evidence/interruption-summary.json`
- Failure-only Playwright traces, screenshots, and sanitized service logs when applicable.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
| 2026-08-27 | uncommitted signed checkpoint pending | Docker Desktop, SQL Server 2022, PowerSync 1.25.0, Chromium 151 | Codex | pass | `../evidence/convergence-summary.json`, `../evidence/interruption-summary.json` | 20/20; max 16.361s; interruption exit 0. |
