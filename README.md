# PowerSync field operations POC

This repository implements a proof of concept for offline field pickup work with PowerSync. Field teams receive a complete day's truck assignments, continue working with poor connectivity, and synchronize pickups, alternative claims, lot flags, and conflicts when a connection returns.

The POC is deliberately narrow. Its purpose is to determine whether PowerSync behaves reliably enough with SQL Server and Azure SQL for this workflow. A negative result is valid.

## What is implemented

- A phone-first installable field PWA backed by persistent browser SQLite and PowerSync Sync Streams.
- An office admin console for inventory, flags, multi-truck plans, deterministic team splitting, field activity, exceptions, and append-only corrections.
- A Fastify API and SQL Server domain model with CDC, transactional reservations, immutable physical facts, stable operation IDs, and explicit conflict records.
- Self-hosted PowerSync with private PostgreSQL bucket storage.
- A same-origin Nginx gateway, optional tailnet-only Tailscale Serve container, and a complete Docker Compose stack.
- Chromium tests that use the real SQL Server, PowerSync, browser SQLite, service worker, API, and both applications.

## Start locally

Requirements: Docker Desktop (or Docker Engine with Compose), Just, and a machine able to run the `linux/amd64` SQL Server image.

```powershell
Copy-Item .env.example .env
just start
```

Open:

- Field PWA: `http://localhost:8787/`
- Admin console: `http://localhost:8787/admin/`

`APP_PORT` in `.env` changes the host port. `just stop` stops the project without deleting the SQL Server, PowerSync storage, or Tailscale named volumes.

## Verify

```powershell
just check
just e2e
just e2e-recovery
just e2e-interruption
just e2e-convergence 20
```

The real-stack suite proves download into local browser SQLite, a complete persistent-profile restart offline, locally projected claims and flags, queued pickup upload after reconnection, pre-commit and lost-response retries, simultaneous API/PowerSync interruption, cross-plan availability, two-team overdraw preservation, shared exceptions, and append-only corrections. CI runs the same checks, scans artifacts for configured secrets, and retains qualification evidence.

Manual checks live under [`tests/qa`](tests/qa/README.md). `just qa-reset <scenario>` creates isolated public-API fixtures and prints their IDs; `just qa-inspect <view>` prints authoritative state.

## Private phone access

Set a reusable or ephemeral `TAILSCALE_AUTHKEY` in `.env`, then run:

```powershell
just remote-start
just remote-status
```

The optional Tailscale container shares the gateway network namespace and exposes port 8787 with tailnet-only Serve; Funnel is not configured. This path is implemented but intentionally not live-tested in this POC run. Use `just remote-stop` when finished.

## Azure SQL gate

Azure SQL is a separate qualification gate. The repository includes a guarded Bicep deployment for a temporary S3 database, CDC/schema preparation, an Azure Compose override, and cleanup. S3 was selected because Azure SQL CDC is unsupported on Free, Basic, and Standard S0-S2 tiers.

1. Copy the Azure variables from `.env.example` into the current process through approved secret storage. Do not commit them.
2. Run `just azure-provision`, then `just azure-prepare`.
3. Set `AZURE_POWERSYNC_SOURCE_URI` with URL-encoded credentials and run `just azure-start`.
4. Follow QA-012 in `tests/qa/routines/12-azure-sql-compatibility.md`.
5. Run `just azure-stop`. Set `AZURE_CLEAN_CONFIRM` to the exact dedicated `canopy-powersync-poc-*` resource group and run `just azure-clean`.

No Azure resource was provisioned or tested in this local implementation run.

## Documents

- [Product specification](docs/product-spec.md)
- [Technical design](docs/technical-design.md)
- [Verification plan](docs/test-plan.md)
- [Manual QA routines](tests/qa/README.md)
- [Implementation decisions](docs/implementation-decisions.md)
- [Implementation backlog](BACKLOG.md)

## Stack

- React, TypeScript, Vite, and TanStack Router for the field and admin apps
- PowerSync Web and persistent browser SQLite for the field PWA
- A TypeScript API for field uploads and administrative commands
- SQL Server 2022 Developer in Docker as the local business database
- Azure SQL Database as the final compatibility gate
- Self-hosted PowerSync Service with private PostgreSQL bucket storage
- Playwright for multi-client Chromium scenarios

## Status

The local Docker and Chromium gates pass. Physical Android persistence, Azure SQL behavior, and Tailscale reachability remain manual external gates; the decision report therefore treats the POC as locally proven but not yet client-presentable as a final platform qualification.
