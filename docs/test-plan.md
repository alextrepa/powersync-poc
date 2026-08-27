# Verification plan

Status: approved test strategy
Date: 2026-08-27

## 1. Test objective

The test suite must distinguish a working offline synchronization system from a UI that merely appears to work. Core scenarios use real browser storage, the real TypeScript API, SQL Server CDC, PowerSync Service, and PowerSync bucket storage.

The suite gathers evidence for correctness, durability, isolation, idempotency, and convergence.

## 2. Test levels

### Domain tests

Fast tests cover deterministic team splitting, availability calculations, state transitions, short-pick flag defaults, and exception creation.

### API integration tests

Integration tests run against SQL Server. They cover transactional allocation, publication, idempotent field uploads, negative inventory exceptions, flag clearing, and correction behavior.

### Real-stack browser tests

Playwright runs headless Chromium against the Docker Compose stack. Separate browser contexts simulate two independent teams and an administrator.

Ordinary multi-client tests use isolated contexts. Browser-restart tests use separate persistent profile directories so OPFS and service-worker state survive process closure.

### Physical Android tests

A real Android phone proves installation, offline cold start, browser and device restart, queued operation durability, and reconnect behavior. An emulator does not satisfy this gate.

### Azure SQL validation

One final run repeats the primary conflict scenario with Azure SQL as the source database.

## 3. Test environment

The local and CI stack contains:

```text
SQL Server 2022 Developer
PostgreSQL bucket storage
PowerSync Service
TypeScript API
Field PWA static server
Admin app static server
Headless Chromium
```

Service health checks must pass before browser tests begin. Each scenario starts from known SQL Server fixtures. Tests may use a test-only reset command, but the core UI scenarios must perform their business actions through the user interface.

## 4. Gate 0: SQL Server feasibility

No feature UI work begins until this gate passes.

### Scenario: SQL Server changes reach a web client

```gherkin
Given SQL Server 2022 Developer has CDC enabled
And PowerSync Service is connected to SQL Server
And a replicated smoke table contains one row
When the row is changed through the API
Then a PowerSync Web client receives the new value
And the client observes a complete checkpoint
```

### Scenario: an offline web mutation reaches SQL Server

```gherkin
Given a PowerSync Web client has synchronized the smoke row
And the client is offline
When the client writes a mutation locally
And the client reconnects
Then the API applies the mutation to SQL Server once
And the client upload queue becomes empty
And the client receives the authoritative value from SQL Server
```

### Gate 0 evidence

- Docker image and PowerSync Service versions
- CDC enablement output
- PowerSync health and checkpoint evidence
- SQL Server row before and after the round trip
- Browser trace showing local write, reconnect, upload, and convergence

## 5. Planning scenarios

### Scenario: allocation reserves inventory before publication

```gherkin
Given Lot A contains 10 lilacs
And a draft truck allocation reserves 7 lilacs from Lot A
When an administrator tries to allocate 4 more lilacs from Lot A
Then the second allocation is rejected
And Lot A still has 3 unallocated lilacs
```

### Scenario: concurrent allocation cannot over-reserve a lot

```gherkin
Given Lot A has 5 unallocated lilacs
When two administrators concurrently request allocations of 5
Then exactly one allocation succeeds
And the total active allocation remains 5
```

### Scenario: publication splits a remainder deterministically

```gherkin
Given a draft day has 3 teams
And Truck 1 has 11 lilacs allocated from Lot A
When the administrator publishes the day
Then Team 1 receives 4 lilacs
And Team 2 receives 4 lilacs
And Team 3 receives 3 lilacs
And publishing again does not duplicate assignments
```

### Scenario: publication does not reserve twice

```gherkin
Given Lot A contains 10 lilacs
And all 10 are allocated to Truck 1
When the administrator publishes the day for 2 teams
Then Team 1 receives 5 lilacs
And Team 2 receives 5 lilacs
And the lot remains reserved by exactly 10 lilacs
```

### Scenario: allocation smaller than team count omits zero rows

```gherkin
Given a draft day has 3 teams
And Truck 1 has 2 lilacs allocated from Lot A
When the administrator publishes the day
Then Team 1 receives 1 lilac
And Team 2 receives 1 lilac
And Team 3 receives no assignment row for that allocation
And all three teams still see Truck 1
```

## 6. Team subscription scenarios

### Scenario: a team receives its complete day

```gherkin
Given today's published plan has Team 1 and Team 2
And the plan contains Truck 1 and Truck 2
When a fresh field client selects Team 1
And the team subscription completes its first sync
Then both Team 1 trucks are available locally
And the client reports Ready offline
And Team 2 assignments are not present
```

