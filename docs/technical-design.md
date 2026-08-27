# Technical design

Status: proposed implementation design
Date: 2026-08-27

## 1. Design priorities

The design prioritizes four things:

1. Test the risky SQL Server and PowerSync path before building user interfaces.
2. Preserve physical facts even when offline operations conflict.
3. Keep the POC small enough to finish and discard.
4. Make failures observable so a passing demo cannot hide a stuck queue or stale client.

## 2. System context

```text
Field PWA                         Admin web app
TanStack Router + Vite            TanStack Router + Vite
PowerSync Web + local SQLite      Online HTTP client
        |                                  |
        +---------- TypeScript API --------+
                           |
                     SQL Server source
                           |
                     CDC change tables
                           |
                    PowerSync Service
                           |
                 PostgreSQL bucket storage
                           |
                     Field PWA sync
```

### Field PWA

The field app is an installable client-rendered PWA. TanStack Router handles file-based routes. PowerSync Web owns the local SQLite database. A service worker caches the application shell separately from synchronized business data.

The field app reads from local SQLite. It does not use HTTP reads for ordinary screens. Field writes first enter local SQLite and the PowerSync CRUD queue.

### Admin web app

The admin app is online-only. It reads and writes through the API. It does not use PowerSync or offline mutations because allocation and correction commands require current server state.

### TypeScript API

One API exposes two categories of commands:

- A PowerSync upload endpoint accepts queued field operations.
- Administrative endpoints execute online planning, inventory, publication, flag clearing, and correction commands.

Both paths call the same domain services and SQL Server transactions.

### SQL Server and Azure SQL

SQL Server is the only application-owned server database. Local development uses SQL Server 2022 Developer in Docker. The final compatibility gate uses Azure SQL Database.

PowerSync currently documents SQL Server 2019 and later and Azure SQL as beta source databases. Change Data Capture must be enabled on the database and every replicated table. PowerSync Service 1.18.1 or later is required.

Primary references:

- [PowerSync SQL Server setup](https://docs.powersync.com/configuration/source-db/setup)
- [PowerSync SQL Server connection](https://docs.powersync.com/configuration/source-db/connection)
- [Microsoft CDC enablement](https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/enable-and-disable-change-data-capture-sql-server)

### PowerSync bucket storage

Self-hosted PowerSync uses a private PostgreSQL database for bucket storage. This database is infrastructure, not an application data store. Application code must not connect to it.

## 3. Repository layout

The planned layout is:

```text
apps/
  field/
  admin/
  api/
packages/
  domain/
  database/
  test-support/
powersync/
  service.yaml
  sync-config.yaml
infra/
  docker-compose.yaml
docs/
```

The field and admin apps use React, TypeScript, Vite, and TanStack Router. Shared packages contain domain types, command validation, database access, and test fixtures. The apps do not import each other's implementation code.

## 4. Server data model

The table names below describe responsibilities. Migrations may refine names and column types without changing these contracts.

### Planning and inventory

| Table | Important fields | Responsibility |
|---|---|---|
| `products` | `id`, `name` | Plant catalog used by lots. |
| `lots` | `id`, `product_id`, `recorded_quantity`, `version` | Product-specific inventory source and current count. |
| `daily_plans` | `id`, `service_date`, `team_count`, `status`, `published_at` | Draft and published daily work. A filtered unique constraint permits at most one published plan per date. |
| `trucks` | `id`, `daily_plan_id`, `truck_number` | Numbered pickup batches within a day. |
| `allocations` | `id`, `truck_id`, `lot_id`, `quantity`, `reserved_remaining`, `status` | Inventory reserved for a truck before publication. |
| `team_assignments` | `id`, `allocation_id`, `team_number`, `quantity`, `planned_picked_quantity` | Immutable published quantity plus a server-maintained fulfillment projection. |

### Field activity

| Table | Important fields | Responsibility |
|---|---|---|
| `alternative_claims` | `id`, `assignment_id`, `team_number`, `lot_id`, `quantity`, `state`, `operation_id` | Active, picked, or cancelled request against unallocated inventory. |
| `pickups` | `id`, `assignment_id`, `team_number`, `lot_id`, `quantity`, `source`, `operation_id`, `recorded_at_client` | Immutable physical pickup facts. |
| `shortage_reports` | `id`, `assignment_id`, `expected_quantity`, `picked_quantity`, `reason`, `flag_requested`, `operation_id` | Explanation for a short planned pickup. |
| `lot_flags` | `id`, `lot_id`, `reason`, `status`, `created_by_team_number`, `created_at`, `cleared_at` | Flag history. At most one active flag per lot. |

### Operations and reliability

| Table | Important fields | Responsibility |
|---|---|---|
| `exceptions` | `id`, `type`, `status`, `subject_type`, `subject_id`, `details`, `created_at`, `resolved_at` | Review queue for overdraws, over-picks, abandoned claims, flagged-source pickups, and rejected assumptions. |
| `exception_participants` | `exception_id`, `plan_id`, `team_number`, `pickup_id` | One row per affected field team and pickup. Drives team-scoped exception synchronization. |
| `corrections` | `id`, `command_id`, `exception_id`, `kind`, `details`, `created_at` | Append-only, idempotent administrative resolution. |
| `inventory_adjustments` | `id`, `lot_id`, `previous_quantity`, `new_quantity`, `reason`, `created_at` | History behind admin quantity edits. |
| `processed_operations` | `operation_id`, `operation_type`, `payload_hash`, `result`, `processed_at` | Idempotency record for field uploads. |

## 5. Inventory accounting

### Inventory values

`lots.recorded_quantity` is the current server estimate of physical plants in the lot. It changes only through an applied pickup effect or an administrative inventory adjustment.

`allocations.quantity` is immutable after publication. `allocations.reserved_remaining` is a server-maintained projection of allocated quantity not yet consumed or explicitly released. Its authoritative formula is:

```text
reserved_remaining
= allocation quantity
- sum of effective planned reservation consumed by its assignments
- sum of explicit release_reserved_remainder corrections
```

`team_assignments.quantity` is the immutable published share. `team_assignments.planned_picked_quantity` is a materialized projection calculated as:

```text
planned_picked_quantity
= min(
     assignment quantity,
     sum of current effective quantities for planned-source pickups on the assignment
   )
```

The server recomputes the affected assignment and allocation projections in the same transaction whenever a pickup correction changes quantity, lot, or source.

### Allocation time

Creating or increasing an allocation locks the selected lot row inside a SQL transaction. The server calculates:

```text
free quantity
= recorded quantity
- sum of active allocation reserved_remaining against the lot
- active alternative claims against the lot
```

The command fails if the requested allocation would make free quantity negative.

### Publication time

Publication validates the draft and generates team assignments. It does not change reserved quantity.

For quantity `Q` and team count `N`:

```text
base = floor(Q / N)
remainder = Q mod N

Team i receives:
  base + 1, when i <= remainder
  base, otherwise
```

Zero-quantity assignments are omitted. Publication and assignment generation run in one transaction and are idempotent.

### Pickup time

The upload handler records the immutable pickup and applies its effective inventory quantity once.

For a planned-source pickup of actual quantity `P` against assignment quantity `A`:

```text
planned reservation consumed = min(P, A - planned_picked_quantity)
lot recorded quantity decreases by P
assignment planned_picked_quantity increases by the consumed reservation
allocation reserved_remaining decreases by the consumed reservation
```

Any quantity above the assignment consumes unallocated physical inventory and creates an over-pick exception. It does not decrease the allocation below zero.

For an alternative claim of quantity `C`:

```text
active claim decreases free quantity by C
picked claim becomes inactive
lot recorded quantity decreases by the effective pickup quantity
```

Moving the claim from active to picked and decreasing recorded quantity in one transaction keeps free quantity from changing twice. Cancelling a claim removes its reservation without changing recorded quantity.

A short planned pickup consumes only the actual planned pickup quantity. The assignment and allocation remainder stay reserved until an administrative correction explicitly releases them.

The backend may accept a pickup that makes recorded inventory negative. It creates an exception in the same transaction.

### Correction effects

An immutable pickup fact has a current effective view. Without a correction, the effective lot, source, and quantity equal the original values. A correction adds a new version of that view. Applying a correction transactionally reverses the previous effective inventory effect, applies the new effective effect, and recomputes affected assignment and allocation projections from the formulas above.

The POC supports these append-only correction kinds:

| Kind | Inventory effect |
|---|---|
| `inventory_recount` | Sets recorded quantity through an inventory adjustment. |
| `return_to_lot` | Increases recorded quantity by the returned amount. |
| `release_reserved_remainder` | Decreases allocation reserved remaining without changing recorded quantity. |
| `correct_pickup_quantity` | Sets a new effective pickup quantity. If `delta = new effective quantity - previous effective quantity`, recorded quantity changes by `-delta`, then planned projections are recomputed when the source is planned. |
| `reassign_pickup_lot` | Adds the previous effective quantity back to the previous lot, subtracts it from the new lot, updates the effective source, then recomputes planned projections. A move away from a planned source restores its consumed reservation. A move onto the planned source consumes reservation up to the assignment quantity. |

Every correction references the original exception and affected fact. The original pickup remains unchanged. Reassigning an alternative pickup does not reactivate its historical claim. The claim remains picked, and the corrected effective pickup consumes inventory from the corrected lot. If that lot lacked sufficient free quantity, the correction transaction creates or retains an exception rather than hiding the overdraw.

## 6. State models

### Daily plan

```text
draft -> published
```

Draft plans may change. Published plans are immutable in the POC.

### Alternative claim

```text
active -> picked
active -> cancelled
```

An active claim remaining when its truck is complete creates an exception. Claims do not expire automatically because a disconnected device may still hold an intended pickup.

### Lot flag

```text
active -> cleared
```

Clearing a flag does not edit quantity and does not delete flag history.

### Exception

```text
open -> resolved by correction
```

Corrections append history. They do not mutate the original pickup or shortage report.

## 7. Sync design

### Subscription identity

The field app resolves the device's current calendar date to the single published plan for that date, then supplies `plan_id` and `team_number` as Sync Stream parameters. These values are untrusted filters. The POC deliberately has no authorization.

The app persists the selected team number. A new plan and team becomes usable only after its subscription reports first sync complete. Previously downloaded packages may remain in local SQLite. Every field query scopes rows by active plan ID and team number so packages cannot bleed into each other.

### Team-scoped package

The Sync Streams configuration shall provide:

1. The selected plan, every truck, the selected team's assignments, products, and planned lots.
2. Every lot whose product appears in the selected team's assignments.
3. The active flag, recorded quantity, and remaining active allocations across all plan dates for each candidate lot.
4. Active alternative claims from every team for each candidate lot.
5. The selected team's claims, pickups, shortage reports, and exceptions linked through `exception_participants` for the active plan ID and team number.
6. No other team's complete plan, assignments, pickup history, or unrelated data.

Sync Stream SQL may use equality joins and subqueries. It shall not depend on unsupported aggregation. The client derives display availability from synchronized rows. The backend repeats every authoritative calculation inside SQL Server transactions.

The client calls `waitForFirstSync()` before showing `Ready offline`.

Primary references:

- [Sync Stream client usage](https://docs.powersync.com/sync/streams/client-usage)
- [Supported Sync Stream SQL](https://docs.powersync.com/sync/supported-sql)

## 8. Field write protocol

Every field command has:

- A client-generated UUID operation ID
- Operation type
- Team number and service date
- Entity identifiers
- Payload
- Client-recorded timestamp for audit only

The server does not use the client timestamp to establish authoritative ordering.

The upload handler processes one PowerSync CRUD transaction inside one SQL Server transaction when possible. For each operation it:

1. Checks `processed_operations` by operation ID.
2. Rejects a reused ID with a different payload hash.
3. Applies the domain command or records the resulting exception.
4. Stores the idempotent result.
5. Commits.
6. Acknowledges the PowerSync CRUD transaction.

Expected business conflicts are data, not transport failures. The handler acknowledges them after recording their result so one conflict does not permanently block the FIFO queue.

Unexpected infrastructure failures roll back the SQL transaction and leave the PowerSync transaction unacknowledged for retry.

## 9. PWA storage and offline shell

Gate 0 uses a supported persistent PowerSync Web storage configuration to prove the SQL Server round trip. The field PWA milestone selects the final VFS after headless Chromium restart tests. The later physical Android gate validates that choice on-device and may reject it.

A PWA service worker caches the application shell. PowerSync stores business data separately. A passing test must prove both layers because synchronized SQLite data is useless when the browser cannot load the app shell offline.

The UI always reads local SQLite and displays:

- Team and plan date
- Ready-offline status
- Online or offline state
- Queued operation count
- Last successful sync time
- Synchronized exceptions

## 10. Admin command boundaries

The admin app sends online commands to the API. It never receives database credentials.

Allocation commands use row locks or an equivalent SQL Server concurrency mechanism. Publication runs as one transaction. Flag clearing, inventory adjustment, and correction are distinct commands.

Each correction request has a client-generated command ID. `corrections.command_id` is unique. Retrying the same command ID and payload returns the stored correction. Reusing it with a different payload is rejected. This contract is separate from `processed_operations`, which belongs to PowerSync field uploads.

The POC has no admin authentication. This is acceptable only for local and controlled test environments.

## 11. Local environment

Docker Compose shall run:

- SQL Server 2022 Developer as the source database
- PostgreSQL as PowerSync bucket storage
- PowerSync Service
- TypeScript API
- Static field and admin app servers for E2E testing

Database data uses named volumes. Runtime database files are not baked into container images. Initialization scripts create the schema, enable CDC on the database and replicated tables, and create least-privilege service users.

## 12. Azure SQL validation

After local acceptance, the primary multi-client conflict scenario runs against a temporary Azure SQL Database tier that supports CDC. Secrets remain in local or CI secret stores and never enter source, logs, URLs, screenshots, or test artifacts.

The Azure run records:

- Connection and CDC setup outcome
- Source-to-client replication latency
- Client upload and convergence latency
- Any behavior differing from local SQL Server

## 13. Main risks

| Risk | Response |
|---|---|
| SQL Server support is beta | Gate all UI work behind a minimal CDC and round-trip spike. |
| Browser storage behaves differently on Android | Require physical offline cold-start and restart evidence. |
| Client parameters are mistaken for security | State clearly that team selection is not authorization. |
| A business conflict blocks the FIFO queue | Record expected conflicts and acknowledge their operation. |
| Claims or pickups count twice | Use explicit claim states and idempotent pickup effects. |
| Service worker caching hides stale application code | Version the shell and test upgrade behavior after the core POC works. |
| Headless tests pass while the device fails | Keep the Android gate independent from CI. |

## 14. Intentional omissions

This design does not cover production authentication, tenancy, authorization, deployment, monitoring, backups, retention, disaster recovery, or support procedures. Those decisions belong to a production design only if the POC passes.
