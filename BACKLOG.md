# Implementation backlog

This backlog is a living plan. Reorder or remove work when evidence changes the POC, but keep completed acceptance evidence attached to the relevant item.

## Status legend

- `[ ]` Not started
- `[>]` In progress
- `[x]` Complete
- `[!]` Blocked or rejected by evidence

## 0. Specification

- [x] **SPEC-001** Record the agreed product workflow and scope.
- [x] **SPEC-002** Record the proposed architecture and source-database constraints.
- [x] **SPEC-003** Record automated, Android, and Azure SQL acceptance scenarios.
- [x] **SPEC-004** Create the initial living backlog.

## 1. Gate 0: prove SQL Server round trips

No user-interface work starts until this gate passes.

- [x] **G0-001** Initialize the repository and workspace tooling.
  - Add package management, TypeScript configuration, formatting, linting, and `just check`.
  - Keep the repository runnable on Windows and CI Linux.
- [x] **G0-002** Create Docker Compose services for SQL Server 2022 Developer, PostgreSQL bucket storage, and PowerSync Service.
  - Use named volumes and health checks.
  - Keep credentials in ignored environment files or CI secrets.
- [x] **G0-003** Create a minimal SQL Server schema and migration path.
- [x] **G0-004** Enable CDC on the database, PowerSync checkpoint table, and smoke table.
- [x] **G0-005** Configure PowerSync replication and one minimal Sync Stream.
- [x] **G0-006** Build a minimal browser client that receives one SQL Server row.
- [x] **G0-007** Build a minimal upload endpoint and prove one offline mutation reaches SQL Server once.
- [x] **G0-008** Automate both Gate 0 scenarios in headless Chromium.
- [x] **G0-009** Record versions, latency, failures, and a proceed or stop decision.

Gate 0 exits only when both directions work, the upload queue empties, and the client converges to SQL Server state.

## 2. Domain and database foundation

- [x] **DOM-001** Implement products, lots, quantity adjustments, and flag history.
- [x] **DOM-002** Implement daily plans and numbered trucks.
- [x] **DOM-003** Implement transactional allocations that reserve inventory immediately.
- [x] **DOM-004** Implement deterministic team splitting and idempotent publication.
- [x] **DOM-005** Implement immutable team assignments.
- [x] **DOM-006** Implement field operation IDs and processed-operation idempotency.
- [x] **DOM-007** Implement claims, pickups, shortage reports, exceptions, and corrections.
- [x] **DOM-008** Cover split, reservation, state transition, and exception rules with focused tests.
- [x] **DOM-009** Implement and test recorded quantity, reserved remaining, and planned-pickup accounting projections.
- [x] **DOM-010** Implement the five append-only correction effects defined by the technical design.
- [x] **DOM-011** Recompute assignment and allocation projections after quantity and lot corrections.
- [x] **DOM-012** Implement exception participant links for every affected plan and team.

## 3. Admin application

- [x] **ADM-001** Scaffold the React, TypeScript, Vite, and TanStack Router admin app.
- [x] **ADM-002** Build product and lot quantity screens.
- [x] **ADM-003** Build active and cleared flag screens.
- [x] **ADM-004** Build daily plan, team count, and numbered truck screens.
- [x] **ADM-005** Build allocation entry with immediate transactional validation.
- [x] **ADM-006** Build generated team-split preview and publication.
- [x] **ADM-007** Build claims and pickups inspection.
- [x] **ADM-008** Build exceptions and append-only corrections.
- [x] **ADM-009** Add one full admin UI scenario that creates and publishes a day.
- [x] **ADM-010** Make correction commands idempotent with stable command IDs.

## 4. Team-scoped synchronization

- [x] **SYNC-001** Define the PowerSync client schema for the field app.
- [x] **SYNC-002** Define a parameterized team-and-date Sync Stream.
- [x] **SYNC-003** Sync every truck and assignment for the selected team.
- [x] **SYNC-004** Sync alternative lots for required products.
- [x] **SYNC-005** Sync flags and competing allocations, claims, and pickups needed for availability.
- [x] **SYNC-006** Exclude unrelated team plans and unrelated data.
- [x] **SYNC-007** Implement subscription lifecycle and `Ready offline` status.
- [x] **SYNC-008** Automate team package inclusion and exclusion scenarios.
- [x] **SYNC-009** Scope every local query by active plan ID and team number and test retained-package isolation.
- [x] **SYNC-010** Sync shared exceptions through explicit participant rows and test affected-team delivery.

