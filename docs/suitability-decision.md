# PowerSync POC suitability decision

Decision date: 2026-08-27

Recommendation: **Proceed with conditions**

## What the local evidence proves

The containerized stack runs SQL Server 2022 Developer with CDC, PowerSync Service with PostgreSQL bucket storage, a Fastify API, the field PWA, the admin console, and a same-origin gateway. The real Chromium suite has demonstrated:

- published team work arriving through PowerSync into persistent browser SQLite;
- an offline application reload showing the complete selected route;
- a complete Chromium process restart reopening the same persistent profile offline;
- an offline pickup remaining queued and reaching SQL Server after reconnection;
- the queue emptying within the enforced 20-second browser assertion;
- a deliberately lost post-commit API response retrying with one business effect;
- two team pickups against the same alternative lot both surviving;
- negative inventory represented as an overdraw exception instead of losing a physical fact;
- the same exception being visible to both affected teams;
- correction response loss producing one append-only correction and a resolved exception;
- changed payload reuse of an operation ID being rejected;
- a short pickup retaining the physical quantity while allowing the worker not to flag the lot;
- pending offline claims and flags changing the local UI immediately;
- reservations from another plan reducing alternative-lot availability;
- queued work surviving simultaneous API and PowerSync interruption;
- a pre-commit API failure leaving the command unapplied until retry.

The retained 20-iteration offline convergence gate passed in 308.7 seconds. Individual iterations took 13.862 to 16.361 seconds (median 14.394 seconds, p95 14.888 seconds), below the 30-second local threshold. The machine-readable summary is stored at `tests/qa/evidence/convergence-summary.json`.

The final full-stack Chromium run completed with 15 passing scenarios and one intentional skip. The skipped case is the destructive service-interruption scenario; its dedicated orchestrator passed separately by stopping both API and PowerSync, restoring them, and observing the queued operation converge. Its machine-readable timestamps are stored at `tests/qa/evidence/interruption-summary.json`.

The tests exercise HTTP routes, SQL Server transactions, PowerSync replication, the generated service worker, persistent browser storage, and rendered user controls. They are not unit-test substitutes hidden behind browser syntax.

## Qualification envelope

- Source state: local unborn Git branch; no commit exists because the configured 1Password signer failed, and signing was not bypassed.
- Host: Windows 11 Home 10.0.26200, Docker 27.4.0, Docker Compose 2.31.0.
- Runtime and test tooling: Node 22 containers, PowerSync Service 1.25.0 pinned by digest, PowerSync Web 2.2.0, Playwright/Chromium 1.62.1, React 19.2.8, Fastify 5.12.1, and `mssql` 12.7.0.
- Data services: SQL Server 2022 Developer, PostgreSQL 17.7, and nginx 1.29.
- Tested client: containerized desktop Chromium only. No physical Android device or Azure SQL environment was used in this run.

## Conditions before presenting this as a platform choice

1. Pass QA-011 on a real Android phone, including Chrome closure and phone restart while offline.
2. Pass QA-012 against the client's Azure SQL shape in both reconnect orders and retain latency evidence.
3. Exercise QA-010 from the real phone if remote testing through Tailscale will be part of the client demonstration.

## Known POC boundaries

- Team number entry is identity selection, not authentication or authorization.
- Routes are frozen after publication; corrections are separate append-only commands.
- Conflicting physical work is intentionally surfaced for office resolution rather than automatically choosing a winning team.
- Tailscale is configured tailnet-only but was not tested in this implementation run.
- Azure and physical Android results are not inferred from desktop Chromium.
- The POC has no production backup, monitoring, retention, rate limiting, or secret-management design.

## Failure and recovery ledger

| Observation | Outcome |
|---|---|
| PowerSync rejected a base endpoint ending in `/` | Fixed the client base and gateway routing; regression covered by the browser sync test. |
| Field service worker intercepted `/admin/` navigation | Added navigation deny rules for admin, API, and PowerSync paths; shell test passes. |
| SQL Server initially rejected negative inventory | Removed the constraint deliberately; negative state now creates a shared exception and remains correctable. |
| Claude frontend design pass could not authenticate | No files were transmitted; the UI was implemented and reviewed locally. |
| Signed Git checkpoint attempts did not complete | Signing was preserved rather than bypassed; retry after 1Password is available. |
| Parallel files consumed each other's one-shot faults | Set the shared real-stack suite to one worker; explicit two-phone scenarios still use isolated concurrent contexts. |
| Playwright removed a report redirected into its output directory | Redirect raw JSON through `/tmp` and retain a compact evidence summary outside Playwright's cleanup path. |

## Final interpretation

The local POC answers the architectural question positively: PowerSync can support this offline-first workflow without silently discarding concurrent physical work. It does not yet answer the device and client-database qualification questions. Proceed to those two gates; do not treat local Chromium success as production approval.
