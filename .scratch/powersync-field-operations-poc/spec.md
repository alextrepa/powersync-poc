# PowerSync field operations POC

Status: ready-for-agent

## Problem Statement

Field teams load plants for several trucks each day. The back office plans the work before the teams leave, often weeks in advance, by reserving quantities from product-specific lots and dividing the work across numbered teams.

The field does not match the plan perfectly. Plants may be dead, a recorded quantity may be wrong, a lot may be inaccessible, or the lot may contain the wrong product. A team must then pick the missing quantity from another lot. Internet access is unreliable at the exact point where the team needs current inventory and claim information.

The dangerous case occurs when two offline teams choose the same alternative lot. Software cannot prevent every physical conflict while both devices are disconnected. It must preserve what each team reports, avoid losing or duplicating work during synchronization, expose the discrepancy, and let an administrator record the agreed correction without rewriting history.

This proof of concept must determine whether PowerSync can support that workflow with an Android PWA, SQL Server during local development, and Azure SQL Database as the client-compatible database target. A failed result is useful. The POC should reject the approach if operations disappear, retries duplicate business effects, queues become stuck, clients fail to converge, or browser storage does not survive realistic Android interruptions.

## Solution

Build a small field PWA and an online admin application on one TypeScript stack.

The admin creates products and lots, records lot quantities, defines a daily plan, chooses the number of teams, adds numbered trucks, and allocates plant quantities from specific lots. Allocation reserves inventory immediately. Publishing the plan freezes it and divides each allocation evenly across the numbered teams, with any remainder assigned to the lowest team numbers.

A field worker opens the installed PWA, enters a team number, and downloads that team's complete day. The package contains all trucks and assignments for the selected team, plus every candidate lot for the products on that route. It also contains the flags, active allocations, and active claims needed to estimate availability. Once the package is ready, the worker can close the browser, lose connectivity, restart the phone, record pickups, report shortages, flag faulty lots, and choose alternative lots.

Field writes first enter a persistent local PowerSync database. When connectivity returns, a TypeScript API applies those operations to SQL Server through idempotent commands. The server preserves valid physical pickup facts even when concurrent offline work makes the calculated inventory negative. It creates an exception instead of silently discarding one team's work. The online admin reviews claims, flags, pickups, and exceptions, then records append-only corrections after the teams settle the physical situation.

The POC starts with a narrow technical gate that proves SQL Server change capture, download, offline mutation, upload, and convergence before either application is built out. Automated Playwright scenarios exercise the complete local stack in headless Chromium. A physical Android checklist proves installed-PWA persistence, and a final Azure SQL run tests the production database path.

## User Stories