### Scenario: relevant competing claims are included

```gherkin
Given Team 1 needs lilacs
And Lot B is an alternative lilac lot
And Team 2 has an active claim against Lot B
When Team 1 synchronizes its daily package
Then Team 1 receives the claim needed to calculate Lot B availability
And Team 1 does not receive Team 2's complete truck assignments
```

### Scenario: the complete package boundary is enforced

```gherkin
Given Team 1 requires lilacs in today's published plan
And lilacs exist in Lot A and Lot B
And a future plan reserves plants from Lot B
And Team 2 has an active alternative claim on Lot B
And Team 2 has pickup history on unrelated Lot C
When Team 1 completes first sync
Then Team 1 receives Lot A and Lot B recorded quantities and flags
And Team 1 receives remaining active allocations on Lot A and Lot B across plan dates
And Team 1 receives Team 2's active claim on Lot B
And Team 1 does not receive Team 2's pickup history or Lot C
```

### Scenario: retained team packages remain isolated

```gherkin
Given the device previously synchronized Team 1
When it synchronizes Team 2 for the same published plan
Then Team 2 screens query only Team 2 assignments and activity
And retained Team 1 rows do not appear in Team 2 screens
And Team 1 remains available from its cached package when selected again offline
```

### Scenario: current date has no published plan

```gherkin
Given the device calendar date has no published daily plan
When the worker enters a team number while online
Then the PWA reports that no published plan exists for the date
And it does not silently open a future or stale plan
```

## 7. Offline field scenarios

### Scenario: ordinary planned pickup survives reconnect

```gherkin
Given Team 1 has 5 lilacs assigned from Lot A
And Team 1 is offline
When Team 1 records picking 5 lilacs
Then the pickup is immediately visible locally
When Team 1 reconnects
Then SQL Server records one pickup of 5
And the upload queue becomes empty
```

### Scenario: short pickup flags by default

```gherkin
Given Team 1 has 5 lilacs assigned from Lot A
When Team 1 records picking 3
And selects Dead or damaged
Then the form defaults to flagging Lot A
When the worker confirms
Then Lot A is unavailable on that device
And the remaining need is 2 lilacs
And alternative lilac lots are shown
```

### Scenario: short pickup may avoid a flag

```gherkin
Given Team 1 records less than its assignment
When the worker selects No problem with the lot
Then the form defaults to not flagging the lot
And the worker can save the short pickup
```

### Scenario: short-pick flag defaults match every reason

```gherkin
Given a worker records less than the assigned quantity
When each supported shortage reason is selected in turn
Then Dead or damaged defaults to flag
And Inventory count wrong defaults to flag
And Lot inaccessible defaults to flag
And Wrong product defaults to flag
And No problem with the lot defaults to do not flag
And Other permits either choice
And every final flag choice is visible before saving
```

### Scenario: an alternative claim becomes a pickup

```gherkin
Given Team 1 still needs 2 lilacs
And Lot B has sufficient last-known free quantity
When Team 1 selects Lot B
Then an active claim of 2 is stored locally
When Team 1 records picking the claimed plants
Then the claim becomes picked
And its pickup effect is counted once
```

### Scenario: a claim may be cancelled

```gherkin
Given Team 1 has an active claim of 2 lilacs from Lot B
When Team 1 cancels the claim
Then the claim becomes cancelled
And Lot B free quantity increases by 2
And no pickup is created
```

### Scenario: an insufficient alternative remains selectable

```gherkin
Given Team 1 still needs 3 lilacs
And Lot B has a last-known free quantity of 2
When Team 1 views alternative lots
Then Lot B is shown after lots with sufficient quantity
And selecting Lot B requires a warning confirmation
```

### Scenario: an abandoned claim becomes visible to admin

```gherkin
Given Team 1 has an active alternative claim
When Team 1 completes the truck without picking or cancelling it
And Team 1 synchronizes
Then the admin panel shows an abandoned-claim exception
```

## 8. Multi-client conflict scenarios

### Scenario: concurrent alternatives fit within inventory

```gherkin
Given Lot B has 10 unallocated lilacs
And Team 1 and Team 2 share the same synchronized snapshot
And both teams are offline
When Team 1 picks 5 lilacs from Lot B
And Team 2 picks 5 lilacs from Lot B
And both teams reconnect
Then both pickups are preserved
And Lot B converges to zero unallocated lilacs
And no overdraw exception is created
```

### Scenario: concurrent alternatives overdraw inventory

