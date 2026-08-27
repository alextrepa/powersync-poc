# Implementation decisions

This log records decisions made under the user's instruction to continue without blocking for clarification. These are POC choices, not production recommendations.

## D-001: npm workspaces and Node 22 containers

Use npm workspaces because npm is already available on the development machine while Corepack and pnpm are not. Pin Node 22 in every JavaScript container so host Node versions do not affect builds.

## D-002: Fastify, Zod, and direct SQL Server access

Use Fastify for the HTTP API, Zod for public command validation, and the `mssql` driver behind typed repositories. Avoid an ORM because SQL Server CDC setup, transactional locking, projections, and append-only corrections are clearer in explicit SQL for this POC.

## D-003: Development-only PowerSync identity

The POC has no user login. The API mints short-lived HS256 PowerSync tokens using a development-only shared key kept outside source control. The field client uses parameterized Sync Streams for plan and team selection. This is a data-filtering mechanism, not authorization.

## D-004: Persistent packages through Sync Stream subscriptions

Use an on-demand stream keyed by published plan ID and team number. Subscriptions retain downloaded data through their TTL, while every field query still filters by the active plan and team.

## D-005: Container boundary

Run both frontends, API, SQL Server, PostgreSQL bucket storage, PowerSync, reverse proxy, and Playwright runner in Docker Compose. Browser-owned SQLite remains inside the browser. The Azure gate replaces only the local SQL Server container.

## D-006: Private remote access

Implement Tailscale as an optional Compose profile using a containerized node and tailnet-only Serve configuration. Do not enable Funnel. The user explicitly deferred live Tailscale testing.

## D-007: Review intensity

Use critical intensity for adversarial reviews because the POC tests data-loss and concurrency behavior. Fix validated findings in scope before continuing.

## D-008: Default local gateway port 8787

Expose the single local HTTP gateway at `http://localhost:8787`, configurable with `APP_PORT`. Port 8080 was already occupied by another local container, so this avoids interfering with unrelated infrastructure while preserving one same-origin gateway for the PWA, admin app, API, and PowerSync.

## D-009: Negative recorded inventory represents an unresolved physical discrepancy

Allow a lot's recorded quantity to become negative when synchronized physical pickups exceed the last known count. Rejecting the second pickup would discard a field fact. The backend instead preserves both immutable pickups, creates an overdraw exception visible to every affected team, and leaves the office to append a correction after checking the physical lot.

## D-010: Temporary Azure SQL uses Standard S3

Provision the optional Azure gate as a dedicated Standard S3 database. Current Microsoft documentation excludes Free, Basic, and Standard S0-S2 from CDC support; S3 is the smallest unambiguous DTU choice for this disposable test. The resource group must use the `canopy-powersync-poc-` prefix, and cleanup requires an exact-name confirmation variable.

## D-011: Fault injection is local and one-shot

Expose POC-only one-shot response-loss controls when `POC_FAULTS_ENABLED=true`. They fail the HTTP response only after the business transaction commits, which tests the dangerous retry boundary without changing production code paths or relying on timing races. The Compose stack enables them; other deployments default to disabled.

## D-012: No runtime font dependency

Keep the visual hierarchy but use system font fallbacks instead of loading Google Fonts. A cold offline launch must not depend on a third-party font request.

## D-013: Pin the proven PowerSync Service image

Pin the Compose service to the tested PowerSync 1.25.0 image digest instead of `latest`. This keeps the POC evidence reproducible even if the upstream tag moves.

## D-014: Client-stable alternative claim IDs

Generate an alternative claim UUID on the phone and include it in the queued command. This lets the pending local read model expose the claim immediately, so a worker can claim and record the alternative pickup without reconnecting between those actions. The backend still owns validation and idempotent command processing.

## D-015: Pending field operations are an optimistic local projection

Overlay queued claim, cancellation, pickup, flag, and completion commands onto synchronized PowerSync tables. This keeps the POC small while making the operational state honest during a full offline shift. The server projection replaces the overlay after upload and synchronization.

## D-016: Real-stack browser tests use one worker

Run Playwright files through one worker because the POC deliberately exposes one shared, one-shot fault injector. Multi-device concurrency is still tested explicitly with isolated browser contexts inside the reconnect-order scenarios. Parallel files would let one test consume another test's injected fault and make the suite nondeterministic.

## D-017: Admin corrections retain one uncertain command

Persist the exact pending correction command in admin browser storage before sending it. After an ambiguous response, reconcile against the correction ledger; if reconciliation is unavailable, require the operator to retry that same payload before starting another correction. One pending command is enough for the office-only POC and avoids building a second offline queue.

## D-018: Conflict participants are limited to the effective same-day cohort

Share an overdraw exception with plans and teams whose corrected pickup effects target the lot on the current route's service date. This reaches the workers involved in a field conflict without leaking unrelated historical routes, and groups repeated pickups by plan and team to preserve the participant key.