1. As a back-office administrator, I want to create a product, so that lots can refer to the plant they contain.
2. As a back-office administrator, I want each lot to contain one product, so that a lot flag has an unambiguous meaning.
3. As a back-office administrator, I want one product to exist in several lots, so that field teams have alternative pickup locations.
4. As a back-office administrator, I want to record a numeric quantity for each lot, so that planning can reserve known inventory.
5. As a back-office administrator, I want to correct a recorded lot quantity, so that the planning view reflects a new count.
6. As a back-office administrator, I want to create a plan for a work date, so that teams can download that day's work.
7. As a back-office administrator, I want to specify how many numbered teams will work that date, so that the backend can divide assignments consistently.
8. As a back-office administrator, I want team numbers to belong only to one daily plan, so that Team 1 on different dates does not imply a permanent crew.
9. As a back-office administrator, I want to add several numbered trucks to one day, so that each team can fill more than one truck.
10. As a back-office administrator, I want to allocate a plant quantity from a specific lot to a truck, so that the loading plan identifies where the plants should come from.
11. As a back-office administrator, I want an allocation to reserve inventory when I create it, so that later plans cannot allocate the same plants.
12. As a back-office administrator, I want reservations to work weeks before pickup, so that future planning uses the remaining stock.
13. As a back-office administrator, I want the backend to reject an allocation above the free quantity, so that online planning cannot knowingly overbook a lot.
14. As a back-office administrator, I want concurrent allocation requests checked in one transaction, so that two office actions cannot overbook inventory through a race.
15. As a back-office administrator, I want to edit, move, reduce, or cancel draft allocations, so that I can fix a plan before publication.
16. As a back-office administrator, I want to preview the generated split, so that I know what each team will receive.
17. As a back-office administrator, I want each allocation divided using a deterministic rule, so that repeating publication produces the same assignments.
18. As a back-office administrator, I want division remainders assigned to the lowest team numbers, so that every allocated unit is assigned without manual balancing.
19. As a back-office administrator, I want zero-quantity shares omitted, so that teams do not see meaningless assignment rows when there are more teams than plants.
20. As a back-office administrator, I want publication to freeze the team count, trucks, allocations, and generated assignments, so that field work does not change underneath downloaded clients.
21. As a back-office administrator, I want publication to reuse the existing reservation, so that inventory is not reserved twice.
22. As a back-office administrator, I want publication blocked when a referenced lot is flagged, so that known faulty stock is not sent to the field.
23. As a field worker, I want to enter only my team number, so that the POC does not require user or workforce administration.
24. As a field worker, I want the app to default to today's plan, so that opening the correct work is quick.
25. As a field worker, I want the app to remember my last team number, so that I do not re-enter it every time.
26. As a field worker, I want every truck for my team and day downloaded together, so that a bad connection between truck loads does not block later work.
27. As a field worker, I want to see every truck even when I have no share of one allocation, so that the day's truck sequence remains understandable.
28. As a field worker, I want the app to say when the full package is ready offline, so that I know when it is safe to leave coverage.
29. As a field worker, I want an already downloaded team and day to reopen offline, so that loss of connectivity does not erase my route.
30. As a field worker, I want a new team or day to require its own completed first synchronization, so that stale data is not mistaken for the selected plan.
31. As a field worker, I want retained packages isolated by plan and team, so that switching teams does not mix one team's work into another view.
32. As a field worker, I want candidate lots for every product assigned to my team, so that I can reroute a pickup without calling the office first.
33. As a field worker, I want to see active allocations from other plans and teams for each candidate lot, so that my availability estimate includes reserved stock.
34. As a field worker, I want to see active alternative claims from other teams, so that I can avoid a lot another connected team has already claimed.
35. As a field worker, I want unrelated products and complete plans from other teams excluded, so that the offline package stays focused.
36. As a field worker, I want to record the quantity physically picked from the planned lot, so that the server receives what happened rather than what was expected.
37. As a field worker, I want to record less than my assignment, so that dead plants or a bad count do not force a false pickup.
38. As a field worker, I want to record more than my assignment after confirmation, so that an unusual physical pickup is preserved and reviewed.
39. As a field worker, I want a short pickup to require a reason, so that the office understands why the plan failed.
40. As a field worker, I want shortage reasons for dead or damaged plants, incorrect count, inaccessible lot, wrong product, no lot problem, and other, so that common situations take few taps.
41. As a field worker, I want dead or damaged plants, an incorrect count, an inaccessible lot, or a wrong product to default to flagging the lot, so that other routes receive a warning.
42. As a field worker, I want "no problem with the lot" to default to no flag, so that a route-specific shortage does not disable good inventory.
43. As a field worker, I want an "other" reason to let me choose whether to flag, so that the app does not guess an unknown situation.
44. As a field worker, I want to review the final flag choice before saving, so that I can correct an inappropriate default.
45. As a planner, I want the uncertain remainder of a short pickup to stay reserved until an administrator releases it, so that unverified stock is not silently offered elsewhere.
46. As a field worker, I want alternative lots ranked by last-known free quantity, so that the most likely source appears first.
47. As a field worker, I want to select an alternative lot whose last-known quantity looks insufficient after a warning, so that stale offline data does not block a valid physical decision.
48. As a field worker, I want selecting an alternative lot to create a claim, so that connected teams can see my intent before I pick.
49. As a field worker, I want to cancel an unused claim, so that it stops reducing the availability estimate.
50. As a field worker, I want a completed alternative pickup linked to its prior claim but stored as a separate fact, so that intent and physical activity remain distinct.
51. As a back-office administrator, I want an abandoned active claim reported when a truck closes, so that stale intent can be reviewed.
52. As a field worker, I want a lot flag to apply immediately on my device, so that I do not keep selecting a lot I just found faulty.
53. As a field worker, I want flags from other teams after synchronization, so that I can avoid lots they found faulty.
54. As a back-office administrator, I want flagged lots excluded from new allocations and normal alternative selection, so that known bad stock is treated as unavailable.
55. As a back-office administrator, I want to clear a flag without editing the quantity, so that availability and inventory count remain separate decisions.
56. As a back-office administrator, I want cleared flag history retained, so that the investigation record is not erased.
57. As a field worker, I want my offline changes queued durably, so that closing the browser or restarting the phone does not lose work.
58. As a field worker, I want to see online state, queued change count, and last successful synchronization time, so that I know whether the office has received my work.
59. As a field worker, I want my queue to advance after the server records a business conflict, so that one disputed action does not block all later work.
60. As a field worker, I want a retry after a lost API response to have one business effect, so that unreliable connectivity does not duplicate a pickup or flag.
61. As a field worker, I want both teams' physical pickups preserved when offline work conflicts, so that synchronization does not invent a false winner.
62. As a back-office administrator, I want an exception when concurrent pickups overdraw a lot, so that the discrepancy is visible.
63. As a back-office administrator, I want an exception when a team picks from a lot before receiving another team's flag, so that both facts survive and require review.
64. As a back-office administrator, I want affected teams linked to a shared exception, so that each relevant field client receives its result.
65. As a back-office administrator, I want to resolve an exception with a new correction record, so that the original field history remains intact.
66. As a back-office administrator, I want correction commands to be idempotent, so that an office retry cannot apply an inventory adjustment twice.
67. As a back-office administrator, I want corrections to recompute lot, allocation, and assignment projections in one transaction, so that every view agrees afterward.
68. As a field worker, I want resolved and corrected state synchronized to my device, so that I can see the office response to my exception.
69. As a developer, I want to prove one SQL Server row can reach a browser through PowerSync before building the product UI, so that an unsupported source path fails early.
70. As a developer, I want to prove one offline browser mutation reaches SQL Server once, so that the upload path is tested before feature work.
71. As a developer, I want multi-team scenarios to run in isolated headless Chromium contexts, so that CI exercises real offline concurrency.
72. As a developer, I want the automated scenarios to use the real local services, so that passing mocked tests cannot hide a broken PowerSync or SQL Server integration.
73. As a developer, I want persistent browser profiles in restart tests, so that the tests prove browser database survival rather than only in-memory behavior.
74. As a developer, I want failure artifacts sanitized, so that database credentials do not leak through CI traces or logs.
75. As a developer, I want at least 20 reconnect runs measured, so that the recommendation includes a timing distribution rather than one successful demo.
76. As a developer, I want a physical Android phone test, so that desktop Chromium does not stand in for the required field platform.
77. As a developer, I want an Azure SQL compatibility run, so that local SQL Server success does not hide a client-environment failure.
78. As a client stakeholder, I want strict loss, duplication, queue, and convergence thresholds, so that the POC produces a defensible decision.
79. As a client stakeholder, I want the final report to recommend proceeding, proceeding with conditions, or rejecting PowerSync, so that the POC ends with a decision.
80. As a developer, I want the databases, backend, frontends, PowerSync service, and test runner containerized, so that the host needs only Docker and Just to run the POC.
81. As a developer, I want `just start` to start the complete healthy stack and `just stop` to stop it without deleting its data, so that local lifecycle commands stay predictable.
82. As a developer, I want a private Tailscale HTTPS entry point, so that I can test the installed PWA from a remote phone without publishing the POC to the internet.