```gherkin
Given Lot B has 10 unallocated lilacs
And Team 1 and Team 2 are offline
When each team records picking 6 lilacs from Lot B
And Team 1 reconnects before Team 2
Then both pickup facts are preserved
And the authoritative quantity may become negative
And an overdraw exception is created
And both upload queues become empty
```

The same scenario must run with Team 2 reconnecting first.

### Scenario: an over-pick is confirmed and recorded

```gherkin
Given Team 1 is assigned 5 lilacs from Lot A
When Team 1 enters an actual pickup of 6
Then the PWA requires confirmation
When the worker confirms and synchronizes
Then SQL Server preserves the pickup of 6
And the planned reservation decreases by 5
And recorded quantity decreases by 6
And an over-pick exception is created
```

### Scenario: an offline flag propagates after reconnect

```gherkin
Given Team 1 and Team 2 have synchronized Lot A
And both teams are offline
When Team 1 flags Lot A
Then Team 1 immediately treats Lot A as unavailable
When Team 1 and Team 2 reconnect
Then Team 2 eventually treats Lot A as unavailable
```

### Scenario: pickup before receiving a flag is preserved

```gherkin
Given Team 1 flags Lot A while offline
And Team 2 picks from Lot A before receiving that flag
When both teams reconnect
Then the flag and pickup are both preserved
And the backend creates a flagged-source exception
```

## 9. Correction scenarios

### Scenario: admin correction resolves an overdraw

```gherkin
Given an overdraw exception references pickups from Team 1 and Team 2
When the administrator records the agreed correction
Then the original pickups remain unchanged
And the exception becomes resolved
And both field clients receive the corrected state
```

### Scenario: shared exception reaches every participant

```gherkin
Given an overdraw exception links pickups from Team 1 and Team 2
When both field clients synchronize their team packages
Then the exception is visible to Team 1
And the exception is visible to Team 2
And it is absent from a team that has no exception participant row
```

### Scenario: releasing a short-pick remainder changes reservation only

```gherkin
Given Team 1 picked 3 of 5 allocated lilacs
And the remaining allocation of 2 is still reserved
When the administrator records a release-reserved-remainder correction of 2
Then allocation reserved remaining decreases by 2
And lot recorded quantity does not change
And the original short pickup remains unchanged
```

### Scenario: correcting planned pickup quantity recomputes projections

```gherkin
Given Team 1 has an assignment of 5 lilacs from Lot A
And its effective planned pickup is 5
When the administrator corrects the effective pickup quantity to 3
Then Lot A recorded quantity increases by 2
And assignment planned picked quantity becomes 3
And allocation reserved remaining increases by 2
And the original pickup remains unchanged
```

### Scenario: reassigning a planned pickup restores its reservation

```gherkin
Given Team 1 has an assignment of 5 lilacs from Lot A
And its effective planned pickup of 5 is recorded against Lot A
When the administrator reassigns that pickup to alternative Lot B
Then Lot A recorded quantity increases by 5
And Lot B recorded quantity decreases by 5
And the planned assignment consumed quantity becomes zero
And the allocation reserved remaining increases by 5
And the original pickup remains unchanged
```

### Scenario: clearing a flag does not edit quantity

```gherkin
Given Lot A is flagged with a recorded quantity of 7
When the administrator clears the flag
Then Lot A remains at quantity 7
And the flag history records that it was cleared
```

## 10. Durability and failure scenarios

### Scenario: retry is idempotent

```gherkin
Given a field pickup has operation ID X
And the API commits X but the response is lost
When PowerSync retries operation X
Then SQL Server contains one pickup for X
And the API returns the stored result
And the upload queue advances
```

### Scenario: every field operation type is idempotent

```gherkin
Given a claim, pickup, shortage report, and flag each has a stable operation ID
When every operation is submitted twice with the same payload
Then each business effect exists once
And every retry returns its stored result
When an existing operation ID is reused with a different payload
Then the API rejects the mismatched reuse
```

### Scenario: an administrative correction retry is idempotent

```gherkin
Given an open exception
And a correction command has stable command ID C
When the administrator submits command C twice with the same payload
Then one correction exists
And both responses identify that correction
When command ID C is reused with a different payload
Then the API rejects the mismatched reuse
```

### Scenario: unexpected API failure retains the queue

```gherkin
Given a client has two queued operations
When the API fails before committing the first operation
Then neither operation is acknowledged
When the API recovers
Then both operations are applied in order
And the upload queue becomes empty
```

### Scenario: browser restart preserves queued work

