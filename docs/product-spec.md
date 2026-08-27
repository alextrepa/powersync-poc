# Product specification

Status: approved for implementation planning
Date: 2026-08-27

## 1. Purpose

This proof of concept tests whether PowerSync can support field teams that pick plants for numbered truck loads while connectivity is unreliable.

The POC must answer four questions:

1. Can an Android PWA download a complete team's daily work and reopen it offline?
2. Can field actions survive browser and network interruption without loss or duplication?
3. Can concurrent offline work converge without hiding physical inventory discrepancies?
4. Can the design operate against SQL Server locally and Azure SQL Database in a final validation run?

The result is falsifiable. Repeated data loss, blocked uploads, failed convergence, unacceptable SQL Server behavior, or unreliable Android persistence can rule PowerSync out.

## 2. Actors

### Back-office administrator

The administrator works online. They manage inventory, create future daily plans, allocate plants to trucks, publish team assignments, review field activity, and resolve exceptions.

### Field team

A field team is a numbered slot within one daily plan. Team 1 on one date is unrelated to Team 1 on another date. The POC does not model individual workers or permanent crews.

The field user enters a team number. There is no login or authorization in this POC.

## 3. Terms

| Term | Meaning |
|---|---|
| Product | A plant type, such as lilac. |
| Lot | A physical inventory source containing one product. A product may exist in several lots. |
| Recorded quantity | The back office's current quantity for a lot. |
| Daily plan | One work date containing a team count and one or more numbered trucks. |
| Truck | One planned pickup batch. A day may contain several trucks. |
| Allocation | A quantity from a specific lot reserved for a truck, possibly weeks before pickup. |
| Team assignment | A published share of an allocation for one numbered team. |
| Claim | A team's intention to use unallocated plants from an alternative lot. |
| Pickup | A record of what the team physically took. |
| Lot flag | A warning that removes a lot from normal candidate selection. |
| Exception | A server-recorded condition requiring review, such as an overdraw or abandoned claim. |
| Correction | A new administrative record that resolves an exception without erasing field history. |

## 4. Product requirements

### 4.1 Inventory and planning

- **FR-001** The admin app shall create and edit products.
- **FR-002** The admin app shall create lots, each linked to exactly one product and a recorded quantity.
- **FR-003** The admin app shall edit a lot's recorded quantity.
- **FR-004** The admin app shall create a daily plan with a work date and positive team count.
- **FR-005** The admin app shall create one or more numbered trucks within a daily plan.
- **FR-006** The admin app shall allocate a positive product quantity from a specific lot to a truck.
- **FR-007** Creating or increasing an allocation shall reserve inventory immediately, even when the work date is weeks away.
- **FR-008** The backend shall reject an allocation that exceeds the lot's unallocated quantity.
- **FR-009** Allocation validation shall be transactional so concurrent administrative requests cannot over-allocate a lot.
- **FR-010** Draft allocations may be created, moved, reduced, or cancelled.
- **FR-011** A draft plan shall show the generated team split before publication.
- **FR-012** Publication shall divide every truck allocation across Team 1 through Team N.
- **FR-013** The split shall give each team `floor(quantity / team count)`, then give remaining units to the lowest team numbers.
- **FR-014** The backend shall not create zero-quantity team assignments.
- **FR-015** Publication shall freeze the team count, trucks, allocations, and generated assignments.
- **FR-016** Publication shall not reserve inventory again. The allocation is already the reservation.
- **FR-017** The backend shall reject publication when a referenced lot is flagged or the plan is inconsistent.
- **FR-018** Every team shall see every truck in the POC. A team may have no row for a particular allocation when its calculated share is zero.

### 4.2 Team selection and daily download

