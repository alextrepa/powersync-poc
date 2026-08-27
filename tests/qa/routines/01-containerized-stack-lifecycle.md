# QA-001: Containerized stack lifecycle

Routine state: executable

Covers: [Ticket 01](../../../.scratch/powersync-field-operations-poc/issues/01-run-containerized-poc-stack.md)

## Outcome

The complete local POC starts and stops through `just`, reports healthy services, and retains database state across an ordinary restart.

## Preconditions

- Docker and Just are installed and running.
- Required local environment values exist outside source control.
- No previous POC containers are running.
- `just qa-reset stack-lifecycle` and the `business-probe` and `powersync-checkpoint` inspection views exist before this routine becomes executable.

## Procedure

1. Run `just start` from the repository root.
   Expected: Compose builds or pulls the required images, starts the full stack, waits for health checks, and exits successfully.
2. Inspect the Compose project.
   Expected: Both frontends, the API, SQL Server, PowerSync, PostgreSQL bucket storage, and the browser test runner are present. Every required long-running service is healthy.
3. Open the field and admin URLs reported by the start command.
   Expected: Both application shells load without a host-installed JavaScript runtime.
4. Run `just qa-reset stack-lifecycle`, then run `just qa-inspect business-probe` and `just qa-inspect powersync-checkpoint`.
   Expected: The business probe exists in SQL Server, and the PowerSync bucket checkpoint view returns a stable checkpoint identity from PostgreSQL.
5. Run `just stop`.
   Expected: All project containers stop, and named volumes remain.
6. Run `just start` again, then repeat both inspection commands.
   Expected: The stack becomes healthy, the SQL Server probe still exists, and PostgreSQL reports the same or a later checkpoint without rebuilding its state from an empty store.
7. Run `just stop` once more.
   Expected: No POC container remains running.

## Pass criteria

- The two lifecycle commands control the complete stack without manual container commands.
- Every required service reaches its declared healthy state.
- Both frontends are reachable.
- The SQL Server business probe and PostgreSQL PowerSync checkpoint survive stop and restart.
- No secret appears in terminal output, application pages, or retained logs.

## Evidence

- Sanitized output from both start operations and the final stop.
- Compose service and health summary.
- Screenshot of each application shell.
- Before-and-after outputs for the SQL Server business probe and PostgreSQL PowerSync checkpoint.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