## Implementation Decisions

- Build a proof of concept, not a production system. Optimize for a clear technical decision and a finishable codebase.
- Use React, TypeScript, Vite, and TanStack Router for both web applications. TanStack Router alone is enough. Next.js and TanStack Start are unnecessary for this POC.
- Build an installable client-rendered PWA for field work. Android Chrome is required. iOS is desirable but is not an acceptance gate.
- Support one active browser tab. Multi-tab coordination is out of scope.
- Build an online-only admin application on the same frontend stack. It does not need PowerSync.
- Use a TypeScript API for PowerSync uploads and online administrative commands. Both paths call the same domain services and SQL Server transactions.
- Use SQL Server 2022 Developer in Docker as the local application database. Use Azure SQL Database for the final client-compatible validation.
- Treat SQL Server and Azure SQL support as an early technical risk. The first gate proves CDC, replication, download, offline upload, retry, queue advancement, and convergence with a minimal table.
- Use self-hosted PowerSync with private PostgreSQL bucket storage. PostgreSQL stores PowerSync infrastructure data only. Application code does not use it as a business database.
- Enable SQL Server Change Data Capture for each replicated table and any checkpoint structures required by the selected PowerSync version.
- Keep application data in SQL Server. Do not create a second PostgreSQL business model for the POC.
- Use persistent browser SQLite through PowerSync Web for field data. Cache the PWA application shell separately with a service worker.
- Make local SQLite the ordinary read source for the field UI. Field screens do not depend on online HTTP reads.
- Write field changes locally first and let PowerSync's CRUD queue upload them after reconnect.
- Model products and lots separately. Each lot references one product, and a product may have many lots.
- Store the lot's recorded quantity as the office count. Compute availability from recorded quantity, live reservations, active claims, and effective pickups rather than overwriting unrelated facts.
- Model one daily plan per work date for the POC. A filtered uniqueness rule permits at most one published plan for a date.
- Store a positive team count on the daily plan. Team numbers run from 1 through that count and have meaning only within the plan.
- Allow several numbered trucks within one daily plan. Every team receives the truck list, even when a team has no quantity for one allocation.
- Reserve inventory when an allocation is created or increased. Use a transaction and reject quantities above current unallocated inventory.
- Permit draft allocation edits, moves, reductions, and cancellations. Freeze plan structure and generated assignments after publication.
- Split each allocation by giving every team the floor of quantity divided by team count. Give one remaining unit to each lowest-numbered team until the remainder is exhausted.
- Do not create zero-quantity assignment rows when quantity is smaller than team count.
- Make publication idempotent. Publication creates immutable team assignments and does not reserve inventory a second time.
- Reject publication if a referenced lot is flagged or the plan fails its consistency checks.
- Identify the field subscription by published plan ID and team number. Team selection is a data filter, not an authorization boundary.
- Omit authentication, worker accounts, and permanent team membership. Opening the field app and entering a valid team number selects that team's day.
- Persist the last entered team number for convenience. Default the plan date to the device's current date.
- Keep previously synchronized packages on the device. Do not show a newly selected team or plan as ready until its first synchronization completes.
- Scope every team-specific local query by active plan ID and team number so retained packages cannot leak into the active UI.
- Include every truck and assignment for the selected team and plan in its package.
- Include every lot whose product appears in the selected team's assignments. For those lots, include recorded quantity, active flag, all remaining active allocations across plan dates, and active alternative claims across teams.
- Include the selected team's claims, pickups, shortage reports, and exception participation. Exclude other teams' complete plans and unrelated pickup history.
- Derive free quantity from the latest synchronized facts. Treat it as a useful estimate, not a guarantee while another client may be offline.
- Allow planned pickups below or above the assignment. Require confirmation for an over-pick and record a server exception after processing.
- Require a reason for short pickups. Provide dead or damaged, incorrect count, inaccessible lot, wrong product, no problem with the lot, and other.
- Default dead or damaged, incorrect count, inaccessible lot, and wrong product to flagging. Default no problem to no flag. Let the worker decide for other.
- Show the final flag choice before saving a shortage report.
- Keep the unpicked remainder of a planned allocation reserved. Only an explicit administrative correction releases uncertain reserved stock.
- Rank unflagged alternative lots for the product by last-known free quantity. Allow a lot that appears insufficient after warning the worker.
- Create an active alternative claim when a worker selects another lot. A claim can become picked or cancelled. Ignore it in availability after it leaves the active state.
- Store the alternative pickup separately from its claim. A completed truck with a remaining active claim creates an abandoned-claim exception.
- Apply a newly created flag to the originating device immediately. Synchronize it to other teams when they connect.
- Make a flag cover the entire lot. Exclude flagged lots from new allocations and normal alternative selection.
- Let the administrator clear a flag separately from changing recorded quantity. Retain flag history.
- Give every field mutation a stable operation identifier. Store the operation identifier, payload identity, and result so a retry returns the original result without repeating the effect.
- Give every administrative correction command a separate stable command identifier with the same payload-matching rule.
- Preserve valid pickup facts even when the resulting calculated inventory becomes negative. Do not resolve physical conflicts with last-write-wins.
- Convert expected business conflicts into stored pickups, flags, or exceptions and acknowledge the queue item. Reserve retryable failures for infrastructure errors that did not commit.
- Link a shared exception to every affected plan and team through explicit participant records. Team-scoped synchronization uses those records to deliver the exception.
- Keep pickups, shortage reports, flags, and corrections append-only. Administrative correction does not edit or delete the original field fact.
- Support correction effects for releasing a reserved remainder, changing an effective pickup quantity, reassigning a pickup to another lot, adjusting recorded inventory, and resolving an exception.
- Recompute recorded quantity, reserved remainder, and planned-picked projections transactionally when a correction changes quantity or lot attribution.
- Expose online state, offline readiness, queued change count, last successful synchronization, truck progress, and resulting exceptions in the field UI.
- Organize the admin UI around inventory, planning, and operations. Operations includes claims, pickups, flags, exceptions, and corrections.
- Run formatting, linting, type checking, focused tests, and the real-stack browser suite through `just` commands once implementation exists.
- Keep secrets in ignored environment files or CI secret storage. Remove passwords, tokens, and connection strings from test artifacts.
- Record dependency versions, environment details, failures, timing measurements, and manual recovery in the final decision report.
- Run both frontends, the API, SQL Server, PowerSync, PostgreSQL bucket storage, and the automated test runner as containers in one Docker Compose project. Browser-owned SQLite remains inside the browser runtime.
- Make `just start` build and start the complete local stack, wait for declared health checks, and fail when a required service is not ready. Make `just stop` stop the project without deleting named volumes.
- Provide an optional containerized Tailscale node that exposes one private HTTPS entry point with Tailscale Serve. Do not use Tailscale Funnel or another public ingress.
- Keep Tailscale authentication material out of source, logs, and artifacts. Persist node state in a named volume so routine restarts do not require reauthentication.