## 5. Field PWA

- [x] **FLD-001** Scaffold the React, TypeScript, Vite, and TanStack Router field app.
- [x] **FLD-002** Configure PowerSync Web persistent storage and one active tab.
- [x] **FLD-003** Add the PWA manifest and offline application-shell service worker.
- [x] **FLD-004** Implement team-number entry and current-day selection.
- [x] **FLD-005** Implement truck list, progress, and assignment detail.
- [x] **FLD-006** Implement planned pickup entry, including over-pick confirmation.
- [x] **FLD-007** Implement short-pick reason and flag-choice behavior.
- [x] **FLD-008** Implement alternative lot ranking and warnings.
- [x] **FLD-009** Implement active, picked, and cancelled alternative claims.
- [x] **FLD-010** Implement local lot flags.
- [x] **FLD-011** Implement sync, queue, last-sync, readiness, and exception feedback.

## 6. Upload and conflict handling

- [x] **UPL-001** Implement the PowerSync upload endpoint over shared domain services.
- [x] **UPL-002** Apply each CRUD transaction atomically where possible.
- [x] **UPL-003** Distinguish expected business exceptions from retriable infrastructure failures.
- [x] **UPL-004** Acknowledge recorded business conflicts so the FIFO queue can advance.
- [x] **UPL-005** Preserve both physical pickups during an overdraw.
- [x] **UPL-006** Create over-pick, overdraw, abandoned-claim, and flagged-source exceptions.
- [x] **UPL-007** Synchronize corrections and resolved state to affected clients.
- [x] **UPL-008** Prove idempotency when the API response is lost after commit.

## 7. Real-stack automation

- [x] **E2E-001** Build deterministic SQL Server fixtures and a test-only reset path.
- [x] **E2E-002** Start the complete stack through `just e2e`.
- [x] **E2E-003** Simulate two teams and an administrator with isolated Playwright contexts.
- [x] **E2E-004** Add persistent-profile tests for browser restart and local database survival.
- [x] **E2E-005** Add both reconnect orders for the overdraw scenario.
- [x] **E2E-006** Add flag propagation and pre-flag pickup scenarios.
- [x] **E2E-007** Add API failure, retry, and PowerSync restart scenarios.
- [x] **E2E-008** Measure reconnect-to-convergence time across at least 20 runs.
- [x] **E2E-009** Capture sanitized traces, screenshots, and logs on failure.
- [x] **E2E-010** Run the Chromium suite in CI on every pull request for the POC.
- [x] **E2E-011** Enforce the 30-second local queue and convergence thresholds.
- [x] **E2E-012** Add requirement-to-test coverage checks and rendered assertions for field sync status.

## 8. Device and Azure gates

- [ ] **DEV-001** Install the PWA on a physical Android phone.
- [ ] **DEV-002** Prove offline cold start after Chrome closure.
- [ ] **DEV-003** Prove offline state and queued operations survive a phone restart.
- [ ] **DEV-004** Prove reconnect uploads every operation once and converges.
- [ ] **AZ-001** Provision a temporary Azure SQL Database tier that supports CDC.
- [ ] **AZ-002** Apply schema, permissions, and CDC without exposing secrets.
- [ ] **AZ-003** Run the overdraw scenario in both reconnect orders.
- [ ] **AZ-004** Run the idempotent retry scenario.
- [ ] **AZ-005** Record Azure SQL latency and differences from local SQL Server.
- [ ] **AZ-006** Remove the temporary Azure environment after evidence capture.
- [ ] **AZ-007** Enforce the 120-second Azure SQL convergence threshold.

## 9. Decision report

- [x] **DEC-001** Summarize available local evidence and explicitly identify missing CI, Android, Tailscale, and Azure runs.
- [x] **DEC-002** List every data loss, duplicate, stuck queue, stale state, and manual recovery.
- [x] **DEC-003** Compare measured behavior with the product acceptance criteria.
- [x] **DEC-004** Recommend proceeding, proceeding with conditions, or rejecting PowerSync.

## Deferred beyond the POC

- Authentication and authorization
- Permanent workers and teams
- Route mapping and optimization
- Truck capacity planning
- Replenishment
- Reporting
- Production infrastructure, security, backup, retention, and operations
- Required iOS support
