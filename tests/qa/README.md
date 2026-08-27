# Manual QA routines

This directory contains repeatable manual checks for the PowerSync field operations POC. A routine is one coherent set of checks with a result that another person can verify. It may cover one feature, part of a feature, or a behavior shared by several features.

Automated tests and manual routines answer different questions. Playwright proves repeatable browser behavior in CI. These routines capture device behavior, operator-visible results, infrastructure observations, and evidence that is awkward or impossible to establish through automation alone.

## Completion rule

A feature is not complete until its change does all of the following:

1. Creates or updates every affected routine.
2. Updates the catalog in this file.
3. Makes the routine executable against the implemented feature.
4. Records a run when the feature requires manual acceptance before completion.

One feature may need several routines. Prefer two focused routines with separate outcomes over one long checklist that can half-pass.

A routine is affected when a change alters its user-visible behavior, prerequisites, fixture data, commands, expected results, pass criteria, or evidence. Create a new routine when no existing routine can produce a single clear result for the new behavior.

A manual run is required before feature completion when the ticket names a manual gate, the behavior depends on a physical device, remote network, container lifecycle, or cloud service, or the acceptance result cannot be established by the real-stack automated suite. Other feature changes must still leave their routines executable, but they do not require a new recorded run unless the reviewer asks for one.

## Routine format

Store one routine per file under `routines/`. Use a stable `QA-NNN` identifier and a numbered kebab-case filename. Do not reuse an identifier after retiring a routine.

Each routine states:

- the user-visible or operational outcome it proves;
- the tickets or features it covers;
- prerequisites and controlled test data;
- ordered steps with observable results;
- exact pass criteria;
- evidence to retain;
- an append-only execution log.

Routine state describes the procedure, not its most recent result:

- `planned` means the feature is not executable yet;
- `executable` means a tester can follow the procedure;
- `retired` means another named routine replaced it or the feature was removed.

Each execution result is `pass`, `fail`, or `blocked`. A blocked run names the missing dependency or environmental problem. Never record a partial run as a pass.

The routines seeded for unimplemented features start as `planned`. Before marking the feature complete, replace any proposed control with its implemented command or UI location, run the procedure end to end, and change the routine to `executable`.

## QA controls

Use stable `just` commands for repeatable fixtures, inspection, and fault injection. Add each command when its first covered feature is implemented:

- `just qa-reset <scenario>` loads a named deterministic fixture and prints its identifiers.
- `just qa-inspect <view>` prints a sanitized authoritative state view for evidence.
- `just qa-fault <mode>` arms or clears a named one-shot failure such as a lost upload response.
- `just qa-command <scenario>` submits a deterministic public API command for retry and payload-mismatch checks that the UI cannot expose safely.
- `just qa-service <service> <action>` controls one Compose service without requiring raw container commands.
- `just remote-start`, `just remote-status`, and `just remote-stop` control private Tailscale access.
- `just azure-start` and `just azure-stop` run or stop the containerized application services against the approved temporary Azure SQL environment. `just azure-clean` removes the temporary cloud resources after evidence capture.

A routine may use a visible application control instead. Name the exact screen and action. Do not leave phrases such as "use the supported control" in an executable routine.

## Running a routine

1. Read the whole routine before changing the environment.
2. Record the build or commit, date, tester, device, browser, and relevant service versions.
3. Start the required environment. For the local POC, use `just start` unless the routine says otherwise.
4. Follow the steps in order and capture the requested evidence.
5. Compare the observations with every pass criterion.
6. Append one row to the execution log.
7. Use `just stop` when the routine is complete unless another routine will reuse the stack.

Store each run's lightweight evidence under `tests/qa/evidence/<QA-ID>/<YYYYMMDD-HHMMSS>/` and link that directory from the execution log. Large recordings and traces may use durable external storage, but the log must contain a stable link and retention owner. A written observation is acceptable only when it includes timestamps and is corroborated by a screenshot, sanitized log, query result, recording, or a second tester's sign-off. Never store passwords, connection strings, Tailscale authentication material, or other secrets in routine files or artifacts.

## Authoring template

```markdown
# QA-NNN: Short outcome

Routine state: planned

Covers: Ticket or feature references

## Outcome

One sentence naming the result this routine proves.

## Preconditions

- Required environment, data, device, and starting state.

## Procedure

1. Action.
   Expected: Observable result.

## Pass criteria

- Every condition that must hold for a pass.

## Evidence

- Exact artifacts or observations to retain.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
```

## Routine catalog

| ID | Routine | State | Primary coverage |
|---|---|---|---|
| QA-001 | [Containerized stack lifecycle](routines/01-containerized-stack-lifecycle.md) | Executable | Ticket 01 |
| QA-002 | [SQL Server and PowerSync round trip](routines/02-sql-server-powersync-round-trip.md) | Executable | Tickets 02 and 03 |
| QA-003 | [Inventory planning and publication](routines/03-inventory-planning-publication.md) | Executable | Tickets 04 and 05 |
| QA-004 | [Team-day offline readiness](routines/04-team-day-offline-readiness.md) | Executable | Ticket 06 |
| QA-005 | [Planned and short pickup workflow](routines/05-planned-short-pickups.md) | Executable | Tickets 07 and 08 |
| QA-006 | [Alternative lot claims](routines/06-alternative-lot-claims.md) | Executable | Ticket 09 |
| QA-007 | [Concurrent team conflicts](routines/07-concurrent-team-conflicts.md) | Executable | Ticket 10 |
| QA-008 | [Administrative corrections](routines/08-administrative-corrections.md) | Executable | Ticket 11 |
| QA-009 | [Interruption and recovery](routines/09-interruption-recovery.md) | Executable | Ticket 12 |
| QA-010 | [Private Tailscale access](routines/10-private-tailscale-access.md) | Executable | Ticket 13 |
| QA-011 | [Android offline persistence](routines/11-android-offline-persistence.md) | Executable | Ticket 15 |
| QA-012 | [Azure SQL compatibility](routines/12-azure-sql-compatibility.md) | Executable | Ticket 16 |
| QA-013 | [Integrity and retry guardrails](routines/13-integrity-retry-guardrails.md) | Executable | Tickets 05, 09, 10, 11, and 12 |
| QA-014 | [Automated qualification evidence](routines/14-automated-qualification-evidence.md) | Executable | Ticket 14 |

Ticket 17 consumes the execution logs from this catalog in the final decision report.