## Testing Decisions

- Test behavior at the highest practical seam. The primary automated seam drives the field PWA and admin UI with Playwright while the real API, SQL Server, PowerSync service, PostgreSQL bucket storage, and persistent browser databases are running.
- Assert both what users see and the authoritative SQL Server result. Do not replace end-to-end assertions with direct calls to internal helpers.
- Use isolated persistent Chromium contexts for separate field teams and the administrator. A multi-client test must use distinct browser storage and network state.
- Use focused domain tests for the combinatorial rules that would make browser tests slow or obscure. These include team splitting, reservation arithmetic, pickup projections, claim transitions, correction effects, and identifier idempotency.
- Keep domain tests at the transaction or public service boundary. Do not couple them to private function structure.
- Build the SQL Server and PowerSync round-trip gate before feature UI work. Prove server-to-browser replication and offline browser-to-server upload independently.
- Run the complete local stack in CI. Mocked PowerSync, SQLite, API, or SQL Server behavior does not satisfy the core POC scenarios.
- Test allocation quantities smaller than, equal to, and larger than the team count. Verify deterministic remainder distribution and omission of zero shares.
- Test concurrent online allocations against one lot and verify that the transaction prevents over-allocation.
- Test publication retry and verify that it creates one immutable assignment set and does not reserve stock twice.
- Test team package inclusion and exclusion. Verify all selected-team trucks, required product lots, relevant flags, live allocations, active claims, and own activity are present while unrelated plans and products are absent.
- Retain two downloaded team packages in one browser profile and verify that every visible query stays scoped to the active plan and team.
- Test current-date selection, remembered team number, first-sync readiness, and offline reopening of a previously synchronized day.
- Test planned pickup, short pickup, over-pick confirmation, every shortage reason, flag defaults, the optional other flag, and final-choice review.
- Test alternative-lot ordering, insufficient-quantity warnings, claim creation, claim cancellation, completed claims, and abandoned claims.
- Test two offline teams claiming and picking quantities that exactly fit the lot. Preserve both pickups and converge to zero without an overdraw exception.
- Test two offline teams that overdraw the same lot. Run both reconnect orders. Preserve both pickups, allow the derived quantity to become negative, create a shared exception, deliver it to both teams, and empty both queues.
- Test an offline lot flag reaching another team after reconnect.
- Test a team picking before it receives another team's flag. Preserve the pickup and flag, then create a flagged-source exception.
- Test append-only corrections. Verify quantity corrections and lot reassignment update inventory and reservation projections while the original pickup remains unchanged.
- Test lost responses after commit for each field operation type. Verify one business effect, the stored response on retry, mismatched-payload rejection, and continued FIFO progress.
- Test administrative correction retries separately from field operation retries.
- Test API failure before commit, API recovery, PowerSync restart, browser closure, browser restart with the same profile, and reconnect.
- Measure at least 20 local reconnect runs. Record the distribution rather than reporting only an average.
- Require zero lost operations and zero duplicate business effects across the automated suite, Android checklist, and Azure retry scenario.
- Require local queues to empty within 30 seconds after every local service reports healthy. Require every local reconnect run to converge within 30 seconds.
- Run a physical Android checklist that installs the PWA, downloads a day, disables all network access, closes Chrome, reopens the installed app, records work, restarts the phone, reconnects, and verifies exactly-once server effects.
- Record Android device model, Android version, Chrome version, application build, PowerSync version, storage implementation, and timestamps.
- Run the main overdraw scenario in both reconnect orders against Azure SQL Database. Run the idempotent retry scenario and record source-to-client and reconnect-to-convergence times.
- Require Azure SQL reconnect convergence within 120 seconds.
- Capture Playwright traces, screenshots, service logs, and sanitized health output only when useful for failure diagnosis. Scan artifacts for secrets.
- Produce a final report that states observed failures and chooses one result: proceed, proceed with conditions, or reject PowerSync for the client scenario.
- There is no existing codebase test prior art because the repository currently contains specifications only. The Gherkin scenarios already recorded for planning, offline pickup, conflicts, corrections, durability, Android, and Azure SQL define the first behavioral examples.
- Test a clean Compose start, health-gated readiness, stop, and restart with retained SQL Server, PostgreSQL, and Tailscale state.
- Test the field PWA from a separate device through the tailnet-only HTTPS name. Verify that the app, API, and PowerSync connections work without a public endpoint.