```gherkin
Given an installed field PWA has a downloaded day
And the field client is offline
And the worker records pickups
When Chromium closes completely and restarts with the same profile
Then the downloaded day and queued pickups remain available
When the client reconnects
Then the pickups synchronize once
```

### Scenario: field sync state distinguishes local and synchronized work

```gherkin
Given a team package completed first sync
And the field client is offline
When the worker records two operations
Then the PWA shows Ready offline
And it shows offline state and two queued changes
When the client reconnects and both operations converge
Then it shows online state and zero queued changes
And it updates the last successful synchronization time
And any resulting exception is visible
```

### Scenario: PowerSync restart does not lose convergence

```gherkin
Given field clients have queued offline work
And PowerSync Service restarts
When the service becomes healthy and the clients reconnect
Then every operation reaches SQL Server once
And every client reaches the same authoritative state
```

## 11. Physical Android checklist

The tester records device model, Android version, Chrome version, PWA build, PowerSync Web version, VFS selection, and timestamps.

1. Install the PWA from Chrome.
2. Select a team and wait for Ready offline.
3. Disable Wi-Fi and mobile data.
4. Close Chrome and launch the installed PWA.
5. Confirm all trucks and assignments remain visible.
6. Record planned, short, and alternative pickups.
7. Restart the phone while still offline.
8. Confirm the day and queued operations remain.
9. Re-enable connectivity.
10. Confirm the queue empties and the admin panel receives each operation once.
11. Confirm synchronized exceptions appear on the device.

## 12. Azure SQL checklist

1. Provision a temporary Azure SQL Database tier that supports CDC.
2. Apply schema, permissions, CDC, and PowerSync checkpoint setup.
3. Connect the test PowerSync instance without exposing secrets in artifacts.
4. Run the overdraw scenario in both reconnect orders.
5. Run the idempotent retry scenario.
6. Record source-to-client and reconnect-to-convergence timings.
7. Remove the temporary environment when evidence is captured.

## 13. CI behavior

CI runs one qualification job that performs the same container lifecycle as local development:

- `npm run check` for formatting, linting, type checks, and fast tests;
- the complete real-stack Playwright Chromium suite;
- API and PowerSync restart recovery;
- the orchestrated queued-work interruption scenario;
- twenty offline reconnect iterations with a machine-readable timing summary.

The job retains qualification summaries on every run and Playwright traces, screenshots, service logs, and sanitized health output on failure. A final scan rejects any artifact containing one of the configured credential values.

## 14. Acceptance evidence

The final report contains:

- Commit and dependency versions
- Local and Azure SQL environment details
- Automated test summary
- Android checklist and evidence
- Convergence timing distribution across at least 20 reconnect runs
- Every observed data loss, duplicate, stuck queue, stale state, or manual recovery
- A direct recommendation to proceed, proceed with conditions, or reject PowerSync for this scenario

## 15. Requirements traceability

| Requirement group | Primary evidence |
|---|---|
| FR-001 through FR-003 | Admin UI scenario, API integration tests, and flag-clear scenario |
| FR-004 through FR-018 | Planning scenarios and publication integration tests |
| FR-019 through FR-028, FR-067, FR-068 | Team subscription, current-date, retained-package, and offline readiness scenarios |
| FR-029 through FR-045 | Offline pickup, shortage, alternative, claim, over-pick, and restart scenarios |
| FR-046 through FR-051 | Flag default, propagation, flagged-source, and flag-clear scenarios |
| FR-052 through FR-060, FR-069 | Multi-client conflict, field and admin idempotency, exception-participant, correction, and convergence scenarios |
| FR-061 through FR-066 | Field sync-state scenario plus rendered UI assertions |
| NFR-001 through NFR-006 | Headless Chromium suite and physical Android checklist |
| NFR-007 | Twenty-run convergence measurements and final report |
| NFR-008 | Real-stack E2E job topology and CI evidence |
| NFR-009 | Secret scanning and sanitized failure-artifact inspection |
| NFR-010 | Architecture inspection and container connection tests |

## 16. Hard pass and fail thresholds

The POC fails until corrected if any of these occur:

- One lost operation in automated, Android, or Azure SQL evidence
- One duplicate business effect after an idempotent retry
- One queue that remains non-empty more than 30 seconds after all local services report healthy
- One local reconnect run that does not converge within 30 seconds
- One Azure SQL reconnect run that does not converge within 120 seconds
- One affected client that converges to a different authoritative state

All 20 local convergence runs must pass. The report still records the full timing distribution so a technically passing but operationally poor result remains visible.

These are POC test thresholds, not proposed production service-level objectives.