- **FR-019** The field PWA shall ask for a team number and default to the device's current calendar date. At most one plan may be published for a date.
- **FR-020** The PWA shall persist the last entered team number for convenience.
- **FR-021** Selecting a team shall subscribe to the composite key of published plan ID and team number. The team number is a filter, not authorization.
- **FR-022** The team package shall include all trucks and assignments for the selected team and date.
- **FR-023** The package shall include every lot whose product appears in the selected team's assignments for that plan.
- **FR-024** For each candidate lot, the package shall include recorded quantity, active flag, remaining active allocations across every plan date, and active alternative claims across every team.
- **FR-025** The package shall include the selected team's own claims, pickups, shortage reports, and exceptions. It shall not include other teams' complete plans, assignments, pickup history, or unrelated data.
- **FR-026** The PWA shall show `Ready offline` only after the first synchronization of the complete team package finishes.
- **FR-027** A previously synchronized team and day shall remain usable without connectivity.
- **FR-028** All trucks shall be downloaded before field work. The UI may encourage truck order but shall not hard-lock later trucks.
- **FR-067** Every local query shall include the active published plan ID and team number where applicable so retained packages cannot appear in another team's UI.
- **FR-068** Switching to a team and plan that has never completed first sync shall require connectivity. The previous package shall remain intact until the new package is ready.

### 4.3 Field pickup workflow

- **FR-029** The field PWA shall record actual pickup quantity from a planned lot.
- **FR-030** The PWA shall allow actual quantity to be lower or higher than the assignment.
- **FR-031** An over-pick shall require confirmation and create an exception after server processing.
- **FR-032** A short pickup shall require a reason and expose the remaining need.
- **FR-033** Short-pick reasons shall include dead or damaged plants, incorrect inventory count, inaccessible lot, wrong product, no problem with the lot, and other.
- **FR-034** Dead or damaged, incorrect count, inaccessible, and wrong product shall default to flagging the lot.
- **FR-035** No problem with the lot shall default to no flag.
- **FR-036** Other shall let the worker choose whether to flag.
- **FR-037** The worker shall see the final flag choice before saving the short pickup.
- **FR-038** A short pickup shall not automatically release the uncertain remainder of the original reservation.
- **FR-039** The PWA shall show unflagged alternative lots for the same product, ordered by last-known free quantity.
- **FR-040** The worker may select a lot even when its last-known free quantity appears insufficient, after a warning.
- **FR-041** Selecting an alternative lot shall create an active claim.
- **FR-042** A claim shall become picked or cancelled. It shall not be counted after leaving the active state.
- **FR-043** A pickup from an alternative lot shall remain distinct from the claim that preceded it.
- **FR-044** An active claim left when its truck is completed shall create an administrative exception.
- **FR-045** The PWA shall preserve field actions while offline and upload them when connectivity returns.

### 4.4 Lot flags

- **FR-046** A flag applies to the entire lot because each lot contains one product.
- **FR-047** A flagged lot shall be unavailable for allocations and normal alternative claims.
- **FR-048** The device that creates a flag shall apply it locally without waiting for synchronization.
- **FR-049** Other teams shall receive the flag when they next synchronize.
- **FR-050** The administrator shall clear a flag independently from editing the lot quantity.
- **FR-051** Clearing a flag shall not erase its history.

### 4.5 Conflict and correction behavior

- **FR-052** The backend shall preserve validly formed pickup facts even when they create an inventory discrepancy.
- **FR-053** The system shall not use silent last-write-wins behavior for physical pickup conflicts.
- **FR-054** If synchronized pickups overdraw a lot, the calculated quantity may become negative and the backend shall create an exception.
- **FR-055** An upload conflict shall not leave later client operations permanently blocked in the PowerSync FIFO queue.
- **FR-056** Field mutations shall carry stable operation identifiers and be idempotent.
- **FR-057** Retrying an acknowledged field operation shall not create a duplicate claim, pickup, shortage report, or flag.
- **FR-058** The admin app shall display claims, pickups, flags, and unresolved exceptions.
- **FR-059** The administrator shall resolve an exception with a new correction record rather than editing or deleting the original field fact.
- **FR-060** Corrected state shall synchronize to every affected field client.
- **FR-069** Administrative correction commands shall carry stable command identifiers and shall be idempotent.