## Out of Scope

- Production authentication, authorization, and team membership
- Individual worker accounts or permanent crews
- Customer and order management beyond the quantities needed for the pickup scenario
- Maps, driving directions, route ordering, and route optimization
- Truck capacity calculations
- Automatic rerouting or automatic selection of an alternative lot
- Automatic resolution of two offline teams choosing the same lot
- Replenishment workflows after a lot is flagged
- Reporting, dashboards, and analytics beyond POC evidence
- Editing a published daily plan
- Manual overrides of the generated team split
- Multi-tab field behavior
- Required iOS support
- Production deployment, scaling, monitoring, backup, retention, and disaster recovery
- Production security review and identity integration
- Replacing the client's Azure SQL requirement with PostgreSQL

## Further Notes

- The POC should stay narrow. The first deliverable is the SQL Server round-trip gate, not a polished admin panel.
- PowerSync's SQL Server and Azure SQL path is the central uncertainty. Record exact versions and stop the POC early if the source connector, CDC behavior, or browser persistence cannot meet the acceptance thresholds.
- An offline client cannot know about another offline client's new claim or flag. The design makes that limitation visible and preserves both physical reports. Workers may still need to settle the real-world conflict by phone or in person.
- Negative calculated inventory is permitted as evidence of a real discrepancy. It must never be hidden as a successful conflict resolution.
- The POC acceptance thresholds are test gates, not proposed production service-level objectives.
- A passing desktop Chromium suite is insufficient without the physical Android checklist.
- Local SQL Server success is insufficient without the Azure SQL compatibility run.
- The local stack is fully containerized. The Azure gate replaces only the local SQL Server container with a temporary managed Azure SQL Database while the application services remain containerized.