### 4.6 Status and feedback

- **FR-061** The field PWA shall display the selected team number and plan date.
- **FR-062** The PWA shall display online or offline state.
- **FR-063** The PWA shall display the number of queued local changes.
- **FR-064** The PWA shall display the last successful synchronization time.
- **FR-065** The PWA shall warn when a synchronized action produced an exception.
- **FR-066** Each truck shall show a derived state of not started, in progress, or complete.

## 5. Admin navigation

The admin app has three sections:

```text
Inventory
  Products
  Lots and quantities
  Flags

Planning
  Daily plans
  Team count
  Numbered trucks
  Allocations
  Generated split preview
  Publish

Operations
  Claims and pickups
  Exceptions
  Corrections
```

## 6. Field navigation

```text
Enter team number
  Today's trucks and sync state
    Truck assignments
      Record pickup
      Record short pickup
      Choose alternative lot
      Flag lot
    Local and synchronized exceptions
```

## 7. Non-functional requirements

- **NFR-001** Android Chrome is the required field platform.
- **NFR-002** iOS support is desirable but is not a POC acceptance gate.
- **NFR-003** Multiple browser tabs are not required.
- **NFR-004** The installed PWA shall reopen a downloaded day after Chrome and the phone restart while offline.
- **NFR-005** The PWA application shell and PowerSync database shall both remain available offline.
- **NFR-006** Field operations shall survive browser closure, API failure, PowerSync restart, and reconnect.
- **NFR-007** The POC shall measure reconnect-to-convergence time and report the observed distribution.
- **NFR-008** Every automated scenario shall use the real API, SQL Server, PowerSync Service, and bucket storage unless its test level explicitly says otherwise.
- **NFR-009** Logs and test artifacts shall not contain database passwords, tokens, or connection strings.
- **NFR-010** The implementation shall keep source SQL Server data separate from PowerSync's private PostgreSQL bucket storage.

## 8. Explicit limitations

- There is no user authentication or authorization.
- A worker can enter any valid team number.
- An offline client cannot know about another offline client's new claim or flag.
- Concurrent offline work can create inventory conflicts.
- Human operators resolve the physical situation before the administrator records a correction.
- SQL Server and Azure SQL support in PowerSync is a technical risk that the POC must test.

## 9. Out of scope

- Individual worker accounts or permanent teams
- Customer and order management beyond the pickup quantities needed for the scenario
- Maps, driving directions, and route optimization
- Truck capacity calculation
- Replenishment workflows
- Reporting and analytics
- Production security and identity integration
- Production deployment and operational support design
- Multi-tab Android behavior
- Guaranteed iOS support

## 10. Acceptance

The POC is accepted only when:

1. The SQL Server CDC feasibility gate passes.
2. Every functional and non-functional requirement in this document is implemented or explicitly rejected with evidence in the decision report.
3. The real-stack Chromium suite passes in CI.
4. A physical Android phone passes the offline cold-start and reconnect checklist.
5. The primary conflict scenario passes against Azure SQL Database.
6. The final report states measured convergence time, failures encountered, and whether PowerSync is recommended for the client scenario.

Correctness thresholds are strict:

- Zero lost operations across the complete automated suite and Android checklist.
- Zero duplicate business effects across the complete automated suite and Azure SQL retry scenario.
- Zero client upload queues remaining non-empty for more than 30 seconds after all local services are healthy.
- Every local reconnect run converges within 30 seconds.
- Every Azure SQL reconnect run converges within 120 seconds.
- Any breach fails the POC until its cause is fixed and the full affected scenario set passes again.

The detailed scenarios and evidence requirements are in [the verification plan](test-plan.md).
